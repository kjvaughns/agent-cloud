-- ---------------------------------------------------------------------------
-- ONE ANSWER TO "WHAT DOES THIS AGENT EARN"
--
-- Two compensation systems had grown up beside each other and neither knew
-- about the other:
--
--   agent_commission_levels.assigned_pct   the per-agent, per-carrier number
--                                          the commission calculator read, and
--                                          the only one it read
--   agency_levels.base_pct                 the promotion ladder the roster
--                                          renders as a position pill, which
--                                          no calculation has ever consulted
--
-- So an agency could build Trainee 60 / Agent 70 / GA 80, see it on every
-- roster row, and still have commissions computed from a number set somewhere
-- else — or, where nothing was set, fall through to a 70 or 75 written into
-- the code. This migration adds the columns the canonical resolver needs so
-- the ladder becomes the default and the per-agent row becomes what it always
-- should have been: an override.
--
-- Nothing is dropped. `agent_commission_levels` keeps every row and every
-- column; it simply stops being the only place an answer can come from. The
-- resolution order is contract override → level-and-carrier mapping → level
-- base percentage → a named configuration error. See
-- src/lib/compensation/resolve.ts, which is the only place that order lives.
--
-- The advance option becomes a constrained value rather than a pair of loose
-- numbers. It was `advance_pct` and `advance_months` on the comp grid, which
-- allowed "43% over 7 months" — a shape no carrier offers — while the code
-- ignored both and used a hard-coded 75/25 split anyway.
-- ---------------------------------------------------------------------------

-- ── The five allowed advance options ───────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'advance_option') then
    create type public.advance_option as enum
      ('as_earned', '3_months', '6_months', '9_months', '12_months');
  end if;
end $$;

-- ── Agency carrier controls ────────────────────────────────────────────────
--
-- `status` already exists and stays as the contracting workflow's own state.
-- These are a different question — not "where is this carrier in setup" but
-- "may an agent see it, ask for it, sell on it" — and conflating the two is
-- why a half-configured carrier could appear in a post-deal picker.
--
-- Defaults are deliberately permissive for visibility and restrictive for
-- nothing: every existing carrier keeps behaving exactly as it does today.
-- The one column with no default is the advance option, because guessing an
-- agency's advance terms is precisely the silent-default problem this fixes.

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

-- The per-agent row is now an override rather than the sole source. `status`
-- lets a contract be history without being terms: only an active one wins.
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

-- A pending row was already modelled by the `pending` boolean. Keep the two
-- consistent for rows that predate `status`, rather than leaving a row that
-- says pending in one column and active in the other.
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
--
-- The calculator used to queue a policy to `commission_backfill_queue` and
-- write a console warning when it could not resolve a percentage. Nobody sees
-- a console warning. This is the same fact, addressed to the two people who
-- need it: the agent wondering why their deal paid nothing, and the owner who
-- can fix it.

create table if not exists public.commission_setup_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  policy_id uuid not null references public.policies(id) on delete cascade,
  agent_id uuid references public.profiles(id) on delete set null,
  org_carrier_id uuid references public.org_carriers(id) on delete set null,
  /** Machine-readable codes from the resolver, so the UI can group them. */
  failures text[] not null default '{}',
  /** The same reasons in words, so nobody has to look up a code. */
  messages text[] not null default '{}',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One open issue per policy: re-posting or retrying must update the reason
  -- rather than stacking another copy of it.
  unique (policy_id)
);

create index if not exists idx_commission_setup_issues_open
  on public.commission_setup_issues(organization_id, created_at desc)
  where resolved_at is null;

alter table public.commission_setup_issues enable row level security;

-- The writing agent sees their own; anyone who can see the agency sees all of
-- them, because fixing the configuration is an owner's job.
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

-- ── Indexes the resolver's reads need ──────────────────────────────────────

create index if not exists idx_agency_level_mappings_lookup
  on public.agency_level_carrier_mappings(agency_level_id, org_carrier_id);
create index if not exists idx_agent_commission_levels_lookup
  on public.agent_commission_levels(agent_id, carrier_id, status);
create index if not exists idx_profiles_agency_level
  on public.profiles(agency_level_id) where agency_level_id is not null;

notify pgrst, 'reload schema';
