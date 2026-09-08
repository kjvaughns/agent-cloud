CREATE OR REPLACE FUNCTION public.get_org_leaderboard(_start timestamp with time zone, _end timestamp with time zone)
 RETURNS TABLE(agent_id uuid, first_name text, last_name text, premium numeric, policies bigint, placed numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH my_orgs AS (
    SELECT m.organization_id
      FROM public.organization_memberships m
     WHERE m.profile_id = auth.uid()
       AND m.status = 'active'
    UNION
    SELECT p.organization_id
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND p.organization_id IS NOT NULL
       AND COALESCE(p.status, '') NOT IN ('inactive', 'terminated')
  ),
  produced AS (
    SELECT pol.agent_id,
           COALESCE(SUM(pol.annual_premium), 0) AS premium,
           COUNT(*) AS policies,
           COALESCE(
             SUM(pol.annual_premium) FILTER (
               WHERE public.policy_is_placed(pol.status::text)
             ),
             0
           ) AS placed
      FROM public.policies pol
     WHERE pol.organization_id IN (SELECT organization_id FROM my_orgs)
       AND pol.agent_id IS NOT NULL
       AND pol.production_date >= _start
       AND pol.production_date <= _end
     GROUP BY pol.agent_id
  )
  SELECT pr.agent_id,
         p.first_name,
         p.last_name,
         pr.premium,
         pr.policies,
         pr.placed
    FROM produced pr
    LEFT JOIN public.profiles p ON p.id = pr.agent_id
   WHERE public.caller_is_active()
   ORDER BY pr.premium DESC;
$function$;