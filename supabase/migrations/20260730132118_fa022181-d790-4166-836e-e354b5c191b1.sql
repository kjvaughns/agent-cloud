-- ============================================================================
-- PHASE 2 — STABILIZATION
-- ============================================================================

create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  support_email        text,
  primary_admin_email  text,
  welcome_message      text,
  notify_new_agent            boolean not null default false,
  notify_new_ticket           boolean not null default false,
  notify_contract_request     boolean not null default false,
  updated_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

grant select, insert, update, delete on public.organization_settings to authenticated;
grant all on public.organization_settings to service_role;

alter table public.organization_settings enable row level security;

drop policy if exists organization_settings_read on public.organization_settings;
create policy organization_settings_read on public.organization_settings
  for select to authenticated
  using (organization_id in (select public.my_org_ids()));

drop policy if exists organization_settings_write on public.organization_settings;
create policy organization_settings_write on public.organization_settings
  for all to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

insert into public.organization_settings (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. SUPPORT TICKETS
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

create policy support_ticket_messages_access on public.support_ticket_messages
  for all to authenticated
  using (ticket_id in (select id from public.support_tickets))
  with check (
    sender_id = auth.uid()
    and ticket_id in (select id from public.support_tickets)
  );

-- ---------------------------------------------------------------------------
-- 3. SECURITY DEFINER SWEEP
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
    select auth.uid() as id where _scope = 'mine'

    union

    select _agent_id
     where _scope = 'agent'
       and _agent_id is not null
       and (_agent_id = auth.uid() or public.is_in_downline(auth.uid(), _agent_id))

    union

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
-- ---------------------------------------------------------------------------

create table if not exists public.rate_limits (
  bucket      text        not null,
  window_start timestamptz not null,
  hits        integer     not null default 0,
  primary key (bucket, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

create index if not exists idx_rate_limits_window on public.rate_limits(window_start);

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

create or replace function public.prune_rate_limits()
returns void
language sql security definer set search_path = public
as $$
  delete from public.rate_limits where window_start < now() - interval '1 day';
$$;