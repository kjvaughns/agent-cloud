-- 20260814210000_compensation-single-source.sql

-- ── The five allowed advance options ───────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'advance_option') then
    create type public.advance_option as enum
      ('as_earned', '3_months', '6_months', '9_months', '12_months');
  end if;
end $$;

-- ── Agency carrier controls ────────────────────────────────────────────────

alter table public.org_carriers
  add column if not exists enabled boolean not null default true,
  add column if not exists visible_to_agents boolean not null default true,
  add column if not exists requestable_by_agents boolean not null default true,
  add column if not exists available_for_post_deal boolean not null default true,
  add column if not exists default_advance_option public.advance_option;

comment on column public.org_carriers.default_advance_option is
  'Deliberately nullable with no default. A carrier without one is not configured, and the resolver refuses rather than assuming terms nobody agreed.';

-- ── Overrides at each rung of the ladder ───────────────────────────────────

alter table public.agency_level_carrier_mappings
  add column if not exists advance_option public.advance_option;

alter table public.agent_commission_levels
  add column if not exists advance_option public.advance_option,
  add column if not exists status text not null default 'active';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agent_commission_levels_status_check') then
    alter table public.agent_commission_levels
      add constraint agent_commission_levels_status_check
      check (status in ('active', 'pending', 'terminated', 'superseded'));
  end if;
end $$;

update public.agent_commission_levels
   set status = 'pending'
 where pending is true and status = 'active';

-- ── Constraints the old shape allowed to be violated ───────────────────────

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agency_levels_sort_order_check') then
    alter table public.agency_levels
      add constraint agency_levels_sort_order_check check (sort_order >= 0);
  end if;
end $$;

-- ── Why a policy earned nothing ────────────────────────────────────────────

create table if not exists public.commission_setup_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  policy_id uuid not null references public.policies(id) on delete cascade,
  agent_id uuid references public.profiles(id) on delete set null,
  org_carrier_id uuid references public.org_carriers(id) on delete set null,
  failures text[] not null default '{}',
  messages text[] not null default '{}',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (policy_id)
);

create index if not exists idx_commission_setup_issues_open
  on public.commission_setup_issues(organization_id, created_at desc)
  where resolved_at is null;

alter table public.commission_setup_issues enable row level security;

drop policy if exists commission_setup_issues_read on public.commission_setup_issues;
create policy commission_setup_issues_read on public.commission_setup_issues
  for select to authenticated
  using (
    agent_id = auth.uid()
    or organization_id in (select public.my_org_ids())
  );

drop policy if exists commission_setup_issues_write on public.commission_setup_issues;
create policy commission_setup_issues_write on public.commission_setup_issues
  for all to authenticated
  using (
    (organization_id is not null and public.is_org_owner(organization_id))
    or public.is_platform_admin()
  );

create index if not exists idx_agency_level_mappings_lookup
  on public.agency_level_carrier_mappings(agency_level_id, org_carrier_id);
create index if not exists idx_agent_commission_levels_lookup
  on public.agent_commission_levels(agent_id, carrier_id, status);
create index if not exists idx_profiles_agency_level
  on public.profiles(agency_level_id) where agency_level_id is not null;

notify pgrst, 'reload schema';

-- 20260814220000_commission-idempotency.sql

alter table public.commission_schedule
  add column if not exists idempotency_key text,
  add column if not exists superseded_at timestamptz,
  add column if not exists calc_run_id uuid;

update public.commission_schedule
   set idempotency_key = concat_ws(
         ':', policy_id::text, agent_id::text, payment_type,
         payment_date::text, coalesce(month_number, 0)::text)
 where idempotency_key is null;

create unique index if not exists uq_commission_schedule_idempotency
  on public.commission_schedule(idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_commission_schedule_live
  on public.commission_schedule(policy_id, agent_id)
  where superseded_at is null;

comment on column public.commission_schedule.idempotency_key is
  'Stable across recalculation: policy:agent:type:date:month. Identifies the intended payment, never the attempt that wrote it.';
comment on column public.commission_schedule.superseded_at is
  'Set when a recalculation no longer produces this leg. The row stays readable so an agent can be told what changed; every sum must exclude it.';

notify pgrst, 'reload schema';

-- 20260814230000_policy-events.sql

create table if not exists public.policy_events (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  client_id uuid,
  organization_id uuid,
  agent_id uuid,
  kind text not null,
  from_status text,
  to_status text,
  source text,
  note text,
  actor_id uuid,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.policy_events enable row level security;

drop policy if exists policy_events_via_policy on public.policy_events;
create policy policy_events_via_policy on public.policy_events
  for select to authenticated
  using (exists (select 1 from public.policies p where p.id = policy_id));

drop policy if exists policy_events_insert on public.policy_events;
create policy policy_events_insert on public.policy_events
  for insert to authenticated
  with check (exists (select 1 from public.policies p where p.id = policy_id));

create index if not exists idx_policy_events_policy
  on public.policy_events (policy_id, occurred_at desc);
create index if not exists idx_policy_events_client
  on public.policy_events (client_id, occurred_at desc);

create unique index if not exists policy_events_seed_uniq
  on public.policy_events (policy_id, kind)
  where kind in ('posted', 'effective');

create or replace function public.record_policy_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.policy_events (
    policy_id, client_id, organization_id, agent_id,
    kind, from_status, to_status, source, actor_id, occurred_at
  )
  values (
    new.id,
    new.client_id,
    new.organization_id,
    new.agent_id,
    'status_change',
    old.status::text,
    new.status::text,
    case
      when new.sync_source is distinct from old.sync_source and new.sync_source is not null
        then new.sync_source
      else 'app'
    end,
    auth.uid(),
    now()
  );
  return new;
end $$;

drop trigger if exists trg_policy_events_status on public.policies;
create trigger trg_policy_events_status
after update of status on public.policies
for each row
when (old.status is distinct from new.status)
execute function public.record_policy_status_change();

insert into public.policy_events (
  policy_id, client_id, organization_id, agent_id, kind, to_status, source, occurred_at
)
select p.id, p.client_id, p.organization_id, p.agent_id, 'posted', p.status::text, 'backfill', p.posted_at
from public.policies p
where p.posted_at is not null
on conflict do nothing;

insert into public.policy_events (
  policy_id, client_id, organization_id, agent_id, kind, to_status, source, occurred_at
)
select p.id, p.client_id, p.organization_id, p.agent_id, 'effective', p.status::text, 'backfill',
       p.effective_date::timestamptz
from public.policies p
where p.effective_date is not null
on conflict do nothing;

create or replace function public.record_policy_posted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.policy_events (
    policy_id, client_id, organization_id, agent_id,
    kind, to_status, source, actor_id, occurred_at
  )
  values (
    new.id, new.client_id, new.organization_id, new.agent_id,
    'posted', new.status::text, 'app', auth.uid(),
    coalesce(new.posted_at, now())
  )
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_policy_events_posted on public.policies;
create trigger trg_policy_events_posted
after insert on public.policies
for each row
execute function public.record_policy_posted();

notify pgrst, 'reload schema';

-- 20260814240000_discord-announcement-channel.sql

alter table public.discord_integrations
  add column if not exists post_announcements boolean not null default true;

comment on column public.discord_integrations.post_announcements is
  'Whether agency announcements are posted to this channel. Defaults true: before this column existed every enabled channel received them.';

notify pgrst, 'reload schema';