-- The six Agency Settings permissions get somewhere to live.
--
-- ── Why this is not optional ──
--
-- `role_permissions` is a table of fixed boolean columns, not a key-value bag.
-- The six keys added to `ADMIN_PERMS` — agency profile, levels, carriers,
-- grids, automations, integrations — had no columns, so an owner could not
-- have granted one if they tried: the write would have been dropped and the
-- read would have returned undefined forever.
--
-- This is the same shape as the defect the contracting checklist turned up,
-- where `OrgCarrierSchema` silently stripped five fields the resolver read.
-- Code that reads a name nothing can write is not a permission system; it is a
-- permanently-false constant with a suggestive name.
--
-- ── Default false, and what that means in practice ──
--
-- Nobody gains anything by applying this. Every column defaults to false, and
-- the guards treat an owner or platform admin as permitted without consulting
-- any of them — so owners keep working exactly as before, and staff start from
-- no access until an owner grants it deliberately.
--
-- That is the right direction for a first application: the alternative,
-- defaulting to true so nothing appears to change, would silently hand every
-- existing staff member the ability to rewrite comp grids.
--
-- ── The capability function ──
--
-- `can_manage_agency_settings(_org, _key)` is the database's own answer,
-- mirroring `is_org_admin`'s shape: an active membership in that organization
-- AND either an agency-level role or the specific column. It exists so a
-- policy can ask the same question the server does, rather than each RLS rule
-- re-deriving it and drifting.
--
-- Forward-only and idempotent.

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

-- ───────────────────────────────────────────────────────────────────────────
-- The database's own answer
-- ───────────────────────────────────────────────────────────────────────────
--
-- Shaped after `is_org_admin`: the org bound comes from an active membership
-- in THAT organization, not from a bare role. `user_roles` has no
-- organization_id, so a role test alone answers yes for an admin of any agency
-- on the platform — which is what 20260815050000 spent fifty-two policies
-- fixing.

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

  -- An owner or org admin needs no toggle: they are who grants the toggles.
  if public.is_org_admin(_org) then
    return true;
  end if;

  -- Membership first, so somebody with a row left behind from an agency they
  -- have left cannot use it.
  if not exists (
    select 1 from public.organization_memberships m
     where m.profile_id = auth.uid()
       and m.organization_id = _org
       and m.status = 'active'
  ) then
    return false;
  end if;

  -- The column, chosen by name. Only the six are addressable, so a caller
  -- cannot pass an arbitrary column name and read something else off the row.
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
