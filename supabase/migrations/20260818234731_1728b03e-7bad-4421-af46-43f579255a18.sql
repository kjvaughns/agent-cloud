REVOKE EXECUTE ON FUNCTION public.org_of_my_chain(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_of_my_chain(uuid) TO authenticated, service_role;