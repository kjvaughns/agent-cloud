ALTER TABLE public.policies
  ADD COLUMN IF NOT EXISTS status_effective_date date;

ALTER TABLE public.policy_events
  ADD COLUMN IF NOT EXISTS status_effective_date date;

CREATE OR REPLACE FUNCTION public.record_policy_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.policy_events (
    policy_id, client_id, organization_id, agent_id,
    kind, from_status, to_status, source, actor_id, occurred_at,
    status_effective_date
  )
  VALUES (
    NEW.id,
    NEW.client_id,
    NEW.organization_id,
    NEW.agent_id,
    'status_change',
    OLD.status::text,
    NEW.status::text,
    CASE
      WHEN NEW.sync_source IS DISTINCT FROM OLD.sync_source AND NEW.sync_source IS NOT NULL
        THEN NEW.sync_source
      ELSE 'app'
    END,
    auth.uid(),
    now(),
    COALESCE(NEW.status_effective_date, CURRENT_DATE)
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.stop_ineligible_policy_commissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stop_date date;
BEGIN
  IF NEW.status::text IN ('lapsed', 'cancelled', 'withdrawn', 'not_taken', 'postponed', 'carrier_na')
     AND (
       OLD.status IS DISTINCT FROM NEW.status
       OR OLD.status_effective_date IS DISTINCT FROM NEW.status_effective_date
     ) THEN
    v_stop_date := COALESCE(NEW.status_effective_date, CURRENT_DATE);

    UPDATE public.commission_schedule
       SET superseded_at = now()
     WHERE policy_id = NEW.id
       AND superseded_at IS NULL
       AND status = 'pending'
       AND payment_date >= v_stop_date
       AND (
         payment_type IN ('deferred', 'trail', 'renewal')
         OR (payment_type = 'override' AND COALESCE(month_number, 0) > 0)
       );
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stop_ineligible_policy_commissions ON public.policies;
CREATE TRIGGER trg_stop_ineligible_policy_commissions
AFTER UPDATE OF status, status_effective_date ON public.policies
FOR EACH ROW
EXECUTE FUNCTION public.stop_ineligible_policy_commissions();

CREATE INDEX IF NOT EXISTS idx_policies_status_effective_date
  ON public.policies (status, status_effective_date);

CREATE INDEX IF NOT EXISTS idx_commission_schedule_live_policy_date
  ON public.commission_schedule (policy_id, payment_date)
  WHERE superseded_at IS NULL;