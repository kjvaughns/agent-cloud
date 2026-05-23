
REVOKE EXECUTE ON FUNCTION public.ssn_set(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ssn_reveal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ssn_set(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ssn_reveal() TO authenticated;
