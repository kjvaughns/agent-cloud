
-- 1. Profile additions
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

-- 2. Reminder log
CREATE TABLE IF NOT EXISTS public.reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  sent_by uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reminder_log_agent_sent_idx ON public.reminder_log(agent_id, sent_at DESC);
ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY reminder_log_select ON public.reminder_log FOR SELECT TO authenticated
  USING (sent_by = auth.uid() OR public.is_in_downline(auth.uid(), agent_id) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY reminder_log_insert ON public.reminder_log FOR INSERT TO authenticated
  WITH CHECK (sent_by = auth.uid());

-- 3. last_active_at bump trigger
CREATE OR REPLACE FUNCTION public.bump_last_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent uuid;
BEGIN
  IF TG_TABLE_NAME = 'sms_messages' THEN
    SELECT agent_id INTO v_agent FROM public.sms_conversations WHERE id = NEW.conversation_id;
  ELSE
    v_agent := NEW.agent_id;
  END IF;
  IF v_agent IS NOT NULL THEN
    UPDATE public.profiles SET last_active_at = now() WHERE id = v_agent;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bump_last_active_policies ON public.policies;
CREATE TRIGGER bump_last_active_policies AFTER INSERT ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.bump_last_active();

DROP TRIGGER IF EXISTS bump_last_active_calls ON public.call_logs;
CREATE TRIGGER bump_last_active_calls AFTER INSERT ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.bump_last_active();

DROP TRIGGER IF EXISTS bump_last_active_sms ON public.sms_messages;
CREATE TRIGGER bump_last_active_sms AFTER INSERT ON public.sms_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_last_active();

-- 4. Completion % helper (max 85 since NPN/signed-agreement not yet tracked)
CREATE OR REPLACE FUNCTION public.agent_completion(_agent uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pct int := 0;
  v_missing text[] := ARRAY[]::text[];
  v_p record;
  v_has_eo bool;
  v_has_bank bool;
  v_has_dl bool;
  v_has_aml bool;
BEGIN
  SELECT date_of_birth IS NOT NULL AS dob,
         (street_address IS NOT NULL AND city IS NOT NULL AND state IS NOT NULL AND zip_code IS NOT NULL) AS addr
    INTO v_p FROM public.clients WHERE id = _agent LIMIT 1;
  -- profiles, not clients
  SELECT EXISTS(SELECT 1 FROM public.producer_documents WHERE agent_id = _agent AND doc_type = 'eo_certificate') INTO v_has_eo;
  SELECT EXISTS(SELECT 1 FROM public.producer_documents WHERE agent_id = _agent AND doc_type = 'banking') INTO v_has_bank;
  SELECT EXISTS(SELECT 1 FROM public.producer_documents WHERE agent_id = _agent AND doc_type = 'drivers_license') INTO v_has_dl;
  SELECT EXISTS(SELECT 1 FROM public.producer_documents WHERE agent_id = _agent AND doc_type = 'aml_certificate') INTO v_has_aml;

  IF v_has_eo THEN v_pct := v_pct + 20; ELSE v_missing := array_append(v_missing, 'E&O Certificate'); END IF;
  IF v_has_bank THEN v_pct := v_pct + 15; ELSE v_missing := array_append(v_missing, 'Banking Info'); END IF;
  IF v_has_dl THEN v_pct := v_pct + 10; ELSE v_missing := array_append(v_missing, 'Driver''s License'); END IF;
  IF v_has_aml THEN v_pct := v_pct + 20; ELSE v_missing := array_append(v_missing, 'AML Certificate'); END IF;

  RETURN jsonb_build_object('pct', v_pct, 'missing', to_jsonb(v_missing));
END $$;

-- 5. Downline RPC
CREATE OR REPLACE FUNCTION public.get_team_downline()
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
           p.status, p.last_active_at, p.created_at, 1 AS depth_level
    FROM public.profiles p WHERE p.upline_id = auth.uid()
    UNION ALL
    SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.upline_id,
           p.status, p.last_active_at, p.created_at, d.depth_level + 1
    FROM public.profiles p JOIN dl d ON p.upline_id = d.id
  )
  SELECT d.id, d.first_name, d.last_name, d.email, d.phone, d.upline_id,
         d.status, d.last_active_at, d.created_at, d.depth_level,
         COALESCE((SELECT COUNT(*)::int FROM public.agent_commission_levels WHERE agent_id = d.id), 0) AS contracts_count,
         COALESCE((SELECT COUNT(*)::int FROM public.policies WHERE agent_id = d.id), 0) AS policies_count,
         COALESCE((SELECT SUM(annual_premium) FROM public.policies WHERE agent_id = d.id), 0) AS premium_total,
         COALESCE((public.agent_completion(d.id)->>'pct')::int, 0) AS completion_pct,
         COALESCE(public.agent_completion(d.id)->'missing', '[]'::jsonb) AS missing
  FROM dl d
  ORDER BY d.depth_level, d.first_name;
$$;

-- 6. KPIs
CREATE OR REPLACE FUNCTION public.get_team_kpis()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  WITH RECURSIVE dl AS (
    SELECT id, 1 AS depth_level FROM public.profiles WHERE upline_id = auth.uid()
    UNION ALL
    SELECT p.id, d.depth_level + 1 FROM public.profiles p JOIN dl d ON p.upline_id = d.id
  ),
  base AS (SELECT * FROM dl)
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM base),
    'direct', (SELECT COUNT(*) FROM base WHERE depth_level = 1),
    'active', (SELECT COUNT(*) FROM public.profiles WHERE id IN (SELECT id FROM base) AND status = 'active'),
    'pending', (SELECT COUNT(*) FROM public.profiles WHERE id IN (SELECT id FROM base) AND status = 'pending'),
    'active_writers', (SELECT COUNT(DISTINCT agent_id) FROM public.policies WHERE agent_id IN (SELECT id FROM base) AND posted_at > now() - interval '30 days'),
    'contracts_total', (SELECT COUNT(*) FROM public.agent_commission_levels WHERE agent_id IN (SELECT id FROM base)),
    'contracts_active_pct', (
      SELECT CASE WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE p.status = 'active') / COUNT(*))
      END FROM public.agent_commission_levels acl
      JOIN public.profiles p ON p.id = acl.agent_id
      WHERE acl.agent_id IN (SELECT id FROM base)
    ),
    'max_depth', COALESCE((SELECT MAX(depth_level) FROM base), 0),
    'depth_distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('level', depth_level, 'count', cnt) ORDER BY depth_level)
      FROM (SELECT depth_level, COUNT(*) AS cnt FROM base GROUP BY depth_level) s
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

-- 7. Alerts
CREATE OR REPLACE FUNCTION public.get_team_alerts()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  WITH RECURSIVE dl AS (
    SELECT id FROM public.profiles WHERE upline_id = auth.uid()
    UNION ALL SELECT p.id FROM public.profiles p JOIN dl d ON p.upline_id = d.id
  )
  SELECT jsonb_build_object(
    'stale', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', first_name || ' ' || last_name))
                       FROM public.profiles WHERE id IN (SELECT id FROM dl)
                         AND (last_active_at IS NULL OR last_active_at < now() - interval '14 days')), '[]'::jsonb),
    'lapse', COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('id', pr.id, 'name', pr.first_name || ' ' || pr.last_name))
                       FROM public.policies pol JOIN public.profiles pr ON pr.id = pol.agent_id
                       WHERE pol.agent_id IN (SELECT id FROM dl) AND pol.status::text = 'lapse_pending'), '[]'::jsonb),
    'stuck_contracts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', cr.id, 'agent', pr.first_name || ' ' || pr.last_name))
                       FROM public.contract_requests cr JOIN public.profiles pr ON pr.id = cr.agent_id
                       WHERE cr.agent_id IN (SELECT id FROM dl) AND cr.status::text = 'issue'
                         AND cr.requested_at < now() - interval '7 days'), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

-- 8. Send reminder
CREATE OR REPLACE FUNCTION public.send_team_reminder(_target uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_recent_count int;
  v_missing jsonb;
BEGIN
  IF NOT (public.is_in_downline(auth.uid(), _target) OR public.has_role(auth.uid(), 'admin')) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  SELECT COUNT(*) INTO v_recent_count FROM public.reminder_log
   WHERE agent_id = _target AND sent_at > now() - interval '24 hours';
  IF v_recent_count > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'throttled');
  END IF;
  v_missing := public.agent_completion(_target)->'missing';
  INSERT INTO public.reminder_log(agent_id, sent_by) VALUES (_target, auth.uid());
  INSERT INTO public.notifications(user_id, title, description, type)
  VALUES (_target, 'Complete your contracting profile',
          'Your upline sent a reminder. Missing: ' || COALESCE(v_missing::text, '[]'),
          'reminder');
  RETURN jsonb_build_object('ok', true);
END $$;
