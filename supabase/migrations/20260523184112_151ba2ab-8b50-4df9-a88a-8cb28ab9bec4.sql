
CREATE OR REPLACE FUNCTION public.rc_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.case_design_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  client_id uuid,
  client_name_manual text,
  coverage_amount numeric,
  product_type text,
  primary_condition text,
  additional_conditions text,
  medications text,
  height_in integer,
  weight_lbs integer,
  tobacco_use text,
  prior_decline boolean DEFAULT false,
  prior_decline_details text,
  occupation text,
  hobbies text,
  additional_notes text,
  status text NOT NULL DEFAULT 'pending',
  response_html text,
  responded_at timestamptz,
  responded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.case_design_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY cdr_owner_select ON public.case_design_requests FOR SELECT TO authenticated
USING (agent_id = auth.uid() OR is_in_downline(auth.uid(), agent_id) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY cdr_owner_insert ON public.case_design_requests FOR INSERT TO authenticated
WITH CHECK (agent_id = auth.uid());
CREATE POLICY cdr_admin_update ON public.case_design_requests FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY cdr_admin_delete ON public.case_design_requests FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_cdr_agent ON public.case_design_requests(agent_id, created_at DESC);
CREATE INDEX idx_cdr_status ON public.case_design_requests(status, created_at DESC);

CREATE TABLE public.retirement_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  client_id uuid,
  title text,
  current_age integer,
  retirement_age integer DEFAULT 65,
  life_expectancy integer DEFAULT 90,
  current_savings numeric DEFAULT 0,
  monthly_contribution numeric DEFAULT 0,
  expected_return_pct numeric DEFAULT 6.0,
  inflation_pct numeric DEFAULT 2.5,
  healthcare_inflation_pct numeric DEFAULT 5.5,
  accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  income_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_policy_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  expenses_monthly numeric,
  healthcare_monthly numeric,
  projected_nest_egg numeric,
  projected_monthly_income numeric,
  withdrawal_rate_pct numeric,
  success_probability_pct numeric,
  status text NOT NULL DEFAULT 'draft',
  next_meeting_date date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.retirement_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY rc_owner_select ON public.retirement_cases FOR SELECT TO authenticated
USING (agent_id = auth.uid() OR is_in_downline(auth.uid(), agent_id) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY rc_owner_modify ON public.retirement_cases FOR ALL TO authenticated
USING (agent_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (agent_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_rc_agent ON public.retirement_cases(agent_id, updated_at DESC);
CREATE TRIGGER tr_rc_updated BEFORE UPDATE ON public.retirement_cases
FOR EACH ROW EXECUTE FUNCTION public.rc_touch_updated_at();
