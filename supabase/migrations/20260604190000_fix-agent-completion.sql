-- Fix agent_completion: was querying public.clients instead of public.profiles,
-- and never actually used the profile data in scoring.
-- Now queries profiles correctly and scores profile completeness alongside documents.
CREATE OR REPLACE FUNCTION public.agent_completion(_agent uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pct int := 0;
  v_missing text[] := ARRAY[]::text[];
  v_p record;
  v_has_eo bool;
  v_has_bank bool;
  v_has_dl bool;
  v_has_aml bool;
BEGIN
  SELECT
    date_of_birth IS NOT NULL AS dob,
    (street_address IS NOT NULL AND city IS NOT NULL AND state IS NOT NULL AND zip_code IS NOT NULL) AS addr,
    npn_number IS NOT NULL AS npn,
    ssn_encrypted IS NOT NULL AS ssn
  INTO v_p FROM public.profiles WHERE id = _agent LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('pct', 0, 'missing', '[]'::jsonb);
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.producer_documents WHERE agent_id = _agent AND doc_type = 'eo_certificate') INTO v_has_eo;
  SELECT EXISTS(SELECT 1 FROM public.producer_documents WHERE agent_id = _agent AND doc_type = 'banking') INTO v_has_bank;
  SELECT EXISTS(SELECT 1 FROM public.producer_documents WHERE agent_id = _agent AND doc_type = 'drivers_license') INTO v_has_dl;
  SELECT EXISTS(SELECT 1 FROM public.producer_documents WHERE agent_id = _agent AND doc_type = 'aml_certificate') INTO v_has_aml;

  -- Profile fields (40 pts)
  IF v_p.dob  THEN v_pct := v_pct + 10; ELSE v_missing := array_append(v_missing, 'Date of Birth'); END IF;
  IF v_p.addr THEN v_pct := v_pct + 10; ELSE v_missing := array_append(v_missing, 'Address'); END IF;
  IF v_p.npn  THEN v_pct := v_pct + 10; ELSE v_missing := array_append(v_missing, 'NPN Number'); END IF;
  IF v_p.ssn  THEN v_pct := v_pct + 10; ELSE v_missing := array_append(v_missing, 'SSN'); END IF;
  -- Documents (60 pts)
  IF v_has_eo   THEN v_pct := v_pct + 20; ELSE v_missing := array_append(v_missing, 'E&O Certificate'); END IF;
  IF v_has_bank THEN v_pct := v_pct + 15; ELSE v_missing := array_append(v_missing, 'Banking Info'); END IF;
  IF v_has_dl   THEN v_pct := v_pct + 10; ELSE v_missing := array_append(v_missing, 'Driver''s License'); END IF;
  IF v_has_aml  THEN v_pct := v_pct + 15; ELSE v_missing := array_append(v_missing, 'AML Certificate'); END IF;

  RETURN jsonb_build_object('pct', v_pct, 'missing', to_jsonb(v_missing));
END $$;
