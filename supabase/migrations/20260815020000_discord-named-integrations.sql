-- Discord channels become named integrations that report their own health.
--
-- An agency can already connect several Discord channels, each with its own
-- event toggles — that foundation landed in 20260813204314 and 20260814240000.
-- Two things are missing, and both are the difference between a list of
-- webhooks and something an owner can run.
--
-- ── A name ──
--
-- The only label a channel carries is `channel_label`, which answers "which
-- Discord channel is this" — #sales, #recruiting. It does not answer "what is
-- this integration for", and those are different questions: an agency may post
-- deals and new agents to the same channel through two integrations with
-- different premium floors. The Settings list shows three rows that look
-- identical and the owner has to open each one to tell them apart.
--
-- `name` defaults from `channel_label`, so every existing row arrives with the
-- best name available rather than a blank or a placeholder.
--
-- ── Retry status ──
--
-- `last_error` records the most recent failure and nothing tracks whether a
-- channel is failing *repeatedly*. A webhook deleted in Discord returns 404
-- forever, and today the product keeps posting to it on every deal — one
-- doomed HTTP request per deal per channel, indefinitely, with the owner
-- seeing a stale error message that never explains that nothing has arrived
-- for a fortnight.
--
--   consecutive_failures  reset to 0 by any success
--   next_retry_at         when this channel is worth trying again
--
-- Backoff is computed in `src/lib/discord/retry.ts` and stored here rather
-- than derived, because unlike announcement visibility this genuinely is
-- state: "we have failed four times in a row" cannot be worked out from the
-- current time.
--
-- A channel in backoff is skipped, not disabled. Disabling would need somebody
-- to notice and turn it back on; skipping recovers by itself the moment the
-- webhook works again, and the ledger still records the skip so the gap is
-- visible rather than silent.
--
-- Forward only. Nothing is dropped, every existing channel keeps every value
-- it has, and one that has never failed arrives at zero failures and no
-- backoff — which is exactly its behaviour today.

alter table public.discord_integrations
  add column if not exists name text,
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists next_retry_at timestamptz;

-- Existing rows take the best name already on the row. `channel_label` is
-- nullable, so the coalesce chain ends somewhere honest rather than at null.
update public.discord_integrations
   set name = coalesce(nullif(btrim(channel_label), ''), 'Discord channel')
 where name is null;

alter table public.discord_integrations
  alter column name set default 'Discord channel';

do $$
begin
  if not exists (
    select 1 from public.discord_integrations where name is null or btrim(name) = ''
  ) then
    alter table public.discord_integrations alter column name set not null;
  else
    raise notice 'discord_integrations.name left nullable: some rows are still blank';
  end if;
exception
  when others then
    raise notice 'discord_integrations.name not-null: %', sqlerrm;
end $$;

do $$
begin
  -- A negative failure count would make the backoff arithmetic nonsense.
  if not exists (
    select 1 from pg_constraint where conname = 'discord_integrations_failures_non_negative'
  ) then
    alter table public.discord_integrations
      add constraint discord_integrations_failures_non_negative
      check (consecutive_failures >= 0);
  end if;
end $$;

comment on column public.discord_integrations.name is
  'What this integration is for — Sales Bot, Recruiting Bot. Distinct from channel_label, which is where it posts.';
comment on column public.discord_integrations.consecutive_failures is
  'Reset to 0 by any success. Drives the backoff in src/lib/discord/retry.ts.';
comment on column public.discord_integrations.next_retry_at is
  'While in the future this channel is skipped rather than disabled, so it recovers by itself when the webhook works again.';

-- The sender asks "which channels want this event and are not in backoff" on
-- every deal, so the answer should not be a sequential scan.
create index if not exists idx_discord_integrations_retry
  on public.discord_integrations (organization_id, enabled, next_retry_at);

-- ── The ledger learns about retries ──
--
-- `discord_deliveries` records sent / failed / skipped. A skip because the
-- channel is in backoff is a different fact from a skip because the event was
-- not wanted, and an owner chasing "why did this deal not appear" needs to be
-- able to tell them apart.
alter table public.discord_deliveries
  add column if not exists integration_id uuid,
  add column if not exists attempt integer not null default 1,
  add column if not exists skip_reason text;

comment on column public.discord_deliveries.skip_reason is
  'Why a skipped row was skipped: not_subscribed, below_minimum, in_backoff. A skip with no reason is indistinguishable from a silent drop.';

create index if not exists idx_discord_deliveries_integration
  on public.discord_deliveries (integration_id, created_at desc)
  where integration_id is not null;

notify pgrst, 'reload schema';
