-- Only accept real boolean permission columns as dynamic identifiers.
CREATE OR REPLACE FUNCTION public.has_contracting_flag(_org uuid, _flag text)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare result boolean;
begin
  if _org is null or _flag is null or auth.uid() is null then return false; end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'role_permissions'
       and column_name = _flag and data_type = 'boolean'
  ) then return false; end if;
  execute format('select coalesce(%I, false) from public.role_permissions where profile_id = $1 and organization_id = $2', _flag)
    into result using auth.uid(), _org;
  return coalesce(result, false);
end $function$;

CREATE OR REPLACE FUNCTION public.can_manage_agency_settings(_org uuid, _key text)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare granted boolean;
begin
  if _org is null or _key is null or auth.uid() is null then return false; end if;
  if public.is_org_admin(_org) then return true; end if;
  if not exists (select 1 from public.organization_memberships m
     where m.profile_id = auth.uid() and m.organization_id = _org and m.status = 'active') then return false; end if;
  -- Static SQL per allowed key: no caller text reaches a dynamic command.
  select coalesce(bool_or(case _key
      when 'admin_manage_agency_profile' then admin_manage_agency_profile
      when 'admin_manage_levels' then admin_manage_levels
      when 'admin_manage_carriers' then admin_manage_carriers
      when 'admin_manage_grids' then admin_manage_grids
      when 'admin_manage_automations' then admin_manage_automations
      when 'admin_manage_integrations' then admin_manage_integrations
      else false end), false)
    into granted from public.role_permissions where profile_id = auth.uid() and organization_id = _org;
  return coalesce(granted, false);
end $function$;

REVOKE EXECUTE ON FUNCTION public.has_contracting_flag(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_agency_settings(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_contracting_flag(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_agency_settings(uuid, text) TO authenticated;

-- Files in a folder named after an agency are readable by that agency's people.
CREATE OR REPLACE FUNCTION public.may_read_org_folder(_folder text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select auth.uid() is not null and _folder ~* '^[0-9a-f-]{36}$' and (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.organization_id::text = _folder)
    or exists (select 1 from public.organization_memberships m where m.profile_id = auth.uid() and m.organization_id::text = _folder and m.status = 'active')
    or public.has_role(auth.uid(), 'super_admin')
  )
$$;
REVOKE EXECUTE ON FUNCTION public.may_read_org_folder(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.may_read_org_folder(text) TO authenticated;

DROP POLICY IF EXISTS "org_branding_read" ON storage.objects;
CREATE POLICY "org_branding_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'org-branding' AND public.may_read_org_folder((storage.foldername(name))[1]));

DROP POLICY IF EXISTS "academy_media_read" ON storage.objects;
CREATE POLICY "academy_media_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'academy-media' AND public.may_read_org_folder((storage.foldername(name))[1]));