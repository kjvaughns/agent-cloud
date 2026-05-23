
-- Recursive downline policy fetch with joined client/agent/carrier names
CREATE OR REPLACE FUNCTION public.get_book_of_business(_scope text, _agent_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  client_id uuid,
  agent_id uuid,
  carrier_id uuid,
  carrier_name text,
  product text,
  policy_number text,
  status policy_status,
  monthly_premium numeric,
  annual_premium numeric,
  face_amount numeric,
  effective_date date,
  posted_at timestamptz,
  carrier_integration text,
  is_gtl boolean,
  client_first_name text,
  client_last_name text,
  agent_first_name text,
  agent_last_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE downline AS (
    SELECT id FROM public.profiles WHERE id = auth.uid()
    UNION ALL
    SELECT p.id FROM public.profiles p JOIN downline d ON p.upline_id = d.id
  ),
  scope_agents AS (
    SELECT CASE
      WHEN _scope = 'mine' THEN auth.uid()
      WHEN _scope = 'agent' AND _agent_id IS NOT NULL AND (
        _agent_id = auth.uid()
        OR public.is_in_downline(auth.uid(), _agent_id)
        OR public.has_role(auth.uid(), 'admin')
      ) THEN _agent_id
    END AS id
    WHERE _scope IN ('mine', 'agent')
    UNION ALL
    SELECT id FROM downline WHERE _scope = 'hierarchy'
    UNION ALL
    SELECT p.id FROM public.profiles p WHERE _scope = 'hierarchy' AND public.has_role(auth.uid(), 'admin')
  )
  SELECT
    pol.id, pol.client_id, pol.agent_id, pol.carrier_id,
    car.name AS carrier_name,
    pol.product, pol.policy_number, pol.status,
    pol.monthly_premium, pol.annual_premium, pol.face_amount,
    pol.effective_date, pol.posted_at, pol.carrier_integration, pol.is_gtl,
    cli.first_name AS client_first_name, cli.last_name AS client_last_name,
    pr.first_name AS agent_first_name, pr.last_name AS agent_last_name
  FROM public.policies pol
  LEFT JOIN public.clients cli ON cli.id = pol.client_id
  LEFT JOIN public.profiles pr ON pr.id = pol.agent_id
  LEFT JOIN public.carriers car ON car.id = pol.carrier_id
  WHERE pol.agent_id IN (SELECT id FROM scope_agents WHERE id IS NOT NULL)
  ORDER BY pol.posted_at DESC;
$$;

-- Downline agents for picker
CREATE OR REPLACE FUNCTION public.get_downline_agents()
RETURNS TABLE (id uuid, first_name text, last_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE downline AS (
    SELECT id FROM public.profiles WHERE upline_id = auth.uid()
    UNION ALL
    SELECT p.id FROM public.profiles p JOIN downline d ON p.upline_id = d.id
  )
  SELECT p.id, p.first_name, p.last_name
  FROM public.profiles p
  WHERE p.id IN (SELECT id FROM downline)
  ORDER BY p.first_name, p.last_name;
$$;

-- Auto follow-up when policy goes to lapse_pending
CREATE OR REPLACE FUNCTION public.policy_status_lapse_followup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'lapse_pending' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.calendar_events (agent_id, client_id, title, event_type, start_at, notes)
    VALUES (
      NEW.agent_id,
      NEW.client_id,
      'Follow up: Lapse pending — ' || COALESCE(NEW.policy_number, 'policy'),
      'followup',
      now() + interval '3 days',
      'Auto-created from Book of Business when policy moved to Lapse Pending.'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_policy_lapse_followup ON public.policies;
CREATE TRIGGER trg_policy_lapse_followup
  AFTER UPDATE OF status ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.policy_status_lapse_followup();
