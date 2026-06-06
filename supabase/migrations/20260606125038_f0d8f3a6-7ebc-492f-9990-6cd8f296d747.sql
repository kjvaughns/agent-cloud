
-- Backfill: move imported-field blob from clients.notes into contact_history as imported_note entries
DO $$
DECLARE
  r RECORD;
  ln TEXT;
  detail_lines TEXT[];
  matched_any BOOLEAN;
  only_imported BOOLEAN;
BEGIN
  FOR r IN
    SELECT id, agent_id, assigned_to_email, notes
    FROM public.clients
    WHERE notes IS NOT NULL
      AND notes ~ '^(Medical:|Reminder:|Smoker:|Monthly income:|Employment:|Pitch carrier:|Face amount:|Policy #:|Callback:)'
  LOOP
    detail_lines := ARRAY[]::TEXT[];
    matched_any := FALSE;
    only_imported := TRUE;

    FOREACH ln IN ARRAY regexp_split_to_array(r.notes, E'\n') LOOP
      IF ln ~ '^\s*(Medical|Reminder):' THEN
        matched_any := TRUE;
        INSERT INTO public.contact_history (client_id, agent_id, assigned_to_email, contact_type, note)
        VALUES (r.id, r.agent_id, r.assigned_to_email, 'imported_note', ln);
      ELSIF ln ~ '^\s*(Smoker|Monthly income|Employment|Pitch carrier|Face amount|Policy #|Callback):' THEN
        matched_any := TRUE;
        detail_lines := array_append(detail_lines, ln);
      ELSIF length(btrim(ln)) > 0 THEN
        only_imported := FALSE;
      END IF;
    END LOOP;

    IF array_length(detail_lines, 1) > 0 THEN
      INSERT INTO public.contact_history (client_id, agent_id, assigned_to_email, contact_type, note)
      VALUES (
        r.id, r.agent_id, r.assigned_to_email, 'imported_note',
        'Imported details:' || E'\n' || array_to_string(detail_lines, E'\n')
      );
    END IF;

    IF matched_any AND only_imported THEN
      UPDATE public.clients SET notes = NULL WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
