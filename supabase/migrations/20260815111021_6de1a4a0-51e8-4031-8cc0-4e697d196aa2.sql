alter table public.role_permissions
  add column if not exists admin_manage_agency_profile boolean not null default false,
  add column if not exists admin_manage_levels         boolean not null default false,
  add column if not exists admin_manage_carriers       boolean not null default false,
  add column if not exists admin_manage_grids          boolean not null default false,
  add column if not exists admin_manage_automations    boolean not null default false,
  add column if not exists admin_manage_integrations   boolean not null default false;

comment on column public.role_permissions.admin_manage_carriers is
  'May add, configure and activate carriers. Distinct from admin_manage_grids: this changes what agents can select, that changes what they are paid.';
comment on column public.role_permissions.admin_manage_grids is
  'May edit compensation grids. Separate from admin_manage_carriers because it changes what every agent is paid on every deal already written against that carrier.';
comment on column public.role_permissions.admin_manage_automations is
  'May add and edit Discord channels. A webhook URL is a bearer credential — anyone holding it can post to that channel as the agency.';

create or replace function public.can_manage_agency_settings(_org uuid, _key text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  granted boolean;
begin
  if _org is null or _key is null then
    return false;
  end if;

  if public.is_org_admin(_org) then
    return true;
  end if;

  if not exists (
    select 1 from public.organization_memberships m
     where m.profile_id = auth.uid()
       and m.organization_id = _org
       and m.status = 'active'
  ) then
    return false;
  end if;

  if _key not in (
    'admin_manage_agency_profile', 'admin_manage_levels', 'admin_manage_carriers',
    'admin_manage_grids', 'admin_manage_automations', 'admin_manage_integrations'
  ) then
    return false;
  end if;

  execute format(
    'select coalesce(bool_or(%I), false) from public.role_permissions
      where profile_id = $1 and organization_id = $2', _key
  ) into granted using auth.uid(), _org;

  return coalesce(granted, false);
end $$;

comment on function public.can_manage_agency_settings(uuid, text) is
  'May the current user act in one Agency Settings area of one organization? Mirrors is_org_admin: an active membership in THAT org plus either an agency-level role or the specific permission column. The key is checked against a fixed list so an arbitrary column name cannot be read off the row.';

grant execute on function public.can_manage_agency_settings(uuid, text) to authenticated;

notify pgrst, 'reload schema';