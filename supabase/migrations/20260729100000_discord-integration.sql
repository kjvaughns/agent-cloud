-- ============================================================================
-- DISCORD SALES BOT
--
--   Per-agency Discord webhook so a posted deal announces itself in the
--   agency's own server.
--
--   Stored per organization, never globally: one agency's webhook must never
--   be reachable by another. The URL is a bearer credential — anyone holding
--   it can post to that channel — so it is readable only by the org owner,
--   and the send path runs server-side so it never reaches a browser.
--
-- Run after 20260728100000_owner-consolidation.sql.
-- ============================================================================

create table if not exists public.discord_integrations (
  organization_id uuid primary key references public.organizations(id) on delete cascade,

  webhook_url text not null,
  channel_label text,

  enabled boolean not null default true,

  -- Which events announce. Deals are the point; the rest are opt-in so a
  -- sales channel does not fill with admin noise.
  post_deals boolean not null default true,
  post_milestones boolean not null default false,
  post_new_agents boolean not null default false,

  -- Announce only deals at or above this annual premium. 0 posts everything.
  min_annual_premium numeric not null default 0,

  last_success_at timestamptz,
  last_error text,
  last_error_at timestamptz,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.discord_integrations enable row level security;

-- Owner only. The webhook URL is a credential, not configuration — an agent
-- who could read it could post to the agency channel from anywhere.
drop policy if exists discord_integrations_owner on public.discord_integrations;
create policy discord_integrations_owner on public.discord_integrations
  for all to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

-- Delivery ledger. Doubles as the idempotency guard: one announcement per
-- policy, so a retry or a double-submit cannot post the same deal twice.
create table if not exists public.discord_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,

  event_type text not null,
  policy_id uuid references public.policies(id) on delete set null,

  status text not null default 'sent' check (status in ('sent','failed','skipped')),
  http_status integer,
  error text,

  created_at timestamptz not null default now()
);

create unique index if not exists idx_discord_once_per_policy
  on public.discord_deliveries(policy_id, event_type)
  where policy_id is not null and status = 'sent';

create index if not exists idx_discord_deliveries_org
  on public.discord_deliveries(organization_id, created_at desc);

alter table public.discord_deliveries enable row level security;

drop policy if exists discord_deliveries_read on public.discord_deliveries;
create policy discord_deliveries_read on public.discord_deliveries
  for select to authenticated
  using (
    organization_id is not null
    and organization_id in (select public.my_org_ids())
    and public.is_org_owner(organization_id)
  );
-- Writes are service-role only: a delivery record is evidence of what the
-- platform did, and a user should not be able to forge or suppress one.
