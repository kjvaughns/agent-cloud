-- ---------------------------------------------------------------------------
-- "POLICY POLICY SUBMITTED"
--
-- The New Deal Posted notification is built by the `policy_after_insert`
-- trigger, and reads:
--
--   COALESCE(v_client_name, 'A client') || ' — ' ||
--   COALESCE(v_carrier_name, 'policy') || ' policy submitted.'
--
-- The fallback is on the **carrier** name, and it falls back to the word
-- "policy" — which then lands immediately before the literal " policy
-- submitted." So a policy with no carrier reads:
--
--   Kenneth Thomas — policy policy submitted.
--
-- `policies.carrier_id` is nullable and always has been, so this fires on
-- anything imported from a book or entered by hand without a carrier. Not
-- every notification, as it first appeared — every carrier-less one, which in
-- a freshly imported book is most of them.
--
-- The rest of the trigger is unchanged; this rewrites one string.
-- ---------------------------------------------------------------------------

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

  -- Name the carrier when there is one, and say nothing about it when there
  -- is not, rather than substituting a word that collides with the next one.
  INSERT INTO public.notifications (user_id, title, description, type)
  VALUES (
    NEW.agent_id,
    'New Deal Posted',
    CASE
      WHEN v_carrier_name IS NOT NULL THEN
        COALESCE(v_client_name, 'A client') || ' — ' || v_carrier_name || ' policy submitted.'
      ELSE
        COALESCE(v_client_name, 'A client') || ' — new policy submitted.'
    END,
    'deal'
  );
  RETURN NEW;
END $$;
