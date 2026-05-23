
-- 1. Add 'manager' to app_role enum if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'manager'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')) THEN
    ALTER TYPE public.app_role ADD VALUE 'manager';
  END IF;
END $$;

-- 2. notifications.type column
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type text;

-- 3. Extend announcements admin write policy to include managers
DROP POLICY IF EXISTS announcements_admin_write ON public.announcements;
CREATE POLICY announcements_admin_write ON public.announcements
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- 4. news_articles table
CREATE TABLE IF NOT EXISTS public.news_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text,
  url text NOT NULL UNIQUE,
  source_name text,
  category text,
  image_url text,
  published_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_news_articles_published_at ON public.news_articles (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_category ON public.news_articles (category);
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS news_articles_read ON public.news_articles;
CREATE POLICY news_articles_read ON public.news_articles
  FOR SELECT TO authenticated USING (true);

-- 5. Dashboard metrics RPC
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
      COALESCE(SUM(annual_premium), 0) AS team_prod,
      COUNT(*) FILTER (WHERE is_mine) AS my_policies,
      COUNT(*) AS team_policies
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
      COALESCE(SUM(pol.annual_premium), 0) AS team_prod,
      COUNT(*) FILTER (WHERE pol.agent_id = v_uid) AS my_policies,
      COUNT(pol.id) AS team_policies
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

-- 6. Trigger on policy INSERT: schedule "Policy Starting Soon" calendar event + notification
CREATE OR REPLACE FUNCTION public.policy_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_name text;
  v_carrier_name text;
BEGIN
  SELECT first_name || ' ' || last_name INTO v_client_name FROM public.clients WHERE id = NEW.client_id;
  SELECT name INTO v_carrier_name FROM public.carriers WHERE id = NEW.carrier_id;

  IF NEW.effective_date IS NOT NULL THEN
    INSERT INTO public.calendar_events (agent_id, client_id, title, event_type, start_at, notes)
    VALUES (
      NEW.agent_id, NEW.client_id,
      'Policy Starting Soon — ' || COALESCE(v_client_name, 'client'),
      'followup',
      (NEW.effective_date - interval '30 days'),
      'Auto-created when policy was posted.'
    );
  END IF;

  INSERT INTO public.notifications (user_id, title, description, type)
  VALUES (
    NEW.agent_id,
    'New Deal Posted',
    COALESCE(v_client_name, 'A client') || ' — ' || COALESCE(v_carrier_name, 'policy') || ' policy submitted.',
    'deal'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_policy_after_insert ON public.policies;
CREATE TRIGGER trg_policy_after_insert
AFTER INSERT ON public.policies
FOR EACH ROW EXECUTE FUNCTION public.policy_after_insert();

-- 7. Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
