CREATE OR REPLACE FUNCTION public.get_my_upline()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT upline_id FROM public.profiles WHERE id = auth.uid()
$$;

DROP POLICY IF EXISTS profiles_self_or_related_read ON public.profiles;

CREATE POLICY profiles_self_or_related_read ON public.profiles
FOR SELECT
USING (
  id = auth.uid()
  OR upline_id = auth.uid()
  OR public.is_in_downline(auth.uid(), id)
  OR id = public.get_my_upline()
  OR upline_id = public.get_my_upline()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'manager'::app_role)
);