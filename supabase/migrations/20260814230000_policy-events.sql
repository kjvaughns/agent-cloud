-- A policy remembers what happened to it.
--
-- Today it does not. `policies.status` is a single column that three different
-- paths overwrite — the book-of-business detail sheet, a bulk carrier CSV
-- sync, and the pipeline drawer's general policy patch — and none of them
-- records what the status was before, who changed it, or when. So a policy
-- that went active, lapsed, had retention work done on it and came back active
-- looks identical to one that has been active since the day it was written.
--
-- That is not a reporting nicety. It is the difference between an agent being
-- able to say "the carrier marked this lapsed on the 3rd and I fixed it on the
-- 9th" and having to take somebody's word for it, and it is the only way a
-- chargeback conversation can be settled from the product rather than from
-- memory.
--
-- ── Why a trigger and not application code ──
--
-- Three writers exist today and nothing stops a fourth. A trigger on the
-- column is the only place that cannot be forgotten: it fires for the bulk
-- carrier sync (which updates many rows in one statement, grouped by status),
-- for the detail sheet, for the drawer, and for anything added later, whether
-- it goes through a server function or an admin client.
--
-- `policies` already carries `trg_policy_status_followups`, an
-- `AFTER UPDATE OF status` trigger, so this is a sibling of an established
-- pattern rather than a new mechanism.
--
-- ── The actor ──
--
-- `auth.uid()` inside the trigger is the caller when the write came through an
-- RLS-bound client, which is how every server function in this codebase reads
-- and writes on a user's behalf. A write made with the service-role client
-- records a null actor rather than guessing — an unattributed event is honest;
-- an event attributed to the wrong person is worse than none.
--
-- `source` carries `policies.sync_source` when the same update set it, so a
-- status that came from a carrier file says so instead of looking like
-- somebody clicked it.
--
-- ── Backfill ──
--
-- Every existing policy is seeded with the two events its own columns already
-- record: when it was posted, and when it took effect. Without that, opening a
-- policy written last year would show an empty history, which reads as "nothing
-- has happened" rather than "we only started recording today". The seed is
-- guarded by a partial unique index so re-running this migration adds nothing.
--
-- Forward only. Nothing is dropped and no existing row is modified.

create table if not exists public.policy_events (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  -- Denormalised so a client's whole timeline is one query rather than a join
  -- per policy, and so an event survives in a readable form.
  client_id uuid,
  organization_id uuid,
  agent_id uuid,
  -- 'posted' | 'effective' | 'status_change' | 'note'
  kind text not null,
  from_status text,
  to_status text,
  -- 'app', 'carrier_csv:<file name>', 'backfill', 'import'
  source text,
  note text,
  actor_id uuid,
  -- When the thing happened, which is not always when the row was written:
  -- the backfill dates its events from the policy's own columns.
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.policy_events enable row level security;

-- Inherits the policy's own visibility, the same shape `beneficiaries_via_client`
-- uses for clients. `policies` is org-scoped and hierarchy-scoped already, so
-- an event is visible to exactly the people who can see the policy it belongs
-- to, and nothing here has to restate that boundary.
drop policy if exists policy_events_via_policy on public.policy_events;
create policy policy_events_via_policy on public.policy_events
  for select to authenticated
  using (exists (select 1 from public.policies p where p.id = policy_id));

-- Written by the trigger (security definer) and by server functions recording
-- a note. Insert is allowed for a policy the caller can see; nothing may be
-- updated or deleted, because a history somebody can edit is not a history.
drop policy if exists policy_events_insert on public.policy_events;
create policy policy_events_insert on public.policy_events
  for insert to authenticated
  with check (exists (select 1 from public.policies p where p.id = policy_id));

create index if not exists idx_policy_events_policy
  on public.policy_events (policy_id, occurred_at desc);
create index if not exists idx_policy_events_client
  on public.policy_events (client_id, occurred_at desc);

-- One 'posted' and one 'effective' per policy, so the backfill below is
-- idempotent and a second run inserts nothing.
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
    -- A status that arrived with a new sync_source came from that file. One
    -- that did not was set in the app by whoever auth.uid() is.
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

-- ── Backfill: what each policy's own columns already know ───────────────────

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

-- A policy created from now on gets its 'posted' event the same way, so the
-- history does not depend on the backfill having run.
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
