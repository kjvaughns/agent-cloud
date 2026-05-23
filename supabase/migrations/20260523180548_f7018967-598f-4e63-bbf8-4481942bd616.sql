
-- ============ schema additions ============
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  tab text NOT NULL DEFAULT 'overview',
  insight_type text NOT NULL,
  title text NOT NULL,
  body text,
  action_text text,
  action_url text,
  dollar_impact numeric,
  agent_name text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  dismissed boolean NOT NULL DEFAULT false
);
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_insights_select ON public.ai_insights FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR public.is_in_downline(auth.uid(), agent_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY ai_insights_modify ON public.ai_insights FOR ALL TO authenticated
  USING (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.analytics_insight_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  cache_key text NOT NULL,
  payload jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, cache_key)
);
ALTER TABLE public.analytics_insight_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY analytics_insight_cache_select ON public.analytics_insight_cache FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY analytics_insight_cache_modify ON public.analytics_insight_cache FOR ALL TO authenticated
  USING (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============ challenge seeding ============
CREATE OR REPLACE FUNCTION public.seed_agent_challenges(_agent uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d_start date := CURRENT_DATE;
  d_end date := CURRENT_DATE;
  w_start date := date_trunc('week', CURRENT_DATE)::date;
  w_end date := (date_trunc('week', CURRENT_DATE) + interval '6 days')::date;
  m_start date := date_trunc('month', CURRENT_DATE)::date;
  m_end date := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;
  q_start date := date_trunc('quarter', CURRENT_DATE)::date;
  q_end date := (date_trunc('quarter', CURRENT_DATE) + interval '3 months' - interval '1 day')::date;
BEGIN
  -- Daily calls
  IF NOT EXISTS (SELECT 1 FROM public.challenges WHERE agent_id = _agent AND period = 'daily' AND start_date = d_start) THEN
    INSERT INTO public.challenges(agent_id, period, type, target_value, current_value, description, start_date, end_date)
    VALUES (_agent, 'daily', 'calls', 10,
      COALESCE((SELECT COUNT(*) FROM public.call_logs WHERE agent_id = _agent AND created_at::date = d_start), 0),
      'Make 10 outbound calls today', d_start, d_end);
  END IF;
  -- Weekly deals
  IF NOT EXISTS (SELECT 1 FROM public.challenges WHERE agent_id = _agent AND period = 'weekly' AND start_date = w_start) THEN
    INSERT INTO public.challenges(agent_id, period, type, target_value, current_value, description, start_date, end_date)
    VALUES (_agent, 'weekly', 'deals', 3,
      COALESCE((SELECT COUNT(*) FROM public.policies WHERE agent_id = _agent AND posted_at::date BETWEEN w_start AND w_end), 0),
      'Post 3 new deals this week', w_start, w_end);
  END IF;
  -- Monthly premium
  IF NOT EXISTS (SELECT 1 FROM public.challenges WHERE agent_id = _agent AND period = 'monthly' AND start_date = m_start) THEN
    INSERT INTO public.challenges(agent_id, period, type, target_value, current_value, description, start_date, end_date)
    VALUES (_agent, 'monthly', 'premium', 5000,
      COALESCE((SELECT SUM(annual_premium) FROM public.policies WHERE agent_id = _agent AND posted_at::date BETWEEN m_start AND m_end), 0),
      '$5,000 in new premium this month', m_start, m_end);
  END IF;
  -- Quarterly recruiting
  IF NOT EXISTS (SELECT 1 FROM public.challenges WHERE agent_id = _agent AND period = 'quarterly' AND start_date = q_start) THEN
    INSERT INTO public.challenges(agent_id, period, type, target_value, current_value, description, start_date, end_date)
    VALUES (_agent, 'quarterly', 'recruiting', 3,
      COALESCE((SELECT COUNT(*) FROM public.profiles WHERE upline_id = _agent AND created_at::date BETWEEN q_start AND q_end), 0),
      'Recruit 3 new agents this quarter', q_start, q_end);
  END IF;
END $$;

-- ============ progress bump trigger ============
CREATE OR REPLACE FUNCTION public.bump_challenge_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent uuid;
  r record;
  v_increment numeric;
  v_event_date date;
BEGIN
  IF TG_TABLE_NAME = 'call_logs' THEN
    v_agent := NEW.agent_id;
    v_event_date := COALESCE(NEW.created_at::date, CURRENT_DATE);
    FOR r IN SELECT * FROM public.challenges WHERE agent_id = v_agent AND type = 'calls' AND completed = false
             AND v_event_date BETWEEN start_date AND end_date
    LOOP
      UPDATE public.challenges SET current_value = current_value + 1 WHERE id = r.id;
      IF (r.current_value + 1) >= r.target_value THEN
        UPDATE public.challenges SET completed = true WHERE id = r.id;
        INSERT INTO public.trophies(agent_id, challenge_id, type) VALUES (v_agent, r.id, r.period::trophy_type);
      END IF;
    END LOOP;
  ELSIF TG_TABLE_NAME = 'policies' THEN
    v_agent := NEW.agent_id;
    v_event_date := COALESCE(NEW.posted_at::date, CURRENT_DATE);
    -- deals
    FOR r IN SELECT * FROM public.challenges WHERE agent_id = v_agent AND type = 'deals' AND completed = false
             AND v_event_date BETWEEN start_date AND end_date
    LOOP
      UPDATE public.challenges SET current_value = current_value + 1 WHERE id = r.id;
      IF (r.current_value + 1) >= r.target_value THEN
        UPDATE public.challenges SET completed = true WHERE id = r.id;
        INSERT INTO public.trophies(agent_id, challenge_id, type) VALUES (v_agent, r.id, r.period::trophy_type);
      END IF;
    END LOOP;
    -- premium
    v_increment := COALESCE(NEW.annual_premium, 0);
    IF v_increment > 0 THEN
      FOR r IN SELECT * FROM public.challenges WHERE agent_id = v_agent AND type = 'premium' AND completed = false
               AND v_event_date BETWEEN start_date AND end_date
      LOOP
        UPDATE public.challenges SET current_value = current_value + v_increment WHERE id = r.id;
        IF (r.current_value + v_increment) >= r.target_value THEN
          UPDATE public.challenges SET completed = true WHERE id = r.id;
          INSERT INTO public.trophies(agent_id, challenge_id, type) VALUES (v_agent, r.id, r.period::trophy_type);
        END IF;
      END LOOP;
    END IF;
  ELSIF TG_TABLE_NAME = 'profiles' THEN
    v_agent := NEW.upline_id;
    v_event_date := COALESCE(NEW.created_at::date, CURRENT_DATE);
    IF v_agent IS NOT NULL THEN
      FOR r IN SELECT * FROM public.challenges WHERE agent_id = v_agent AND type = 'recruiting' AND completed = false
               AND v_event_date BETWEEN start_date AND end_date
      LOOP
        UPDATE public.challenges SET current_value = current_value + 1 WHERE id = r.id;
        IF (r.current_value + 1) >= r.target_value THEN
          UPDATE public.challenges SET completed = true WHERE id = r.id;
          INSERT INTO public.trophies(agent_id, challenge_id, type) VALUES (v_agent, r.id, r.period::trophy_type);
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_bump_challenge_calls ON public.call_logs;
CREATE TRIGGER trg_bump_challenge_calls AFTER INSERT ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.bump_challenge_progress();

DROP TRIGGER IF EXISTS trg_bump_challenge_policies ON public.policies;
CREATE TRIGGER trg_bump_challenge_policies AFTER INSERT ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.bump_challenge_progress();

DROP TRIGGER IF EXISTS trg_bump_challenge_recruit ON public.profiles;
CREATE TRIGGER trg_bump_challenge_recruit AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.bump_challenge_progress();

-- ============ analytics RPCs ============
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
    FROM public.policies WHERE agent_id IN (SELECT id FROM team) AND posted_at >= _start AND posted_at < _end
  ),
  prev AS (
    SELECT COUNT(*) AS deals, COALESCE(SUM(annual_premium),0) AS premium,
           COUNT(DISTINCT agent_id) AS producers
    FROM public.policies WHERE agent_id IN (SELECT id FROM team) AND posted_at >= v_prior_start AND posted_at < _start
  ),
  carriers AS (
    SELECT c.name AS carrier, COUNT(*) AS deals, COALESCE(SUM(pol.annual_premium),0) AS premium
    FROM public.policies pol LEFT JOIN public.carriers c ON c.id = pol.carrier_id
    WHERE pol.agent_id IN (SELECT id FROM team) AND pol.posted_at >= _start AND pol.posted_at < _end
    GROUP BY c.name ORDER BY premium DESC LIMIT 8
  ),
  team_size AS (SELECT COUNT(*) AS n FROM team),
  active_producers_now AS (
    SELECT COUNT(DISTINCT agent_id) AS n FROM public.policies
    WHERE agent_id IN (SELECT id FROM team) AND posted_at >= _start AND posted_at < _end
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

CREATE OR REPLACE FUNCTION public.get_daily_report()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  d date := CURRENT_DATE;
  result jsonb;
BEGIN
  WITH RECURSIVE team AS (
    SELECT v_uid AS id UNION ALL
    SELECT p.id FROM public.profiles p JOIN team t ON p.upline_id = t.id
  ),
  active_agents AS (
    SELECT DISTINCT p.id, p.first_name, p.last_name FROM public.profiles p
    WHERE p.id IN (SELECT id FROM team)
      AND (
        EXISTS(SELECT 1 FROM public.policies WHERE agent_id = p.id AND posted_at::date = d) OR
        EXISTS(SELECT 1 FROM public.call_logs WHERE agent_id = p.id AND created_at::date = d) OR
        p.last_active_at::date = d
      )
  ),
  lapse AS (
    SELECT pol.id, c.first_name || ' ' || c.last_name AS client_name, car.name AS carrier
    FROM public.policies pol
    LEFT JOIN public.clients c ON c.id = pol.client_id
    LEFT JOIN public.carriers car ON car.id = pol.carrier_id
    WHERE pol.agent_id IN (SELECT id FROM team) AND pol.status::text = 'lapse_pending'
    LIMIT 25
  ),
  upcoming AS (
    SELECT pol.id, c.first_name || ' ' || c.last_name AS client_name, pol.effective_date
    FROM public.policies pol LEFT JOIN public.clients c ON c.id = pol.client_id
    WHERE pol.agent_id IN (SELECT id FROM team) AND pol.effective_date BETWEEN d AND d + 7
    ORDER BY pol.effective_date LIMIT 25
  )
  SELECT jsonb_build_object(
    'policies_today', (SELECT COUNT(*) FROM public.policies WHERE agent_id IN (SELECT id FROM team) AND posted_at::date = d),
    'calls_today', (SELECT COUNT(*) FROM public.call_logs WHERE agent_id IN (SELECT id FROM team) AND created_at::date = d),
    'sms_today', (SELECT COUNT(*) FROM public.sms_messages m JOIN public.sms_conversations c ON c.id = m.conversation_id WHERE c.agent_id IN (SELECT id FROM team) AND m.sent_at::date = d),
    'new_clients_today', (SELECT COUNT(*) FROM public.clients WHERE agent_id IN (SELECT id FROM team) AND created_at::date = d),
    'active_agents', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', first_name || ' ' || last_name)) FROM active_agents), '[]'::jsonb),
    'lapse_pending', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'client_name', client_name, 'carrier', carrier)) FROM lapse), '[]'::jsonb),
    'upcoming_effective', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'client_name', client_name, 'effective_date', effective_date)) FROM upcoming), '[]'::jsonb)
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
  IF NOT (auth.uid() = _agent OR public.is_in_downline(auth.uid(), _agent) OR public.has_role(auth.uid(), 'admin')) THEN
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

CREATE OR REPLACE FUNCTION public.get_team_leaderboard(_start timestamptz, _end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prior_start timestamptz := _start - (_end - _start);
  result jsonb;
BEGIN
  WITH RECURSIVE team AS (
    SELECT v_uid AS id UNION ALL
    SELECT p.id FROM public.profiles p JOIN team t ON p.upline_id = t.id
  ),
  cur AS (
    SELECT agent_id, COUNT(*) AS policies, COALESCE(SUM(annual_premium),0) AS premium, COALESCE(AVG(annual_premium),0) AS avg_deal
    FROM public.policies WHERE agent_id IN (SELECT id FROM team) AND posted_at >= _start AND posted_at < _end
    GROUP BY agent_id
  ),
  prev AS (
    SELECT agent_id, COALESCE(SUM(annual_premium),0) AS premium
    FROM public.policies WHERE agent_id IN (SELECT id FROM team) AND posted_at >= v_prior_start AND posted_at < _start
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
    LEFT JOIN public.policies pol ON pol.posted_at >= m.m_start AND pol.posted_at < m.m_start + interval '1 month' AND pol.agent_id IN (SELECT id FROM team)
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

CREATE OR REPLACE FUNCTION public.get_carrier_breakdown(_start timestamptz, _end timestamptz, _agent uuid DEFAULT NULL)
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
    LEFT JOIN public.policies pol ON pol.posted_at >= m.m_start AND pol.posted_at < m.m_start + interval '1 month' AND pol.agent_id IN (SELECT id FROM team)
    GROUP BY m.month, m.m_start ORDER BY m.m_start
  )
  SELECT jsonb_build_object(
    'series', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', month, 'my_premium', my_premium, 'team_premium', team_premium, 'my_policies', my_policies, 'team_policies', team_policies)) FROM series), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.get_policy_analytics()
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
  status_dist AS (
    SELECT status::text AS status, COUNT(*) AS cnt, COALESCE(AVG(annual_premium),0) AS avg_premium
    FROM public.policies WHERE agent_id IN (SELECT id FROM team) GROUP BY status
  ),
  months AS (
    SELECT to_char(date_trunc('month', now()) - (i || ' months')::interval, 'YYYY-MM') AS month,
           date_trunc('month', now()) - (i || ' months')::interval AS m_start
    FROM generate_series(0,5) i
  ),
  monthly_status AS (
    SELECT m.month, pol.status::text AS status, COUNT(*) AS cnt
    FROM months m JOIN public.policies pol ON pol.posted_at >= m.m_start AND pol.posted_at < m.m_start + interval '1 month' AND pol.agent_id IN (SELECT id FROM team)
    GROUP BY m.month, m.m_start, pol.status ORDER BY m.m_start
  ),
  at_risk AS (
    SELECT pol.id, c.first_name || ' ' || c.last_name AS client_name, c.id AS client_id, car.name AS carrier,
      pol.monthly_premium, pol.posted_at
    FROM public.policies pol LEFT JOIN public.clients c ON c.id = pol.client_id LEFT JOIN public.carriers car ON car.id = pol.carrier_id
    WHERE pol.agent_id IN (SELECT id FROM team) AND pol.status::text = 'lapse_pending'
    ORDER BY pol.posted_at DESC LIMIT 50
  )
  SELECT jsonb_build_object(
    'status_dist', COALESCE((SELECT jsonb_agg(jsonb_build_object('status', status, 'count', cnt, 'avg_premium', avg_premium)) FROM status_dist), '[]'::jsonb),
    'monthly_status', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', month, 'status', status, 'count', cnt)) FROM monthly_status), '[]'::jsonb),
    'at_risk', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'client_name', client_name, 'client_id', client_id, 'carrier', carrier, 'monthly_premium', monthly_premium, 'posted_at', posted_at)) FROM at_risk), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.get_quality_metrics()
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
  persist AS (
    SELECT COUNT(*) FILTER (WHERE status::text = 'active') AS active_cnt, COUNT(*) AS total
    FROM public.policies WHERE agent_id IN (SELECT id FROM team) AND effective_date <= (CURRENT_DATE - interval '13 months')
  ),
  lapse_12 AS (
    SELECT COUNT(*) FILTER (WHERE status::text IN ('lapsed','lapse_pending')) AS lapsed, COUNT(*) AS total
    FROM public.policies WHERE agent_id IN (SELECT id FROM team) AND posted_at >= now() - interval '12 months'
  ),
  by_carrier AS (
    SELECT c.name AS carrier, COUNT(*) AS placed,
      COUNT(*) FILTER (WHERE pol.status::text = 'active') AS active_cnt,
      COUNT(*) FILTER (WHERE pol.status::text IN ('lapsed','lapse_pending')) AS lapsed
    FROM public.policies pol LEFT JOIN public.carriers c ON c.id = pol.carrier_id
    WHERE pol.agent_id IN (SELECT id FROM team) GROUP BY c.name
  ),
  by_agent AS (
    SELECT p.id, p.first_name || ' ' || p.last_name AS name, COUNT(*) AS placed,
      COUNT(*) FILTER (WHERE pol.status::text = 'active') AS active_cnt,
      COUNT(*) FILTER (WHERE pol.status::text IN ('lapsed','lapse_pending')) AS lapsed
    FROM public.profiles p LEFT JOIN public.policies pol ON pol.agent_id = p.id
    WHERE p.id IN (SELECT id FROM team) GROUP BY p.id, p.first_name, p.last_name HAVING COUNT(pol.id) > 0
  ),
  lapse_trend AS (
    SELECT to_char(date_trunc('month', m_start), 'YYYY-MM') AS month,
      (SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE status::text IN ('lapsed','lapse_pending'))/COUNT(*),1) END
       FROM public.policies WHERE agent_id IN (SELECT id FROM team) AND posted_at >= m_start AND posted_at < m_start + interval '1 month') AS lapse_rate
    FROM (SELECT date_trunc('month', now()) - (i || ' months')::interval AS m_start FROM generate_series(0,11) i) s
    ORDER BY m_start
  )
  SELECT jsonb_build_object(
    'persistency_pct', CASE WHEN (SELECT total FROM persist) > 0 THEN ROUND(100.0 * (SELECT active_cnt FROM persist)/(SELECT total FROM persist),1) ELSE NULL END,
    'lapse_rate_pct', CASE WHEN (SELECT total FROM lapse_12) > 0 THEN ROUND(100.0 * (SELECT lapsed FROM lapse_12)/(SELECT total FROM lapse_12),1) ELSE 0 END,
    'avg_duration_months', COALESCE((SELECT ROUND(AVG(EXTRACT(EPOCH FROM (now() - posted_at))/2629800)::numeric, 1) FROM public.policies WHERE agent_id IN (SELECT id FROM team)), 0),
    'by_carrier', COALESCE((SELECT jsonb_agg(jsonb_build_object('carrier', carrier, 'placed', placed, 'active', active_cnt, 'lapsed', lapsed, 'persistency_pct', CASE WHEN placed > 0 THEN ROUND(100.0 * active_cnt/placed,1) ELSE 0 END)) FROM by_carrier), '[]'::jsonb),
    'by_agent', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'placed', placed, 'active', active_cnt, 'lapsed', lapsed, 'persistency_pct', CASE WHEN placed > 0 THEN ROUND(100.0 * active_cnt/placed,1) ELSE 0 END)) FROM by_agent), '[]'::jsonb),
    'lapse_trend', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', month, 'lapse_rate', lapse_rate)) FROM lapse_trend), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.get_recruiting_funnel()
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
  funnel AS (
    SELECT stage::text AS stage, COUNT(*) AS cnt FROM public.recruiting_prospects
    WHERE recruiter_id IN (SELECT id FROM team) GROUP BY stage
  ),
  months AS (
    SELECT to_char(date_trunc('month', now()) - (i || ' months')::interval, 'YYYY-MM') AS month,
           date_trunc('month', now()) - (i || ' months')::interval AS m_start
    FROM generate_series(0,11) i
  ),
  monthly_onboarded AS (
    SELECT m.month, COUNT(p.id) AS cnt
    FROM months m LEFT JOIN public.profiles p ON p.created_at >= m.m_start AND p.created_at < m.m_start + interval '1 month' AND p.upline_id IN (SELECT id FROM team)
    GROUP BY m.month, m.m_start ORDER BY m.m_start
  )
  SELECT jsonb_build_object(
    'funnel', COALESCE((SELECT jsonb_agg(jsonb_build_object('stage', stage, 'count', cnt)) FROM funnel), '[]'::jsonb),
    'monthly_onboarded', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', month, 'count', cnt)) FROM monthly_onboarded), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;
