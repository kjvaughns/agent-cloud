-- Fix get_dashboard_metrics: team_prod should be downline-only (exclude agent's own policies)
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
  _range_start timestamptz,
  _range_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_uid uuid := auth.uid();
BEGIN
  WITH RECURSIVE downline AS (
    SELECT v_uid AS id
    UNION ALL
    SELECT p.id FROM public.profiles p
    JOIN downline d ON p.upline_id = d.id
  ),
  team_ids AS (SELECT id FROM downline),
  range_policies AS (
    SELECT pol.*, (pol.agent_id = v_uid) AS is_mine
    FROM public.policies pol
    WHERE pol.agent_id IN (SELECT id FROM team_ids)
      AND pol.posted_at >= _range_start
      AND pol.posted_at < _range_end
  ),
  kpis AS (
    SELECT
      COALESCE(SUM(CASE WHEN is_mine THEN annual_premium END), 0) AS my_prod,
      COALESCE(SUM(CASE WHEN NOT is_mine THEN annual_premium END), 0) AS team_prod,
      COUNT(*) FILTER (WHERE is_mine) AS my_policies,
      COUNT(*) FILTER (WHERE NOT is_mine) AS team_policies
    FROM range_policies
  ),
  status_grid AS (
    SELECT status::text AS status, COUNT(*) AS cnt
    FROM public.policies
    WHERE agent_id IN (SELECT id FROM team_ids)
    GROUP BY status
  ),
  donut AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'active') AS active_cnt,
      COUNT(*) FILTER (WHERE status = 'in_review') AS in_review_cnt,
      COUNT(*) AS total_cnt
    FROM public.policies
    WHERE agent_id IN (SELECT id FROM team_ids)
      AND posted_at >= now() - interval '30 days'
  ),
  active_downline AS (
    SELECT COUNT(*) AS cnt FROM public.profiles
    WHERE upline_id = v_uid
  ),
  active_contracts AS (
    SELECT COUNT(*) AS cnt FROM public.agent_commission_levels
    WHERE agent_id = v_uid
  ),
  months AS (
    SELECT date_trunc('month', now()) - (i || ' months')::interval AS m_start
    FROM generate_series(0, 11) i
  ),
  trend AS (
    SELECT
      to_char(m.m_start, 'YYYY-MM-DD') AS month,
      COALESCE(SUM(CASE WHEN pol.agent_id = v_uid THEN pol.annual_premium END), 0) AS my_prod,
      COALESCE(SUM(CASE WHEN pol.agent_id != v_uid THEN pol.annual_premium END), 0) AS team_prod,
      COUNT(*) FILTER (WHERE pol.agent_id = v_uid) AS my_policies,
      COUNT(pol.id) FILTER (WHERE pol.agent_id != v_uid) AS team_policies
    FROM months m
    LEFT JOIN public.policies pol
      ON pol.posted_at >= m.m_start
     AND pol.posted_at < m.m_start + interval '1 month'
     AND pol.agent_id IN (SELECT id FROM team_ids)
    GROUP BY m.m_start
    ORDER BY m.m_start
  )
  SELECT jsonb_build_object(
    'my_prod', (SELECT my_prod FROM kpis),
    'team_prod', (SELECT team_prod FROM kpis),
    'my_policies', (SELECT my_policies FROM kpis),
    'team_policies', (SELECT team_policies FROM kpis),
    'status_grid', COALESCE((SELECT jsonb_object_agg(status, cnt) FROM status_grid), '{}'::jsonb),
    'donut', jsonb_build_object(
      'active', (SELECT active_cnt FROM donut),
      'in_review', (SELECT in_review_cnt FROM donut),
      'total', (SELECT total_cnt FROM donut)
    ),
    'active_downline', (SELECT cnt FROM active_downline),
    'active_contracts', (SELECT cnt FROM active_contracts),
    'trend', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'month', month, 'my_prod', my_prod, 'team_prod', team_prod,
      'my_policies', my_policies, 'team_policies', team_policies
    )) FROM trend), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;
