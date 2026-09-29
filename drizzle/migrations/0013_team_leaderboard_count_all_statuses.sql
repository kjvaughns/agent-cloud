CREATE OR REPLACE FUNCTION public.get_team_leaderboard(_start timestamp with time zone, _end timestamp with time zone)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_prior_start timestamptz := _start - (_end - _start);
  result jsonb;
BEGIN
  IF NOT public.caller_is_active() THEN RETURN '{}'::jsonb; END IF;
  WITH RECURSIVE team AS (
    SELECT v_uid AS id UNION ALL
    SELECT p.id FROM public.profiles p JOIN team t ON p.upline_id = t.id
  ),
  cur AS (
    SELECT agent_id, COUNT(*) AS policies, COALESCE(SUM(annual_premium),0) AS premium, COALESCE(AVG(annual_premium),0) AS avg_deal
    FROM public.policies WHERE agent_id IN (SELECT id FROM team) AND production_date >= _start AND production_date < _end
    GROUP BY agent_id
  ),
  prev AS (
    SELECT agent_id, COALESCE(SUM(annual_premium),0) AS premium
    FROM public.policies WHERE agent_id IN (SELECT id FROM team) AND production_date >= v_prior_start AND production_date < _start
    GROUP BY agent_id
  ),
  joined AS (
    SELECT p.id, p.first_name, p.last_name,
      COALESCE(c.policies,0) AS policies, COALESCE(c.premium,0) AS premium, COALESCE(c.avg_deal,0) AS avg_deal,
      COALESCE(c.premium,0) - COALESCE(pr.premium,0) AS premium_change
    FROM public.profiles p
    LEFT JOIN cur c ON c.agent_id = p.id
    LEFT JOIN prev pr ON pr.agent_id = p.id
    WHERE p.id IN (SELECT id FROM team)
    ORDER BY premium DESC
  ),
  monthly AS (
    SELECT to_char(date_trunc('month', now()) - (i || ' months')::interval, 'YYYY-MM') AS month,
           date_trunc('month', now()) - (i || ' months')::interval AS m_start
    FROM generate_series(0,5) i
  ),
  team_monthly AS (
    SELECT m.month, pol.agent_id, p.first_name || ' ' || p.last_name AS agent_name, COALESCE(SUM(pol.annual_premium),0) AS premium
    FROM monthly m
    LEFT JOIN public.policies pol ON pol.production_date >= m.m_start AND pol.production_date < m.m_start + interval '1 month' AND pol.agent_id IN (SELECT id FROM team)
    LEFT JOIN public.profiles p ON p.id = pol.agent_id
    GROUP BY m.month, m.m_start, pol.agent_id, p.first_name, p.last_name
    ORDER BY m.m_start
  )
  SELECT jsonb_build_object(
    'self_id', v_uid,
    'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', first_name || ' ' || last_name, 'policies', policies, 'premium', premium, 'avg_deal', avg_deal, 'trend', CASE WHEN premium_change > 0 THEN 'up' WHEN premium_change < 0 THEN 'down' ELSE 'flat' END)) FROM joined), '[]'::jsonb),
    'team_monthly', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', month, 'agent_id', agent_id, 'agent_name', agent_name, 'premium', premium)) FROM team_monthly WHERE agent_id IS NOT NULL), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $function$;