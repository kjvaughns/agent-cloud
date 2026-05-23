
-- 1. Extend event_type enum (it's USER-DEFINED)
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['appointment','birthday','policy_starting_soon','beneficiary_checkin','lapse_follow_up','policy_anniversary','follow_up','meeting','call','other']
  LOOP
    BEGIN
      EXECUTE format('ALTER TYPE event_type ADD VALUE IF NOT EXISTS %L', v);
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
END $$;

-- 2. Add columns
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS policy_id uuid,
  ADD COLUMN IF NOT EXISTS all_day boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_minutes integer,
  ADD COLUMN IF NOT EXISTS is_auto_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_rule text,
  ADD COLUMN IF NOT EXISTS color text;

CREATE INDEX IF NOT EXISTS idx_calendar_events_agent_start
  ON public.calendar_events(agent_id, start_at);

-- 3. Realtime
ALTER TABLE public.calendar_events REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='calendar_events';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_events';
  END IF;
END $$;

-- 4. Birthday trigger on clients
CREATE OR REPLACE FUNCTION public.client_birthday_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_next_bday date;
  v_this_year date;
BEGIN
  IF NEW.date_of_birth IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.date_of_birth IS NOT DISTINCT FROM NEW.date_of_birth THEN
    RETURN NEW;
  END IF;

  v_this_year := make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int,
                           EXTRACT(MONTH FROM NEW.date_of_birth)::int,
                           EXTRACT(DAY FROM NEW.date_of_birth)::int);
  v_next_bday := CASE WHEN v_this_year < CURRENT_DATE THEN v_this_year + interval '1 year' ELSE v_this_year END;

  DELETE FROM public.calendar_events
   WHERE client_id = NEW.id AND event_type::text = 'birthday' AND is_auto_generated = true;

  INSERT INTO public.calendar_events
    (agent_id, client_id, title, event_type, start_at, all_day, is_auto_generated, recurrence_rule, color, notes)
  VALUES
    (NEW.agent_id, NEW.id,
     '🎂 Birthday: ' || NEW.first_name || ' ' || NEW.last_name,
     'birthday', v_next_bday::timestamptz, true, true, 'FREQ=YEARLY', '#ec4899',
     'Auto-generated birthday reminder.');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_client_birthday ON public.clients;
CREATE TRIGGER trg_client_birthday
AFTER INSERT OR UPDATE OF date_of_birth ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.client_birthday_event();

-- 5. Replace policy_after_insert to use policy_starting_soon type
CREATE OR REPLACE FUNCTION public.policy_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_name text;
  v_carrier_name text;
  v_monthly numeric;
BEGIN
  SELECT first_name || ' ' || last_name INTO v_client_name FROM public.clients WHERE id = NEW.client_id;
  SELECT name INTO v_carrier_name FROM public.carriers WHERE id = NEW.carrier_id;
  v_monthly := NEW.monthly_premium;

  IF NEW.effective_date IS NOT NULL THEN
    INSERT INTO public.calendar_events
      (agent_id, client_id, policy_id, title, event_type, start_at, all_day, is_auto_generated, color, notes)
    VALUES (
      NEW.agent_id, NEW.client_id, NEW.id,
      '📋 Policy Starting Soon — ' || COALESCE(v_client_name, 'client'),
      'policy_starting_soon',
      (NEW.effective_date - interval '30 days')::timestamptz,
      true, true, '#10b981',
      COALESCE(v_carrier_name,'') || CASE WHEN v_monthly IS NOT NULL THEN ' — $' || to_char(v_monthly,'FM999990.00') || '/month' ELSE '' END
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
END $$;

-- 6. Policy status change trigger: lapse_follow_up + policy_anniversary
CREATE OR REPLACE FUNCTION public.policy_status_followups()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_name text;
  v_carrier_name text;
  v_anniversary timestamptz;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  SELECT first_name || ' ' || last_name INTO v_client_name FROM public.clients WHERE id = NEW.client_id;
  SELECT name INTO v_carrier_name FROM public.carriers WHERE id = NEW.carrier_id;

  IF NEW.status::text = 'lapse_pending' THEN
    INSERT INTO public.calendar_events
      (agent_id, client_id, policy_id, title, event_type, start_at, is_auto_generated, color, notes)
    VALUES (
      NEW.agent_id, NEW.client_id, NEW.id,
      '⚠️ Lapse Follow-Up — ' || COALESCE(v_client_name,'client') || ' — ' || COALESCE(v_carrier_name,''),
      'lapse_follow_up',
      (now() + interval '3 days'),
      true, '#ef4444',
      'Urgent: policy moved to lapse pending.'
    );
  END IF;

  IF NEW.status::text = 'active' AND NEW.effective_date IS NOT NULL THEN
    v_anniversary := (NEW.effective_date + interval '1 year')::timestamptz;
    INSERT INTO public.calendar_events
      (agent_id, client_id, policy_id, title, event_type, start_at, all_day, is_auto_generated, recurrence_rule, color, notes)
    VALUES (
      NEW.agent_id, NEW.client_id, NEW.id,
      '🏆 Policy Anniversary — ' || COALESCE(v_client_name,'client'),
      'policy_anniversary', v_anniversary, true, true, 'FREQ=YEARLY', '#a855f7',
      'Annual policy anniversary.'
    );
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_policy_status_lapse_followup ON public.policies;
DROP TRIGGER IF EXISTS trg_policy_status_followups ON public.policies;
CREATE TRIGGER trg_policy_status_followups
AFTER UPDATE OF status ON public.policies
FOR EACH ROW EXECUTE FUNCTION public.policy_status_followups();

-- Ensure policy_after_insert trigger is wired
DROP TRIGGER IF EXISTS trg_policy_after_insert ON public.policies;
CREATE TRIGGER trg_policy_after_insert
AFTER INSERT ON public.policies
FOR EACH ROW EXECUTE FUNCTION public.policy_after_insert();

-- 7. Beneficiary trigger
CREATE OR REPLACE FUNCTION public.beneficiary_checkin_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_agent_id uuid;
  v_client_name text;
  v_eff date;
  v_next timestamptz;
BEGIN
  SELECT c.agent_id, c.first_name || ' ' || c.last_name
    INTO v_agent_id, v_client_name
    FROM public.clients c WHERE c.id = NEW.client_id;

  SELECT effective_date INTO v_eff
    FROM public.policies
   WHERE client_id = NEW.client_id AND status::text = 'active' AND effective_date IS NOT NULL
   ORDER BY effective_date DESC LIMIT 1;

  IF v_eff IS NULL OR v_agent_id IS NULL THEN RETURN NEW; END IF;

  v_next := (v_eff + interval '1 year')::timestamptz;
  IF v_next < now() THEN
    v_next := (v_eff + (EXTRACT(YEAR FROM age(CURRENT_DATE, v_eff))::int + 1) * interval '1 year')::timestamptz;
  END IF;

  INSERT INTO public.calendar_events
    (agent_id, client_id, title, event_type, start_at, all_day, is_auto_generated, recurrence_rule, color, notes)
  VALUES (
    v_agent_id, NEW.client_id,
    '💙 Beneficiary Check-In — ' || COALESCE(v_client_name,'client'),
    'beneficiary_checkin', v_next, true, true, 'FREQ=YEARLY', '#f97316',
    'Annual beneficiary review.'
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_beneficiary_checkin ON public.beneficiaries;
CREATE TRIGGER trg_beneficiary_checkin
AFTER INSERT ON public.beneficiaries
FOR EACH ROW EXECUTE FUNCTION public.beneficiary_checkin_event();
