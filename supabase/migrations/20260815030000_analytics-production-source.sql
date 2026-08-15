-- Every analytics number counts production the way the dashboard does.
--
-- `get_dashboard_metrics` moved onto `production_date` and
-- `policy_counts_as_production()` in 20260814250000. Five analytics functions
-- did not, and they are what the Reports page is built from — so an owner
-- could read one figure on the dashboard and a different one on the screen
-- named "how the agency is doing", from the same policies.
--
-- Both halves were wrong, for the same reasons the dashboard's were:
--
--   * they windowed on `posted_at`, so an imported book read zero for every
--     month it was actually written in and spiked on the afternoon it was
--     uploaded
--   * they applied no status filter at all, so withdrawn, not-taken and
--     carrier-N/A premium was counted as production
--
-- ── How this was written ──
--
-- Each function body was taken verbatim from its most recent definition and
-- transformed mechanically: every `posted_at >= A AND posted_at < B` pair
-- became the same pair on `production_date`, plus
-- `policy_counts_as_production(status::text)`. Fourteen windows across five
-- functions. Nothing else in any body was touched.
--
-- Deliberately NOT transformed: `pol.posted_at AS at` in the activity feeds of
-- `get_agent_analytics` and `get_analytics_overview`. That is a timestamp being
-- displayed — "this policy was posted on the 3rd" — and not a production
-- window. When a deal was entered is a real fact worth showing; it is only
-- wrong as an answer to "when was this business written".
--
-- Sources, so the transformation can be checked against them:
--   get_carrier_breakdown   20260802133904
--   get_agent_analytics     20260802133904
--   get_team_leaderboard    20260802240000
--   get_analytics_overview  20260523180548
--   get_trends_12mo         20260523180548
--
-- Forward only, and behaviour-only: no table, column, index or policy changes.
-- Every one of these is a `create or replace`, so a rollback is re-running the
-- migration that defined it before.

-- ── get_carrier_breakdown ──

CREATE OR REPLACE FUNCTION public.get_carrier_breakdown(_start timestamptz, _end timestamptz, _agent uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  result jsonb;
BEGIN
  IF _agent IS NOT NULL
     AND NOT (
       _agent = v_uid
       OR public.is_in_downline(v_uid, _agent)
       OR public.is_org_admin((SELECT organization_id FROM public.profiles WHERE id = _agent))
     ) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  WITH RECURSIVE team AS (
    SELECT v_uid AS id UNION ALL
    SELECT p.id FROM public.profiles p JOIN team t ON p.upline_id = t.id
  ),
  scope AS (
    SELECT id FROM team WHERE _agent IS NULL
    UNION
    SELECT _agent WHERE _agent IS NOT NULL
  ),
  by_carrier AS (
    SELECT c.name AS carrier, COUNT(*) AS deals, COALESCE(SUM(pol.annual_premium),0) AS premium,
      COALESCE(AVG(pol.annual_premium),0) AS avg_deal
    FROM public.policies pol LEFT JOIN public.carriers c ON c.id = pol.carrier_id
    WHERE pol.agent_id IN (SELECT id FROM scope) AND pol.production_date >= _start AND pol.production_date < _end AND public.policy_counts_as_production(pol.status::text)
    GROUP BY c.name ORDER BY premium DESC
  ),
  top_agent_per_carrier AS (
    SELECT DISTINCT ON (c.name) c.name AS carrier, p.first_name || ' ' || p.last_name AS agent_name, SUM(pol.annual_premium) AS prem
    FROM public.policies pol LEFT JOIN public.carriers c ON c.id = pol.carrier_id LEFT JOIN public.profiles p ON p.id = pol.agent_id
    WHERE pol.agent_id IN (SELECT id FROM scope) AND pol.production_date >= _start AND pol.production_date < _end AND public.policy_counts_as_production(pol.status::text)
    GROUP BY c.name, p.first_name, p.last_name ORDER BY c.name, prem DESC
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object('carrier', b.carrier, 'deals', b.deals, 'premium', b.premium, 'avg_deal', b.avg_deal, 'top_agent', t.agent_name)) FROM by_carrier b LEFT JOIN top_agent_per_carrier t ON t.carrier = b.carrier), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

-- ── get_agent_analytics ──

CREATE OR REPLACE FUNCTION public.get_agent_analytics(_agent uuid, _start timestamptz, _end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT (
    auth.uid() = _agent
    OR public.is_in_downline(auth.uid(), _agent)
    OR public.is_org_admin((SELECT organization_id FROM public.profiles WHERE id = _agent))
  ) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;
  WITH monthly AS (
    SELECT to_char(date_trunc('month', now()) - (i || ' months')::interval, 'YYYY-MM') AS month,
           date_trunc('month', now()) - (i || ' months')::interval AS m_start
    FROM generate_series(0,5) i
  ),
  prod AS (
    SELECT m.month,
      COALESCE(SUM(pol.annual_premium),0) AS premium,
      COUNT(pol.id) AS policies
    FROM monthly m
    LEFT JOIN public.policies pol ON pol.agent_id = _agent
      AND pol.production_date >= m.m_start AND pol.production_date < m.m_start + interval '1 month' AND public.policy_counts_as_production(pol.status::text)
    GROUP BY m.month, m.m_start ORDER BY m.m_start
  ),
  status_dist AS (
    SELECT status::text AS status, COUNT(*) AS cnt FROM public.policies WHERE agent_id = _agent GROUP BY status
  ),
  top_carriers AS (
    SELECT c.name AS carrier, COUNT(*) AS deals, COALESCE(SUM(pol.annual_premium),0) AS premium
    FROM public.policies pol LEFT JOIN public.carriers c ON c.id = pol.carrier_id
    WHERE pol.agent_id = _agent GROUP BY c.name ORDER BY premium DESC LIMIT 6
  ),
  activity AS (
    SELECT * FROM (
      SELECT 'policy' AS kind, COALESCE(car.name, 'Policy') || ' — $' || COALESCE(pol.annual_premium::text,'0') AS label, pol.posted_at AS at FROM public.policies pol LEFT JOIN public.carriers car ON car.id = pol.carrier_id WHERE pol.agent_id = _agent
      UNION ALL
      SELECT 'call', COALESCE(outcome,'Call') || ' — ' || phone_number, created_at FROM public.call_logs WHERE agent_id = _agent
    ) x ORDER BY at DESC LIMIT 10
  )
  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM (SELECT id, first_name, last_name, email, status, created_at, last_active_at, upline_id, avatar_url FROM public.profiles WHERE id = _agent) p),
    'kpis', jsonb_build_object(
      'policies', (SELECT COUNT(*) FROM public.policies WHERE agent_id = _agent AND production_date >= _start AND production_date < _end AND public.policy_counts_as_production(status::text)),
      'premium', COALESCE((SELECT SUM(annual_premium) FROM public.policies WHERE agent_id = _agent AND production_date >= _start AND production_date < _end AND public.policy_counts_as_production(status::text)),0),
      'avg_deal', COALESCE((SELECT AVG(annual_premium) FROM public.policies WHERE agent_id = _agent AND production_date >= _start AND production_date < _end AND public.policy_counts_as_production(status::text)),0),
      'last_active', (SELECT last_active_at FROM public.profiles WHERE id = _agent)
    ),
    'monthly', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', month, 'premium', premium, 'policies', policies)) FROM prod), '[]'::jsonb),
    'status_dist', COALESCE((SELECT jsonb_agg(jsonb_build_object('status', status, 'count', cnt)) FROM status_dist), '[]'::jsonb),
    'top_carriers', COALESCE((SELECT jsonb_agg(jsonb_build_object('carrier', carrier, 'deals', deals, 'premium', premium)) FROM top_carriers), '[]'::jsonb),
    'activity', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', kind, 'label', label, 'at', at)) FROM activity), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

-- ── get_team_leaderboard ──

create or replace function public.get_team_leaderboard(_start timestamptz, _end timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
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
    FROM public.policies WHERE agent_id IN (SELECT id FROM team) AND production_date >= _start AND production_date < _end AND public.policy_counts_as_production(status::text)
    GROUP BY agent_id
  ),
  prev AS (
    SELECT agent_id, COALESCE(SUM(annual_premium),0) AS premium
    FROM public.policies WHERE agent_id IN (SELECT id FROM team) AND production_date >= v_prior_start AND production_date < _start AND public.policy_counts_as_production(status::text)
    GROUP BY agent_id
  ),
  joined AS (
    SELECT p.id, p.first_name, p.last_name,
      COALESCE(c.policies,0) AS policies,
      COALESCE(c.premium,0) AS premium,
      COALESCE(c.avg_deal,0) AS avg_deal,
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
    LEFT JOIN public.policies pol ON pol.production_date >= m.m_start AND pol.production_date < m.m_start + interval '1 month' AND public.policy_counts_as_production(pol.status::text) AND pol.agent_id IN (SELECT id FROM team)
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
END $$;

-- ── get_analytics_overview ──

CREATE OR REPLACE FUNCTION public.get_analytics_overview(_start timestamptz, _end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prior_start timestamptz := _start - (_end - _start);
  result jsonb;
BEGIN
  WITH RECURSIVE team AS (
    SELECT v_uid AS id
    UNION ALL
    SELECT p.id FROM public.profiles p JOIN team t ON p.upline_id = t.id
  ),
  cur AS (
    SELECT COUNT(*) AS deals, COALESCE(SUM(annual_premium),0) AS premium,
           COUNT(DISTINCT agent_id) AS producers
    FROM public.policies WHERE agent_id IN (SELECT id FROM team) AND production_date >= _start AND production_date < _end AND public.policy_counts_as_production(status::text)
  ),
  prev AS (
    SELECT COUNT(*) AS deals, COALESCE(SUM(annual_premium),0) AS premium,
           COUNT(DISTINCT agent_id) AS producers
    FROM public.policies WHERE agent_id IN (SELECT id FROM team) AND production_date >= v_prior_start AND production_date < _start AND public.policy_counts_as_production(status::text)
  ),
  carriers AS (
    SELECT c.name AS carrier, COUNT(*) AS deals, COALESCE(SUM(pol.annual_premium),0) AS premium
    FROM public.policies pol LEFT JOIN public.carriers c ON c.id = pol.carrier_id
    WHERE pol.agent_id IN (SELECT id FROM team) AND pol.production_date >= _start AND pol.production_date < _end AND public.policy_counts_as_production(pol.status::text)
    GROUP BY c.name ORDER BY premium DESC LIMIT 8
  ),
  team_size AS (SELECT COUNT(*) AS n FROM team),
  active_producers_now AS (
    SELECT COUNT(DISTINCT agent_id) AS n FROM public.policies
    WHERE agent_id IN (SELECT id FROM team) AND production_date >= _start AND production_date < _end AND public.policy_counts_as_production(status::text)
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'deals', (SELECT deals FROM cur),
      'premium', (SELECT premium FROM cur),
      'producers', (SELECT producers FROM cur),
      'avg_deal', CASE WHEN (SELECT deals FROM cur) > 0 THEN ROUND(((SELECT premium FROM cur)/(SELECT deals FROM cur))::numeric,2) ELSE 0 END,
      'deals_delta', CASE WHEN (SELECT deals FROM prev) > 0 THEN ROUND((100.0 * ((SELECT deals FROM cur) - (SELECT deals FROM prev))/(SELECT deals FROM prev))::numeric,1) ELSE 0 END,
      'premium_delta', CASE WHEN (SELECT premium FROM prev) > 0 THEN ROUND((100.0 * ((SELECT premium FROM cur) - (SELECT premium FROM prev))/(SELECT premium FROM prev))::numeric,1) ELSE 0 END,
      'producers_delta', CASE WHEN (SELECT producers FROM prev) > 0 THEN ROUND((100.0 * ((SELECT producers FROM cur) - (SELECT producers FROM prev))/(SELECT producers FROM prev))::numeric,1) ELSE 0 END,
      'avg_deal_delta', 0
    ),
    'conversion_rate', CASE WHEN (SELECT n FROM team_size) > 0 THEN ROUND((100.0 * (SELECT n FROM active_producers_now)/(SELECT n FROM team_size))::numeric,1) ELSE 0 END,
    'monthly_growth', CASE WHEN (SELECT premium FROM prev) > 0 THEN ROUND((100.0 * ((SELECT premium FROM cur) - (SELECT premium FROM prev))/(SELECT premium FROM prev))::numeric,1) ELSE 0 END,
    'top_carriers', COALESCE((SELECT jsonb_agg(jsonb_build_object('carrier', carrier, 'deals', deals, 'premium', premium)) FROM carriers), '[]'::jsonb),
    'total_premium', (SELECT premium FROM cur)
  ) INTO result;
  RETURN result;
END $$;

-- ── get_trends_12mo ──

CREATE OR REPLACE FUNCTION public.get_trends_12mo()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  result jsonb;
BEGIN
  WITH RECURSIVE team AS (
    SELECT v_uid AS id UNION ALL
    SELECT p.id FROM public.profiles p JOIN team t ON p.upline_id = t.id
  ),
  months AS (
    SELECT to_char(date_trunc('month', now()) - (i || ' months')::interval, 'YYYY-MM') AS month,
           date_trunc('month', now()) - (i || ' months')::interval AS m_start
    FROM generate_series(0,11) i
  ),
  series AS (
    SELECT m.month,
      COALESCE(SUM(CASE WHEN pol.agent_id = v_uid THEN pol.annual_premium ELSE 0 END),0) AS my_premium,
      COALESCE(SUM(pol.annual_premium),0) AS team_premium,
      COUNT(CASE WHEN pol.agent_id = v_uid THEN 1 END) AS my_policies,
      COUNT(pol.id) AS team_policies
    FROM months m
    LEFT JOIN public.policies pol ON pol.production_date >= m.m_start AND pol.production_date < m.m_start + interval '1 month' AND public.policy_counts_as_production(pol.status::text) AND pol.agent_id IN (SELECT id FROM team)
    GROUP BY m.month, m.m_start ORDER BY m.m_start
  )
  SELECT jsonb_build_object(
    'series', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', month, 'my_premium', my_premium, 'team_premium', team_premium, 'my_policies', my_policies, 'team_policies', team_policies)) FROM series), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

notify pgrst, 'reload schema';
