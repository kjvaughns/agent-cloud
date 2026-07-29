-- ============================================================================
-- PHASE 2 — STABILIZATION
--
--   1. organization_settings — operational config that admin/settings pretended
--      to save. Notification toggles default OFF: no automated message may send
--      until an organization explicitly configures and enables it.
--   2. support_tickets.assigned_to — tickets could not be routed to anyone.
--      Also replaces the blanket manager/admin grants with org scoping.
--   3. SECURITY DEFINER sweep — get_book_of_business and get_downline_agents.
--
-- Run after 20260718100000_org-isolation.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ORGANIZATION SETTINGS
-- ---------------------------------------------------------------------------

create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,

  -- Operational contacts
  support_email        text,
  primary_admin_email  text,

  -- Onboarding
  welcome_message      text,

  -- Outbound notification switches. Default false, deliberately: an
  -- organization opts in, it is never opted in for them.
  notify_new_agent            boolean not null default false,
  notify_new_ticket           boolean not null default false,
  notify_contract_request     boolean not null default false,

  updated_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

alter table public.organization_settings enable row level security;

-- Readable by the org; writable by the owner only.
drop policy if exists organization_settings_read on public.organization_settings;
create policy organization_settings_read on public.organization_settings
  for select to authenticated
  using (organization_id in (select public.my_org_ids()));

drop policy if exists organization_settings_write on public.organization_settings;
create policy organization_settings_write on public.organization_settings
  for all to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

-- Seed a row per existing org so reads never 404.
insert into public.organization_settings (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. SUPPORT TICKETS
--
--    support_tickets had no assigned_to column, so nothing could be routed.
--    Its policies (20260604200000:37-40, 58-61) granted every 'manager' and
--    every 'admin' on the platform full access to every ticket — including
--    ticket bodies from other agencies.
-- ---------------------------------------------------------------------------

alter table public.support_tickets
  add column if not exists assigned_to     uuid references public.profiles(id),
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists resolved_at     timestamptz,
  add column if not exists first_response_at timestamptz;

update public.support_tickets t
   set organization_id = p.organization_id
  from public.profiles p
 where t.agent_id = p.id
   and t.organization_id is null
   and p.organization_id is not null;

create index if not exists idx_support_tickets_org
  on public.support_tickets(organization_id, status, created_at desc);
create index if not exists idx_support_tickets_assigned
  on public.support_tickets(assigned_to, status);
create index if not exists idx_support_ticket_messages_ticket
  on public.support_ticket_messages(ticket_id, created_at);

drop trigger if exists trg_stamp_org_support_tickets on public.support_tickets;
create trigger trg_stamp_org_support_tickets
  before insert on public.support_tickets
  for each row execute function public.stamp_organization_id('agent_id');

alter table public.support_tickets enable row level security;

drop policy if exists "admin_all"                on public.support_tickets;
drop policy if exists support_tickets_admin_all  on public.support_tickets;
drop policy if exists support_tickets_owner      on public.support_tickets;
drop policy if exists support_tickets_access     on public.support_tickets;

create policy support_tickets_access on public.support_tickets
  for all to authenticated
  using (
    agent_id = auth.uid()
    or assigned_to = auth.uid()
    or (organization_id is not null
        and organization_id in (select public.my_org_ids())
        and public.is_org_owner(organization_id))
  )
  with check (
    agent_id = auth.uid()
    or (organization_id is not null and public.is_org_owner(organization_id))
  );

alter table public.support_ticket_messages enable row level security;

drop policy if exists "admin_all_messages"              on public.support_ticket_messages;
drop policy if exists support_ticket_messages_admin_all on public.support_ticket_messages;
drop policy if exists support_ticket_messages_access    on public.support_ticket_messages;

-- Inherits the parent ticket's visibility: the subquery runs as the caller,
-- so support_tickets' own RLS narrows it.
create policy support_ticket_messages_access on public.support_ticket_messages
  for all to authenticated
  using (ticket_id in (select id from public.support_tickets))
  with check (
    sender_id = auth.uid()
    and ticket_id in (select id from public.support_tickets)
  );

-- ---------------------------------------------------------------------------
-- 3. SECURITY DEFINER SWEEP
--
--    get_book_of_business is SECURITY DEFINER, so RLS does not apply to
--    anything it reads. Three defects:
--      a) _scope = 'hierarchy' with has_role('admin') selected EVERY profile
--         on the platform, returning every policy of every agency.
--      b) _scope = 'agent' with has_role('admin') read any agent's book.
--      c) Its own recursive CTE used UNION ALL with no cycle guard and no org
--         filter — the same defect fixed in is_in_downline.
--
--    Rewritten to delegate to the hardened is_in_downline and to intersect
--    every branch with the caller's organization.
-- ---------------------------------------------------------------------------

create or replace function public.get_book_of_business(_scope text, _agent_id uuid default null)
returns table (
  id uuid, client_id uuid, agent_id uuid, carrier_id uuid, carrier_name text,
  product text, policy_number text, status policy_status,
  monthly_premium numeric, annual_premium numeric, face_amount numeric,
  effective_date date, posted_at timestamptz, carrier_integration text,
  is_gtl boolean, client_first_name text, client_last_name text,
  agent_first_name text, agent_last_name text
)
language sql stable security definer set search_path = public
as $$
  with my_orgs as (
    select organization_id as oid from public.organization_memberships
     where profile_id = auth.uid() and status = 'active'
  ),
  scope_agents as (
    -- Own book.
    select auth.uid() as id where _scope = 'mine'

    union

    -- A specific agent: self, or someone in the caller's downline. The
    -- hardened is_in_downline is already org-constrained and cycle-safe.
    select _agent_id
     where _scope = 'agent'
       and _agent_id is not null
       and (_agent_id = auth.uid() or public.is_in_downline(auth.uid(), _agent_id))

    union

    -- Whole hierarchy. Org owners see their org; everyone else sees their
    -- downline. No platform-wide branch.
    select p.id
      from public.profiles p
     where _scope = 'hierarchy'
       and (
         p.id = auth.uid()
         or public.is_in_downline(auth.uid(), p.id)
         or (p.organization_id in (select oid from my_orgs)
             and public.is_org_owner(p.organization_id))
       )
  )
  select
    pol.id, pol.client_id, pol.agent_id, pol.carrier_id,
    car.name as carrier_name,
    pol.product, pol.policy_number, pol.status,
    pol.monthly_premium, pol.annual_premium, pol.face_amount,
    pol.effective_date, pol.posted_at, pol.carrier_integration, pol.is_gtl,
    cli.first_name, cli.last_name,
    pr.first_name, pr.last_name
  from public.policies pol
  left join public.clients  cli on cli.id = pol.client_id
  left join public.profiles pr  on pr.id  = pol.agent_id
  left join public.carriers car on car.id = pol.carrier_id
  where pol.agent_id in (select id from scope_agents where id is not null)
  order by pol.posted_at desc;
$$;

-- Same unguarded recursion, same fix.
create or replace function public.get_downline_agents()
returns table (id uuid, first_name text, last_name text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.first_name, p.last_name
    from public.profiles p
   where public.is_in_downline(auth.uid(), p.id)
     and p.id <> auth.uid()
   order by p.first_name, p.last_name;
$$;

grant execute on function public.get_book_of_business(text, uuid) to authenticated;
grant execute on function public.get_downline_agents() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RATE LIMITING for the unauthenticated api/public/* endpoints
--
--    Seven public routes accept writes with no authentication (lead capture,
--    funnel applications, waitlist). They validate input and carry a honeypot
--    field, but nothing bounded request volume — one script could enqueue
--    unlimited rows and unlimited outbound email.
--
--    The counter lives in Postgres rather than process memory because the app
--    runs serverless: instances are short-lived and numerous, so an in-memory
--    limiter would reset constantly and never actually bound anything.
-- ---------------------------------------------------------------------------

create table if not exists public.rate_limits (
  bucket      text        not null,
  window_start timestamptz not null,
  hits        integer     not null default 0,
  primary key (bucket, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create index if not exists idx_rate_limits_window on public.rate_limits(window_start);

-- Atomic check-and-increment. Returns true when the call is allowed.
-- The insert…on conflict do update is a single statement, so concurrent
-- callers serialize on the row and the count cannot be lost.
create or replace function public.check_rate_limit(
  _key text,
  _max integer,
  _window_seconds integer
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  _bucket_start timestamptz;
  _hits integer;
begin
  _bucket_start := to_timestamp(
    floor(extract(epoch from now()) / _window_seconds) * _window_seconds
  );

  insert into public.rate_limits (bucket, window_start, hits)
  values (_key, _bucket_start, 1)
  on conflict (bucket, window_start)
    do update set hits = public.rate_limits.hits + 1
  returning hits into _hits;

  return _hits <= _max;
end $$;

-- Housekeeping: drop windows older than a day.
create or replace function public.prune_rate_limits()
returns void
language sql security definer set search_path = public
as $$
  delete from public.rate_limits where window_start < now() - interval '1 day';
$$;
