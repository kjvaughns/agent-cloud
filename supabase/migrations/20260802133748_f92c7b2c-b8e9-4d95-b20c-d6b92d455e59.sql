create or replace function public.scope_agent_ids(_scope text)
returns setof uuid
language sql stable security definer set search_path = public
as $$
  with my_orgs as (
    select o as oid from public.my_org_ids() o
  ),
  can_agency as (
    select coalesce(bool_or(public.is_org_admin(oid)), false) as ok from my_orgs
  ),
  effective as (
    select case
      when _scope = 'hierarchy' then
        case when (select ok from can_agency) then 'agency' else 'team' end
      when _scope = 'agent' then 'team'
      when _scope = 'agency' and not (select ok from can_agency) then 'team'
      when _scope in ('mine', 'team', 'agency') then _scope
      else 'team'
    end as s
  )
  select auth.uid()
  union
  select p.id
    from public.profiles p
   where (select s from effective) = 'team'
     and public.is_in_downline(auth.uid(), p.id)
  union
  select p.id
    from public.profiles p
   where (select s from effective) = 'agency'
     and p.organization_id in (select oid from my_orgs);
$$;

comment on function public.scope_agent_ids(text) is
  'Resolves a scope name to the set of agent ids it covers. The single source of truth for mine/team/agency across the app.';

create or replace function public.my_scopes()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'downline_count',
      (select count(*) from public.profiles p
        where public.is_in_downline(auth.uid(), p.id) and p.id <> auth.uid()),
    'can_agency',
      coalesce((select bool_or(public.is_org_admin(o)) from public.my_org_ids() o), false),
    'can_edit_team_records',
      coalesce((select bool_or(public.is_org_owner(o)) from public.my_org_ids() o), false)
  );
$$;

comment on function public.my_scopes() is
  'Scope capabilities for the caller: downline size, whether agency scope is available, and whether team rows are writable.';

create or replace function public.get_scope_agents(_scope text)
returns table (id uuid, first_name text, last_name text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.first_name, p.last_name
    from public.profiles p
   where p.id in (select s from public.scope_agent_ids(_scope) s)
   order by p.first_name nulls last, p.last_name nulls last;
$$;

create or replace function public.get_downline_agents()
returns table (id uuid, first_name text, last_name text)
language sql stable security definer set search_path = public
as $$
  select g.id, g.first_name, g.last_name
    from public.get_scope_agents(
      case
        when coalesce((select bool_or(public.is_org_admin(o)) from public.my_org_ids() o), false)
        then 'agency'
        else 'team'
      end
    ) g
   where g.id <> auth.uid();
$$;

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
  with scope_agents as (
    select s from public.scope_agent_ids(_scope) s
     where _agent_id is null or s = _agent_id
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
  where pol.agent_id in (select s from scope_agents where s is not null)
  order by pol.posted_at desc;
$$;

grant execute on function public.scope_agent_ids(text) to authenticated;
grant execute on function public.my_scopes() to authenticated;
grant execute on function public.get_scope_agents(text) to authenticated;
grant execute on function public.get_downline_agents() to authenticated;
grant execute on function public.get_book_of_business(text, uuid) to authenticated;

notify pgrst, 'reload schema';