-- ============================================================================
-- LANDING PAGE — DEMO REQUESTS
--
--   Lead capture for the marketing site. Submitted by unauthenticated
--   visitors, so writes go through the service role behind the same
--   rate limiter as the other public endpoints.
--
-- Run after 20260724100000_phase7-cleanup-plans.sql.
-- ============================================================================

create table if not exists public.demo_requests (
  id uuid primary key default gen_random_uuid(),

  first_name text not null,
  last_name  text not null,
  email      text not null,
  phone      text,

  agency_name text,
  agent_count text,
  current_tools text,
  primary_challenge text,
  preferred_time text,

  -- Attribution. Captured from the querystring at submit time.
  source text,
  utm jsonb,

  status text not null default 'new'
    check (status in ('new','contacted','qualified','demo_booked','won','lost')),
  assigned_to uuid references public.profiles(id) on delete set null,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_demo_requests_status
  on public.demo_requests(status, created_at desc);
create index if not exists idx_demo_requests_email
  on public.demo_requests(lower(email));

alter table public.demo_requests enable row level security;

-- Platform staff only. These are inbound sales leads, not agency data, so
-- they are deliberately NOT org-scoped — no tenant should read them.
drop policy if exists demo_requests_platform on public.demo_requests;
create policy demo_requests_platform on public.demo_requests
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Inserts come from the public endpoint via the service role, which bypasses
-- RLS. anon and authenticated get no direct write path.
revoke insert on public.demo_requests from anon, authenticated;

create or replace function public.touch_demo_request()
returns trigger language plpgsql set search_path = public
as $$ begin NEW.updated_at := now(); return NEW; end $$;

drop trigger if exists trg_touch_demo_request on public.demo_requests;
create trigger trg_touch_demo_request
  before update on public.demo_requests
  for each row execute function public.touch_demo_request();
