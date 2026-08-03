CREATE OR REPLACE FUNCTION public.get_team_downline_for(p_root_id uuid)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.caller_is_active() THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH RECURSIVE dl AS (
    SELECT p.*, 1 AS depth_level FROM public.profiles p WHERE p.upline_id = p_root_id
    UNION ALL
    SELECT p.*, d.depth_level + 1 FROM public.profiles p JOIN dl d ON p.upline_id = d.id
  )
  SELECT to_jsonb(dl.*) FROM dl;
END $function$;

notify pgrst, 'reload schema';