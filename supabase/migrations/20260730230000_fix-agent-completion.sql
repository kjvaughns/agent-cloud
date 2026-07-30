-- ---------------------------------------------------------------------------
-- Fix agent_completion().
--
-- Two defects in the original, both user-visible:
--
--   1. The weights summed to 65 (20+15+10+20), so an agent who had uploaded
--      every document was shown "65% complete" forever. The producer profile
--      page has a `pct === 100` branch reading "Profile complete — you're
--      fully set up for contracting!" that could never render, and the
--      progress bar's green threshold (>= 80) was equally unreachable.
--
--   2. It read the profile fields from public.clients rather than
--      public.profiles:
--
--          SELECT date_of_birth ... INTO v_p FROM public.clients WHERE id = _agent
--          -- profiles, not clients
--
--      The comment was already there. Because v_p was then never referenced,
--      date of birth and address contributed nothing to the score at all — so
--      a function named "completion" scored four document uploads and ignored
--      every other field on the profile.
--
-- This version reads profiles, scores the details carriers actually require,
-- and totals 100. The four document labels keep their original text so that
-- anything matching on them keeps working; the new labels name a section
-- rather than a single field, because that is the level at which somebody
-- goes and fixes it.
--
-- get_team_downline() calls this too, so the Team page's completion column
-- moves with it. That is the intended correction, not a side effect.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agent_completion(_agent uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pct     int := 0;
  v_missing text[] := ARRAY[]::text[];
  v_has_details bool;
  v_has_npn     bool;
  v_has_address bool;
  v_has_eo      bool;
  v_has_bank    bool;
  v_has_dl      bool;
  v_has_aml     bool;
BEGIN
  SELECT
    (first_name IS NOT NULL AND last_name IS NOT NULL
       AND date_of_birth IS NOT NULL AND ssn_last4 IS NOT NULL),
    (npn_number IS NOT NULL AND npn_number <> ''),
    (street_address IS NOT NULL AND city IS NOT NULL
       AND state IS NOT NULL AND zip_code IS NOT NULL)
    INTO v_has_details, v_has_npn, v_has_address
    FROM public.profiles
   WHERE id = _agent
   LIMIT 1;

  -- A missing row reads as nothing filled in, which is the truthful answer.
  v_has_details := COALESCE(v_has_details, false);
  v_has_npn     := COALESCE(v_has_npn, false);
  v_has_address := COALESCE(v_has_address, false);

  SELECT EXISTS(SELECT 1 FROM public.producer_documents
                 WHERE agent_id = _agent AND doc_type = 'eo_certificate') INTO v_has_eo;
  SELECT EXISTS(SELECT 1 FROM public.producer_documents
                 WHERE agent_id = _agent AND doc_type = 'banking') INTO v_has_bank;
  SELECT EXISTS(SELECT 1 FROM public.producer_documents
                 WHERE agent_id = _agent AND doc_type = 'drivers_license') INTO v_has_dl;
  SELECT EXISTS(SELECT 1 FROM public.producer_documents
                 WHERE agent_id = _agent AND doc_type = 'aml_certificate') INTO v_has_aml;

  -- Ordered the way somebody would work through them: who you are, then where
  -- you are, then what you have to prove it.
  IF v_has_details THEN v_pct := v_pct + 15;
    ELSE v_missing := array_append(v_missing, 'Personal details'); END IF;

  IF v_has_npn THEN v_pct := v_pct + 10;
    ELSE v_missing := array_append(v_missing, 'NPN Number'); END IF;

  IF v_has_address THEN v_pct := v_pct + 15;
    ELSE v_missing := array_append(v_missing, 'Home address'); END IF;

  IF v_has_eo THEN v_pct := v_pct + 20;
    ELSE v_missing := array_append(v_missing, 'E&O Certificate'); END IF;

  IF v_has_aml THEN v_pct := v_pct + 20;
    ELSE v_missing := array_append(v_missing, 'AML Certificate'); END IF;

  IF v_has_dl THEN v_pct := v_pct + 10;
    ELSE v_missing := array_append(v_missing, 'Driver''s License'); END IF;

  IF v_has_bank THEN v_pct := v_pct + 10;
    ELSE v_missing := array_append(v_missing, 'Banking Info'); END IF;

  -- 15 + 10 + 15 + 20 + 20 + 10 + 10 = 100.
  RETURN jsonb_build_object('pct', v_pct, 'missing', to_jsonb(v_missing));
END $$;
