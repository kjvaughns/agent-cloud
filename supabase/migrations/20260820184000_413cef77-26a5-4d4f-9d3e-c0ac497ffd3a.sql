CREATE OR REPLACE FUNCTION public.bump_challenge_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        INSERT INTO public.trophies(agent_id, challenge_id, type, organization_id) VALUES (v_agent, r.id, r.period, r.organization_id);
      END IF;
    END LOOP;
  ELSIF TG_TABLE_NAME = 'policies' THEN
    v_agent := NEW.agent_id;
    v_event_date := COALESCE(NEW.posted_at::date, CURRENT_DATE);
    FOR r IN SELECT * FROM public.challenges WHERE agent_id = v_agent AND type = 'deals' AND completed = false
             AND v_event_date BETWEEN start_date AND end_date
    LOOP
      UPDATE public.challenges SET current_value = current_value + 1 WHERE id = r.id;
      IF (r.current_value + 1) >= r.target_value THEN
        UPDATE public.challenges SET completed = true WHERE id = r.id;
        INSERT INTO public.trophies(agent_id, challenge_id, type, organization_id) VALUES (v_agent, r.id, r.period, r.organization_id);
      END IF;
    END LOOP;
    v_increment := COALESCE(NEW.annual_premium, 0);
    IF v_increment > 0 THEN
      FOR r IN SELECT * FROM public.challenges WHERE agent_id = v_agent AND type = 'premium' AND completed = false
               AND v_event_date BETWEEN start_date AND end_date
      LOOP
        UPDATE public.challenges SET current_value = current_value + v_increment WHERE id = r.id;
        IF (r.current_value + v_increment) >= r.target_value THEN
          UPDATE public.challenges SET completed = true WHERE id = r.id;
          INSERT INTO public.trophies(agent_id, challenge_id, type, organization_id) VALUES (v_agent, r.id, r.period, r.organization_id);
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
          INSERT INTO public.trophies(agent_id, challenge_id, type, organization_id) VALUES (v_agent, r.id, r.period, r.organization_id);
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END $function$;