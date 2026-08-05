-- ============================================================================
-- THE DEMO AGENCY IS A TENANT, NOT A MODE
--
-- Summit Life Partners is an ordinary row in `organizations` with ordinary
-- memberships, ordinary RLS and ordinary data. Nothing about it is special-
-- cased in the query layer. If the demo breaks, production is broken — that is
-- the point of building it this way, and the reason there is no `if (demo)`
-- anywhere near a select.
--
-- What this migration adds is the small amount of state that cannot be
-- inferred:
--
--   1. `organizations.is_demo` — one flag, three readers: the guardrails that
--      refuse to send real email from a demo, the banner that tells the visitor
--      what they are looking at, and the nightly reset that decides what to
--      wipe. A slug would have worked until somebody renamed it.
--   2. `demo_reset_log` — a reset that fails silently is a demo that quietly
--      fills with a stranger's typing. Every run writes a row whether it
--      succeeds or not.
--
-- The guardrails themselves are deliberately NOT enforced here. Blocking
-- outbound email with an RLS policy would mean encoding "this is an email
-- send" in the database, which it is not — the send happens in a server
-- function against a third party. They live at the call sites, in
-- `src/lib/demo.server.ts`, where the thing being blocked actually happens.
-- ============================================================================

alter table public.organizations
  add column if not exists is_demo boolean not null default false;

comment on column public.organizations.is_demo is
  'Public demo tenant. Reads and most writes behave normally; outbound email, billing, invites and webhooks are refused, and the whole org is reset nightly. Set on exactly one organization.';

-- One demo org, enforced. Two would mean a nightly reset that wipes the wrong
-- one, and nothing else in the system would notice.
-- Unique on the column itself, filtered to the true rows: at most one row can
-- carry `true`, and rows carrying `false` are not in the index at all.
create unique index if not exists organizations_one_demo
  on public.organizations (is_demo) where is_demo;

-- ── The reset log ───────────────────────────────────────────────────────────

create table if not exists public.demo_reset_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- 'running' exists so a reset that dies mid-flight is distinguishable from
  -- one that never started. A row stuck in 'running' is the signal.
  status text not null default 'running' check (status in ('running', 'ok', 'failed')),
  detail text,
  rows_cleared integer
);

comment on table public.demo_reset_log is
  'One row per nightly demo reset. A stuck ''running'' row means a reset died part-way; a ''failed'' row carries the reason.';

create index if not exists idx_demo_reset_log_started
  on public.demo_reset_log (started_at desc);

alter table public.demo_reset_log enable row level security;

-- Only platform admins. The log can carry a database error message, which is
-- not something to hand to a visitor poking at the demo.
drop policy if exists demo_reset_log_admin_read on public.demo_reset_log;
create policy demo_reset_log_admin_read on public.demo_reset_log
  for select to authenticated
  using (public.is_platform_admin());

-- No insert/update policy: the reset endpoint writes with the service role.

-- ── Scheduling ──────────────────────────────────────────────────────────────
--
-- The reset re-runs the seed, which is TypeScript, so pg_cron cannot do the
-- work itself — it can only knock on the door. The endpoint is
-- POST /api/public/hooks/demo-reset, authenticated by the project's publishable
-- key in the `apikey` header, exactly like run-automations.
--
-- This is left commented rather than executed for the same reason the email
-- queue's schedule is: it needs the site origin and a key from vault, neither
-- of which belongs in a migration file in a public repository. Run it once, by
-- hand, with the real values:
--
--   select cron.schedule(
--     'demo-nightly-reset',
--     '0 8 * * *',                       -- 03:00 US Central, in UTC
--     $$
--     select net.http_post(
--       url     := 'https://useagentcloud.com/api/public/hooks/demo-reset',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'apikey', (select decrypted_secret from vault.decrypted_secrets
--                     where name = 'demo_reset_key')
--       ),
--       body    := '{}'::jsonb
--     );
--     $$
--   );
--
--   To revert: select cron.unschedule('demo-nightly-reset');
--
-- If pg_cron is unavailable on this project, any external scheduler hitting the
-- same URL with the same header works — the endpoint does not care who called
-- it, only that the key matches.
