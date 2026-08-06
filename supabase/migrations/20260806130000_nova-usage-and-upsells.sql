-- ============================================================================
-- NOVA TRIAL USAGE + UPSELL INSTRUMENTATION
--
-- Two small tables that belong together: one records that somebody took their
-- free run of a gated feature, the other records whether the cards offering it
-- were worth showing.
--
-- ── The failure mode this table must not cause ──────────────────────────────
--
-- nova_feature_usage decides whether a free user has already had their one run.
-- Migrations here are applied by hand, so there is a window where the code is
-- live and the table is not — and in that window the gate FAILS OPEN. See
-- resolveAccess() in src/lib/nova-features.ts.
--
-- That is deliberate and it is the whole reason this header exists: blocking
-- would mean denying somebody a feature because an audit table was late. The
-- cost of failing open is a free run. The cost of failing closed is a support
-- ticket from a customer who paid.
--
-- ── Why the events table is separate from the usage table ───────────────────
--
-- Usage is a fact about entitlement — it decides what somebody may do, and it
-- must be exact. Impressions are analytics, they arrive in volume, and losing
-- some of them costs nothing. Putting them in one table would either make the
-- entitlement check scan a million analytics rows or make the analytics
-- writes as careful as an entitlement write. Neither is worth it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TRIAL USAGE
-- ---------------------------------------------------------------------------

create table if not exists public.nova_feature_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,

  -- Matches NovaFeature in src/lib/nova-features.ts. Deliberately not a CHECK
  -- constraint: the gated set is a product decision that will change, and a
  -- CHECK here would mean a migration every time somebody adds a feature to
  -- the list. An unknown value costs a row nothing reads.
  feature text not null,

  used_at timestamptz not null default now()
);

create index if not exists idx_nova_usage_lookup
  on public.nova_feature_usage(user_id, feature, used_at desc);

-- No update, no delete. A trial run that can be deleted is not a limit.
grant select, insert on public.nova_feature_usage to authenticated;
grant all on public.nova_feature_usage to service_role;

alter table public.nova_feature_usage enable row level security;

-- Read your own. An agency owner does not need to see who took a free run —
-- it is an entitlement fact about one person, not agency business.
drop policy if exists nova_feature_usage_read on public.nova_feature_usage;
create policy nova_feature_usage_read on public.nova_feature_usage
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists nova_feature_usage_insert on public.nova_feature_usage;
create policy nova_feature_usage_insert on public.nova_feature_usage
  for insert to authenticated
  with check (user_id = auth.uid());

comment on table public.nova_feature_usage is
  'One row per free trial run of a gated Nova Pro feature. Append-only. Code fails OPEN when this table is absent — see src/lib/nova-features.ts.';

-- ---------------------------------------------------------------------------
-- 2. UPSELL INSTRUMENTATION
-- ---------------------------------------------------------------------------

create table if not exists public.upsell_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,

  -- Placement.id from src/lib/nova-features.ts.
  placement text not null,
  event text not null check (event in ('impression', 'dismissal', 'click', 'conversion')),

  created_at timestamptz not null default now()
);

-- The query this exists for: conversion rate per placement, so a card that
-- converts below the floor can be found and deleted.
create index if not exists idx_upsell_events_placement
  on public.upsell_events(placement, event, created_at desc);

grant select, insert on public.upsell_events to authenticated;
grant all on public.upsell_events to service_role;

alter table public.upsell_events enable row level security;

-- Read: platform admins only. This is product analytics about our own pricing,
-- not something an agency owner needs, and per-user upsell history is a
-- surveillance-shaped thing to expose to somebody's upline.
drop policy if exists upsell_events_read on public.upsell_events;
create policy upsell_events_read on public.upsell_events
  for select to authenticated
  using (public.is_platform_admin());

drop policy if exists upsell_events_insert on public.upsell_events;
create policy upsell_events_insert on public.upsell_events
  for insert to authenticated
  with check (user_id = auth.uid() or user_id is null);

comment on table public.upsell_events is
  'Impressions, dismissals, clicks and conversions per upsell placement. Read by platform admins only.';
