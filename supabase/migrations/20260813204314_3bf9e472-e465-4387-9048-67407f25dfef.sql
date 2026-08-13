-- ============================================================================
-- MULTIPLE DISCORD WEBHOOKS PER AGENCY
--
--   `discord_integrations` was keyed by organization_id, which is what limited
--   an agency to exactly one channel. Give each connection its own id and let
--   organization_id repeat.
--
--   The delivery ledger doubles as the idempotency guard. Its unique index was
--   (policy_id, event_type) — correct for one webhook, but with several it
--   would let the FIRST channel announce a deal and then treat every other
--   channel's announcement as a duplicate. The index has to include the
--   integration.
-- ============================================================================

alter table public.discord_integrations
  add column if not exists id uuid not null default gen_random_uuid();

alter table public.discord_integrations
  drop constraint if exists discord_integrations_pkey;

alter table public.discord_integrations
  add constraint discord_integrations_pkey primary key (id);

create index if not exists idx_discord_integrations_org
  on public.discord_integrations(organization_id, created_at);

-- Same channel twice is always a mistake: it would double-post every deal.
create unique index if not exists idx_discord_integration_unique_hook
  on public.discord_integrations(organization_id, webhook_url);

alter table public.discord_deliveries
  add column if not exists integration_id uuid
    references public.discord_integrations(id) on delete set null;

create index if not exists idx_discord_deliveries_integration
  on public.discord_deliveries(integration_id, created_at desc);

-- One announcement per policy PER CHANNEL. Rows written before this migration
-- have a null integration_id; `coalesce` keeps them under a single stable key
-- so history stays deduplicated instead of suddenly re-announceable.
drop index if exists idx_discord_once_per_policy;
create unique index if not exists idx_discord_once_per_policy
  on public.discord_deliveries(
    policy_id, event_type, coalesce(integration_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where policy_id is not null and status = 'sent';
