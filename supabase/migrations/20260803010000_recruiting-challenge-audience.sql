-- ---------------------------------------------------------------------------
-- "RECRUIT 3 NEW AGENTS THIS QUARTER" — TO SOMEBODY WITH NO AGENTS
--
-- `seed_agent_challenges` runs on every read of the challenges panel and seeds
-- four goals. Three are about selling. The fourth is:
--
--   'Recruit 3 new agents this quarter'
--
-- inserted unconditionally, for everybody, measured against
-- `profiles.upline_id = _agent`.
--
-- A brand-new agent — no licence yet, no carrier contract, no first policy —
-- opens Reports and is given a recruiting quota. Recruiting is not their job
-- and will not be for months. It is the loudest thing on the page and it is
-- aimed at somebody else.
--
-- Two changes, both narrow:
--
--   The recruiting challenge is seeded only for somebody who already has at
--   least one agent beneath them. Recruiting your second agent is a real goal;
--   recruiting your first when you have not sold anything is not the next
--   thing you should be doing.
--
--   The three selling challenges are unchanged. Those are the job from day one.
--
-- Existing rows are left alone rather than deleted — a quarter somebody is
-- part-way through is theirs, and silently removing a goal is its own kind of
-- confusing. They stop being re-seeded once the quarter turns.
--
-- The panel that renders these is headed "AI-Powered Sales Challenges". They
-- are static SQL literals. Not renaming it here, but it is worth knowing.
-- ---------------------------------------------------------------------------

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
  has_downline boolean;
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

  -- Quarterly recruiting — only for somebody who already recruits.
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE upline_id = _agent
       AND status NOT IN ('inactive', 'terminated')
  ) INTO has_downline;

  IF has_downline
     AND NOT EXISTS (SELECT 1 FROM public.challenges WHERE agent_id = _agent AND period = 'quarterly' AND start_date = q_start) THEN
    INSERT INTO public.challenges(agent_id, period, type, target_value, current_value, description, start_date, end_date)
    VALUES (_agent, 'quarterly', 'recruiting', 3,
      COALESCE((SELECT COUNT(*) FROM public.profiles WHERE upline_id = _agent AND created_at::date BETWEEN q_start AND q_end), 0),
      'Recruit 3 new agents this quarter', q_start, q_end);
  END IF;
END $$;

notify pgrst, 'reload schema';
