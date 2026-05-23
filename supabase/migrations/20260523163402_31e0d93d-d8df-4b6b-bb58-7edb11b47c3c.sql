
-- GTL flag on policies
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS is_gtl boolean NOT NULL DEFAULT false;

-- commission_schedule table
CREATE TABLE IF NOT EXISTS public.commission_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.policies(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  source_agent_id uuid,
  payment_date date NOT NULL,
  payment_type text NOT NULL CHECK (payment_type IN ('advance','deferred','override','renewal')),
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  paid_at timestamptz,
  carrier text,
  product text,
  is_gtl boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_schedule_agent_date ON public.commission_schedule(agent_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_commission_schedule_agent_status ON public.commission_schedule(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_commission_schedule_policy ON public.commission_schedule(policy_id);

ALTER TABLE public.commission_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY commission_schedule_owner_select ON public.commission_schedule
  FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR public.is_in_downline(auth.uid(), agent_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY commission_schedule_owner_modify ON public.commission_schedule
  FOR ALL TO authenticated
  USING (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (agent_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Auto-generation function
CREATE OR REPLACE FUNCTION public.generate_commission_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level_pct numeric;
  v_total_year1 numeric;
  v_advance numeric;
  v_balance numeric;
  v_carrier_name text;
  v_carrier_id uuid;
  v_current_agent uuid;
  v_current_pct numeric;
  v_upline uuid;
  v_upline_pct numeric;
  v_override_pct numeric;
  v_depth int := 0;
BEGIN
  -- only generate for active policies with annual premium
  IF NEW.status::text <> 'active' OR NEW.annual_premium IS NULL OR NEW.annual_premium <= 0 THEN
    RETURN NEW;
  END IF;

  -- avoid duplicates
  IF EXISTS (SELECT 1 FROM public.commission_schedule WHERE policy_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_carrier_id := NEW.carrier_id;
  SELECT name INTO v_carrier_name FROM public.carriers WHERE id = v_carrier_id;

  -- agent level pct (decimal 0..1)
  SELECT assigned_pct INTO v_level_pct
  FROM public.agent_commission_levels
  WHERE agent_id = NEW.agent_id AND carrier_id = v_carrier_id
  LIMIT 1;

  IF v_level_pct IS NULL THEN
    v_level_pct := 0.70;
  END IF;
  -- normalize: if stored as 70 instead of 0.70
  IF v_level_pct > 1 THEN v_level_pct := v_level_pct / 100; END IF;

  v_total_year1 := NEW.annual_premium * v_level_pct;

  IF NEW.is_gtl THEN
    v_advance := LEAST(v_total_year1 * 0.50, 600);
    v_balance := v_total_year1 - v_advance;
    INSERT INTO public.commission_schedule(policy_id, agent_id, payment_date, payment_type, amount, carrier, product, is_gtl)
    VALUES (NEW.id, NEW.agent_id, COALESCE(NEW.effective_date, CURRENT_DATE), 'advance', v_advance, v_carrier_name, NEW.product, true);
    FOR i IN 7..12 LOOP
      INSERT INTO public.commission_schedule(policy_id, agent_id, payment_date, payment_type, amount, carrier, product, is_gtl)
      VALUES (NEW.id, NEW.agent_id, COALESCE(NEW.effective_date, CURRENT_DATE) + (i || ' months')::interval, 'deferred', v_balance / 6, v_carrier_name, NEW.product, true);
    END LOOP;
  ELSE
    v_advance := v_total_year1 * 0.75;
    INSERT INTO public.commission_schedule(policy_id, agent_id, payment_date, payment_type, amount, carrier, product)
    VALUES (NEW.id, NEW.agent_id, COALESCE(NEW.effective_date, CURRENT_DATE), 'advance', v_advance, v_carrier_name, NEW.product);
    FOR i IN 9..11 LOOP
      INSERT INTO public.commission_schedule(policy_id, agent_id, payment_date, payment_type, amount, carrier, product)
      VALUES (NEW.id, NEW.agent_id, COALESCE(NEW.effective_date, CURRENT_DATE) + (i || ' months')::interval, 'deferred', (v_total_year1 * 0.25) / 3, v_carrier_name, NEW.product);
    END LOOP;
  END IF;

  -- Overrides: walk upline
  v_current_agent := NEW.agent_id;
  v_current_pct := v_level_pct;

  WHILE v_depth < 5 LOOP
    SELECT upline_id INTO v_upline FROM public.profiles WHERE id = v_current_agent;
    EXIT WHEN v_upline IS NULL;

    SELECT assigned_pct INTO v_upline_pct
    FROM public.agent_commission_levels
    WHERE agent_id = v_upline AND carrier_id = v_carrier_id
    LIMIT 1;

    IF v_upline_pct IS NOT NULL THEN
      IF v_upline_pct > 1 THEN v_upline_pct := v_upline_pct / 100; END IF;
      v_override_pct := v_upline_pct - v_current_pct;
      IF v_override_pct > 0 THEN
        INSERT INTO public.commission_schedule(policy_id, agent_id, source_agent_id, payment_date, payment_type, amount, carrier, product)
        VALUES (NEW.id, v_upline, NEW.agent_id, COALESCE(NEW.effective_date, CURRENT_DATE), 'override', NEW.annual_premium * v_override_pct, v_carrier_name, NEW.product);
      END IF;
      v_current_pct := v_upline_pct;
    END IF;

    v_current_agent := v_upline;
    v_depth := v_depth + 1;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_commission_schedule ON public.policies;
CREATE TRIGGER trg_generate_commission_schedule
AFTER INSERT OR UPDATE OF status ON public.policies
FOR EACH ROW
EXECUTE FUNCTION public.generate_commission_schedule();
