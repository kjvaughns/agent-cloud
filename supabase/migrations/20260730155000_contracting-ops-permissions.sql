-- ============================================================================
-- CONTRACTING OPERATIONS — PART 0: PERMISSIONS
--
-- Extends the existing role_permissions table rather than introducing a second
-- permission system. Every new flag follows the established naming shape, so
-- the permissions UI and STAFF_PRESETS keep working the way they already do.
--
-- The can_* functions below exist so RLS policies can express "the owner, an
-- org admin, or someone explicitly granted this" once instead of repeating a
-- four-way join in thirty policies. They are security definer and read only.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. NEW PERMISSION FLAGS
-- ---------------------------------------------------------------------------

alter table public.role_permissions
  -- Configuration
  add column if not exists contracting_manage_carriers boolean default false,
  add column if not exists contracting_manage_comp_levels boolean default false,
  add column if not exists contracting_manage_hierarchy boolean default false,
  add column if not exists contracting_manage_licenses boolean default false,
  -- Workflow
  add column if not exists contracting_submit boolean default false,
  add column if not exists contracting_approve boolean default false,
  add column if not exists contracting_assign_staff boolean default false,
  -- Data access
  add column if not exists contracting_view_agency_comp boolean default false,
  add column if not exists contracting_view_sensitive_docs boolean default false,
  add column if not exists contracting_view_banking boolean default false,
  add column if not exists contracting_view_tax_docs boolean default false,
  add column if not exists contracting_export boolean default false,
  add column if not exists contracting_view_audit boolean default false;

-- ---------------------------------------------------------------------------
-- 2. WHO COUNTS AS AN ORG ADMIN
--
-- Mirrors resolveCanManagePermissions() in permissions.functions.ts: the
-- organizations.owner_id holder, an agency_owner/admin whose profile sits in
-- this org, or admin staff with manage-configs. Gating on owner_id alone locks
-- out every owner whose org row predates their account.
--
-- Deliberately NOT the global has_role('admin') bypass — holding admin grants
-- nothing inside somebody else's agency.
-- ---------------------------------------------------------------------------

create or replace function public.is_org_admin(_org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.is_org_owner(_org)
    or exists (
      select 1
        from public.profiles p
        join public.user_roles ur on ur.user_id = p.id
       where p.id = auth.uid()
         and p.organization_id = _org
         and ur.role::text in ('agency_owner','admin','super_admin')
    )
    or exists (
      select 1 from public.role_permissions rp
       where rp.profile_id = auth.uid()
         and rp.organization_id = _org
         and coalesce(rp.staff_is_admin,false)
         and coalesce(rp.admin_manage_staff_configs,false)
    )
$$;

-- ---------------------------------------------------------------------------
-- 3. PER-CAPABILITY HELPERS
--
-- Written out one by one rather than generated from a key string: a policy
-- that resolves a column name at run time fails at query time on a typo, and
-- a policy that fails open or errors under load is worse than a verbose file.
-- ---------------------------------------------------------------------------

create or replace function public.has_contracting_flag(_org uuid, _flag text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  result boolean;
begin
  -- _flag is supplied only by the definitions below, never by a caller. %I
  -- quotes it regardless.
  execute format(
    'select coalesce(%I, false) from public.role_permissions
      where profile_id = $1 and organization_id = $2', _flag)
    into result
    using auth.uid(), _org;
  return coalesce(result, false);
end
$$;

create or replace function public.can_manage_contracting(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_org_admin(_org) or public.has_contracting_flag(_org, 'contracting_manage_carriers')
$$;

create or replace function public.can_manage_comp_levels(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_org_admin(_org) or public.has_contracting_flag(_org, 'contracting_manage_comp_levels')
$$;

create or replace function public.can_manage_hierarchy(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_org_admin(_org) or public.has_contracting_flag(_org, 'contracting_manage_hierarchy')
$$;

create or replace function public.can_manage_licenses(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_org_admin(_org) or public.has_contracting_flag(_org, 'contracting_manage_licenses')
$$;

create or replace function public.can_submit_contracts(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_org_admin(_org)
      or public.has_contracting_flag(_org, 'contracting_submit')
      or public.has_contracting_flag(_org, 'staff_submit_carrier_requests')
      or public.has_contracting_flag(_org, 'mgr_submit_carrier_requests')
$$;

create or replace function public.can_approve_contracts(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_org_admin(_org) or public.has_contracting_flag(_org, 'contracting_approve')
$$;

create or replace function public.can_assign_contracting_staff(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_org_admin(_org) or public.has_contracting_flag(_org, 'contracting_assign_staff')
$$;

create or replace function public.can_view_agency_comp(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_org_admin(_org)
      or public.has_contracting_flag(_org, 'contracting_view_agency_comp')
      or public.has_contracting_flag(_org, 'contracting_manage_comp_levels')
$$;

create or replace function public.can_view_sensitive_docs(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_org_admin(_org) or public.has_contracting_flag(_org, 'contracting_view_sensitive_docs')
$$;

create or replace function public.can_view_contracting_audit(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_org_admin(_org) or public.has_contracting_flag(_org, 'contracting_view_audit')
$$;

-- Read access to the contracting workspace at all: anyone who administers it,
-- plus staff with the existing view-contracts flag.
create or replace function public.can_view_contracting(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_org_admin(_org)
      or public.has_contracting_flag(_org, 'staff_view_contracts')
      or public.has_contracting_flag(_org, 'contracting_manage_carriers')
      or public.has_contracting_flag(_org, 'contracting_submit')
      or public.has_contracting_flag(_org, 'contracting_approve')
      or public.has_contracting_flag(_org, 'contracting_assign_staff')
      or public.has_contracting_flag(_org, 'contracting_manage_licenses')
$$;

grant execute on function
  public.is_org_admin(uuid),
  public.has_contracting_flag(uuid, text),
  public.can_manage_contracting(uuid),
  public.can_manage_comp_levels(uuid),
  public.can_manage_hierarchy(uuid),
  public.can_manage_licenses(uuid),
  public.can_submit_contracts(uuid),
  public.can_approve_contracts(uuid),
  public.can_assign_contracting_staff(uuid),
  public.can_view_agency_comp(uuid),
  public.can_view_sensitive_docs(uuid),
  public.can_view_contracting_audit(uuid),
  public.can_view_contracting(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- 4. BACKFILL THE CONTRACTING SPECIALIST PRESET
--
-- Staff already carrying the contracting preset were hired to do this work;
-- making them re-request the new flags would break their queue on deploy.
-- Approval and comp-level management are deliberately excluded — those are
-- owner decisions until an owner says otherwise.
-- ---------------------------------------------------------------------------

update public.role_permissions
   set contracting_manage_carriers = true,
       contracting_submit = true,
       contracting_assign_staff = true,
       contracting_manage_licenses = true,
       contracting_export = true
 where staff_preset = 'contracting_specialist';

update public.role_permissions
   set contracting_manage_carriers = true,
       contracting_manage_comp_levels = true,
       contracting_manage_hierarchy = true,
       contracting_manage_licenses = true,
       contracting_submit = true,
       contracting_approve = true,
       contracting_assign_staff = true,
       contracting_view_agency_comp = true,
       contracting_view_sensitive_docs = true,
       contracting_export = true,
       contracting_view_audit = true
 where staff_preset = 'admin';
