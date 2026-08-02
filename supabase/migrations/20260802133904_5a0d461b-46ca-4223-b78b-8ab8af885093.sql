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
    WHERE pol.agent_id IN (SELECT id FROM scope) AND pol.posted_at >= _start AND pol.posted_at < _end
    GROUP BY c.name ORDER BY premium DESC
  ),
  top_agent_per_carrier AS (
    SELECT DISTINCT ON (c.name) c.name AS carrier, p.first_name || ' ' || p.last_name AS agent_name, SUM(pol.annual_premium) AS prem
    FROM public.policies pol LEFT JOIN public.carriers c ON c.id = pol.carrier_id LEFT JOIN public.profiles p ON p.id = pol.agent_id
    WHERE pol.agent_id IN (SELECT id FROM scope) AND pol.posted_at >= _start AND pol.posted_at < _end
    GROUP BY c.name, p.first_name, p.last_name ORDER BY c.name, prem DESC
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object('carrier', b.carrier, 'deals', b.deals, 'premium', b.premium, 'avg_deal', b.avg_deal, 'top_agent', t.agent_name)) FROM by_carrier b LEFT JOIN top_agent_per_carrier t ON t.carrier = b.carrier), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

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
      AND pol.posted_at >= m.m_start AND pol.posted_at < m.m_start + interval '1 month'
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
      'policies', (SELECT COUNT(*) FROM public.policies WHERE agent_id = _agent AND posted_at >= _start AND posted_at < _end),
      'premium', COALESCE((SELECT SUM(annual_premium) FROM public.policies WHERE agent_id = _agent AND posted_at >= _start AND posted_at < _end),0),
      'avg_deal', COALESCE((SELECT AVG(annual_premium) FROM public.policies WHERE agent_id = _agent AND posted_at >= _start AND posted_at < _end),0),
      'last_active', (SELECT last_active_at FROM public.profiles WHERE id = _agent)
    ),
    'monthly', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', month, 'premium', premium, 'policies', policies)) FROM prod), '[]'::jsonb),
    'status_dist', COALESCE((SELECT jsonb_agg(jsonb_build_object('status', status, 'count', cnt)) FROM status_dist), '[]'::jsonb),
    'top_carriers', COALESCE((SELECT jsonb_agg(jsonb_build_object('carrier', carrier, 'deals', deals, 'premium', premium)) FROM top_carriers), '[]'::jsonb),
    'activity', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', kind, 'label', label, 'at', at)) FROM activity), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

notify pgrst, 'reload schema';