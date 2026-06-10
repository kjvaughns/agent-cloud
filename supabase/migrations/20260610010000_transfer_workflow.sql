-- ── 1A: Extend transfer_requests table with full transfer sheet data ──────
ALTER TABLE public.transfer_requests
  ADD COLUMN IF NOT EXISTS writing_number       text,
  ADD COLUMN IF NOT EXISTS current_upline_name  text,
  ADD COLUMN IF NOT EXISTS current_upline_email text,
  ADD COLUMN IF NOT EXISTS reason               text,
  ADD COLUMN IF NOT EXISTS notes                text,
  ADD COLUMN IF NOT EXISTS requested_at         timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at         timestamptz;

-- ── 1B: Track transfer workflow state on profiles ─────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS needs_transfer_request       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS transfer_workflow_carriers   jsonb   DEFAULT '[]'::jsonb;

-- ── 1C: Update agent_completion to include transfer request ───────────────
CREATE OR REPLACE FUNCTION public.agent_completion(_agent uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pct    int := 0;
  v_missing text[] := ARRAY[]::text[];
  v_p      record;
  v_has_eo   bool;
  v_has_bank bool;
  v_has_dl   bool;
  v_has_aml  bool;
  v_needs_transfer bool;
  v_transfer_done  bool;
  v_has_bg_questions bool;
  v_has_license bool;
BEGIN
  SELECT
    date_of_birth IS NOT NULL                                                   AS dob,
    (street_address IS NOT NULL AND city IS NOT NULL
      AND state IS NOT NULL AND zip_code IS NOT NULL)                           AS addr,
    npn_number IS NOT NULL                                                      AS npn,
    ssn_encrypted IS NOT NULL                                                   AS ssn,
    COALESCE(needs_transfer_request, false)                                     AS needs_xfer,
    first_name IS NOT NULL AND last_name IS NOT NULL AND phone IS NOT NULL      AS basic
  INTO v_p FROM public.profiles WHERE id = _agent LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('pct', 0, 'missing', '[]'::jsonb);
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.producer_documents
    WHERE agent_id = _agent AND doc_type = 'eo_certificate'
  ) INTO v_has_eo;

  SELECT EXISTS(
    SELECT 1 FROM public.producer_banking
    WHERE agent_id = _agent
  ) INTO v_has_bank;

  SELECT EXISTS(
    SELECT 1 FROM public.producer_documents
    WHERE agent_id = _agent AND doc_type = 'drivers_license'
  ) INTO v_has_dl;

  SELECT EXISTS(
    SELECT 1 FROM public.producer_documents
    WHERE agent_id = _agent AND doc_type = 'aml_certificate'
  ) INTO v_has_aml;

  SELECT EXISTS(
    SELECT 1 FROM public.background_questions
    WHERE agent_id = _agent
  ) INTO v_has_bg_questions;

  SELECT EXISTS(
    SELECT 1 FROM public.state_licenses
    WHERE agent_id = _agent
  ) INTO v_has_license;

  IF v_p.needs_xfer THEN
    SELECT EXISTS(
      SELECT 1 FROM public.transfer_requests
      WHERE agent_id = _agent
        AND status IN ('pending', 'accepted', 'complete')
      LIMIT 1
    ) INTO v_transfer_done;
  ELSE
    v_transfer_done := true;
  END IF;

  -- ── Score breakdown (100 pts total) ──────────────────────────────────
  -- Basic profile (25 pts)
  IF v_p.basic THEN v_pct := v_pct + 5;  ELSE v_missing := array_append(v_missing, 'Name & Phone'); END IF;
  IF v_p.dob   THEN v_pct := v_pct + 5;  ELSE v_missing := array_append(v_missing, 'Date of Birth'); END IF;
  IF v_p.addr  THEN v_pct := v_pct + 5;  ELSE v_missing := array_append(v_missing, 'Home Address'); END IF;
  IF v_p.npn   THEN v_pct := v_pct + 5;  ELSE v_missing := array_append(v_missing, 'NPN Number'); END IF;
  IF v_p.ssn   THEN v_pct := v_pct + 5;  ELSE v_missing := array_append(v_missing, 'SSN (last 4)'); END IF;

  -- Documents (50 pts)
  IF v_has_eo    THEN v_pct := v_pct + 15; ELSE v_missing := array_append(v_missing, 'E&O Certificate'); END IF;
  IF v_has_bank  THEN v_pct := v_pct + 15; ELSE v_missing := array_append(v_missing, 'Banking / Direct Deposit'); END IF;
  IF v_has_dl    THEN v_pct := v_pct + 10; ELSE v_missing := array_append(v_missing, 'Driver''s License'); END IF;
  IF v_has_aml   THEN v_pct := v_pct + 10; ELSE v_missing := array_append(v_missing, 'AML Certificate'); END IF;

  -- Compliance (15 pts)
  IF v_has_bg_questions THEN v_pct := v_pct + 10; ELSE v_missing := array_append(v_missing, 'Background Questions'); END IF;
  IF v_has_license      THEN v_pct := v_pct + 5;  ELSE v_missing := array_append(v_missing, 'State License'); END IF;

  -- Transfer request (10 pts): always in the total; only missing when required and not done
  IF v_transfer_done THEN
    v_pct := v_pct + 10;
  ELSE
    v_missing := array_append(v_missing, 'Transfer Request (carrier release)');
  END IF;

  RETURN jsonb_build_object('pct', v_pct, 'missing', to_jsonb(v_missing));
END $$;
