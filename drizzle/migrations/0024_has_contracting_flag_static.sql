CREATE OR REPLACE FUNCTION public.has_contracting_flag(_org uuid, _flag text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select coalesce((
    select case when jsonb_typeof(to_jsonb(rp) -> _flag) = 'boolean' then (to_jsonb(rp) ->> _flag)::boolean else false end
      from public.role_permissions rp
     where rp.profile_id = auth.uid() and rp.organization_id = _org
     limit 1
  ), false)
$$;
REVOKE EXECUTE ON FUNCTION public.has_contracting_flag(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_contracting_flag(uuid, text) TO authenticated;