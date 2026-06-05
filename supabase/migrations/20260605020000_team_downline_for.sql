-- get_team_downline_for(p_root_id): used by admin override in team.functions.ts
-- to show the full hierarchy tree starting from any root agent.
CREATE OR REPLACE FUNCTION public.get_team_downline_for(p_root_id uuid)
RETURNS TABLE(
  id uuid, first_name text, last_name text, email text, phone text,
  upline_id uuid, status text, last_active_at timestamptz, created_at timestamptz,
  depth_level int, contracts_count int, policies_count int, premium_total numeric,
  completion_pct int, missing jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH RECURSIVE dl AS (
    SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.upline_id,
           p.status, p.last_active_at, p.created_at, 0 AS depth_level
    FROM public.profiles p WHERE p.id = p_root_id
    UNION ALL
    SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.upline_id,
           p.status, p.last_active_at, p.created_at, d.depth_level + 1
    FROM public.profiles p JOIN dl d ON p.upline_id = d.id
    WHERE p.id != p_root_id
  )
  SELECT
    d.id, d.first_name, d.last_name, d.email, d.phone, d.upline_id,
    d.status, d.last_active_at, d.created_at, d.depth_level,
    COALESCE((SELECT COUNT(*)::int FROM public.agent_commission_levels WHERE agent_id = d.id), 0) AS contracts_count,
    COALESCE((SELECT COUNT(*)::int FROM public.policies WHERE agent_id = d.id), 0) AS policies_count,
    COALESCE((SELECT SUM(annual_premium) FROM public.policies WHERE agent_id = d.id), 0) AS premium_total,
    COALESCE((public.agent_completion(d.id)->>'pct')::int, 0) AS completion_pct,
    COALESCE(public.agent_completion(d.id)->'missing', '[]'::jsonb) AS missing
  FROM dl d
  ORDER BY d.depth_level, d.first_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_team_downline_for(uuid) TO authenticated;
