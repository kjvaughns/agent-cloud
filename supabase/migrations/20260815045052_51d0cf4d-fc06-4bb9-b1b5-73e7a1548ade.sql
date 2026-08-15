alter table public.discord_integrations
  add column if not exists name text,
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists next_retry_at timestamptz;

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

create index if not exists idx_discord_integrations_retry
  on public.discord_integrations (organization_id, enabled, next_retry_at);

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