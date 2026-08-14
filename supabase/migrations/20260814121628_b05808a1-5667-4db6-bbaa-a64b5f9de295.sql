create or replace function public.imo_org_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  with recursive admin_orgs as (
    select o as oid from public.my_org_ids() o where public.is_org_admin(o)
  ),
  tree (oid, depth, path) as (
    select oid, 0, array[oid] from admin_orgs
    union all
    select r.child_org_id, t.depth + 1, t.path || r.child_org_id
      from public.agency_relationships r
      join tree t on r.parent_org_id = t.oid
     where r.status = 'active'
       and r.include_production
       and t.depth < 10
       and not (r.child_org_id = any(t.path))
  )
  select distinct oid from tree;
$$;

comment on function public.imo_org_ids() is
  'The caller''s admin orgs plus every descendant org opted into the production rollup (active + include_production), depth-capped and cycle-guarded.';

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
  can_imo as (
    select exists (
      select 1 from public.agency_relationships r
       where r.status = 'active' and r.include_production
         and public.is_org_admin(r.parent_org_id)
    ) as ok
  ),
  effective as (
    select case
      when _scope = 'hierarchy' then
        case when (select ok from can_agency) then 'agency' else 'team' end
      when _scope = 'agent' then 'team'
      when _scope = 'imo' and not (select ok from can_imo) then
        case when (select ok from can_agency) then 'agency' else 'team' end
      when _scope = 'agency' and not (select ok from can_agency) then 'team'
      when _scope in ('mine', 'team', 'agency', 'imo') then _scope
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
     and p.organization_id in (select oid from my_orgs)

  union

  select p.id
    from public.profiles p
   where (select s from effective) = 'imo'
     and p.organization_id in (select public.imo_org_ids());
$$;

comment on function public.scope_agent_ids(text) is
  'Resolves a scope name to the set of agent ids it covers. The single source of truth for mine/team/agency/imo across the app.';

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
      coalesce((select bool_or(public.is_org_owner(o)) from public.my_org_ids() o), false),
    'can_imo',
      exists (
        select 1 from public.agency_relationships r
         where r.status = 'active' and r.include_production
           and public.is_org_admin(r.parent_org_id)
      )
  );
$$;

comment on function public.my_scopes() is
  'Scope capabilities for the caller: downline size, agency scope, team-row writability, and whether the IMO rollup applies.';

alter table public.organization_settings
  add column if not exists show_own_sales_in_feed boolean not null default true,
  add column if not exists show_own_on_leaderboards boolean not null default true;

comment on column public.organization_settings.show_own_sales_in_feed is
  'Whether the owner''s own posted deals appear in the shared Discord sales feed. Off keeps an IMO owner''s personal production out of every downline''s chat.';
comment on column public.organization_settings.show_own_on_leaderboards is
  'Whether the owner''s own numbers appear on leaderboards. Off removes only the owner''s line, never the team''s.';

notify pgrst, 'reload schema';