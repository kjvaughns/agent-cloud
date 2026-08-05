-- ============================================================================
-- A PROFILE SOMEBODY CAN ACTUALLY FINISH
--
-- `agent_completion()` awarded 10% for a document of type 'drivers_license'
-- and 10% for one of type 'banking'. Neither is uploadable: DOC_CATEGORIES in
-- producer-profile.tsx offers `government_id` and `voided_check`, and nothing
-- anywhere writes the two the function looks for.
--
-- So twenty points were unreachable by construction. Every agent was capped at
-- 80%, "Driver's License" and "Banking Info" sat in the missing list forever,
-- and the Team Command Center showed a roster stuck between 10% and 20% — a
-- number that measured the scoring function rather than the agents. It also
-- made the product feel like it was demanding sensitive documents, because it
-- was, and would never stop.
--
-- Two changes, and a third that is the actual point:
--
--   1. Score the document types that exist.
--   2. Weight what Agent Cloud uses. It does not submit contracting paperwork,
--      so an SSN and a voided cheque earn nothing.
--   3. `collect_contracting_pii` — off by default. An agency that does handle
--      contracting turns it on and the sensitive fields come back, scored.
--
-- The weights are computed rather than hardcoded to sum to 100, so adding or
-- removing a criterion cannot silently make 100% unreachable again. That is
-- the bug this migration exists to fix; it should not be possible to reintroduce
-- by editing a number.
-- ============================================================================

alter table public.organization_settings
  add column if not exists collect_contracting_pii boolean not null default false;

comment on column public.organization_settings.collect_contracting_pii is
  'When false (default) the Producer Profile hides SSN, driver''s license and banking, and completeness ignores them. Turn on only if this agency submits contracting paperwork itself.';

create or replace function public.agent_completion(_agent uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_missing text[] := array[]::text[];
  v_earned  numeric := 0;
  v_total   numeric := 0;
  v_collect_pii bool := false;

  v_has_identity bool;
  v_has_npn      bool;
  v_has_address  bool;
  v_has_contact  bool;
  v_has_eo       bool;
  v_has_aml      bool;
  v_has_license  bool;
  v_has_ssn      bool;
  v_has_gov_id   bool;
  v_has_banking  bool;

begin
  select coalesce(bool_or(os.collect_contracting_pii), false)
    into v_collect_pii
    from public.profiles p
    join public.organization_settings os on os.organization_id = p.organization_id
   where p.id = _agent;

  select
    (first_name is not null and last_name is not null and date_of_birth is not null),
    (npn_number is not null and npn_number <> ''),
    (street_address is not null and city is not null
       and state is not null and zip_code is not null),
    (email is not null and email <> '' and phone is not null and phone <> ''),
    (ssn_last4 is not null and ssn_last4 <> '')
    into v_has_identity, v_has_npn, v_has_address, v_has_contact, v_has_ssn
    from public.profiles
   where id = _agent
   limit 1;

  -- A missing row reads as nothing filled in, which is the truthful answer.
  v_has_identity := coalesce(v_has_identity, false);
  v_has_npn      := coalesce(v_has_npn, false);
  v_has_address  := coalesce(v_has_address, false);
  v_has_contact  := coalesce(v_has_contact, false);
  v_has_ssn      := coalesce(v_has_ssn, false);

  -- The document types the UI can actually produce. `eo` is accepted beside
  -- `eo_certificate` because agent-onboarding.functions.ts has always counted
  -- both and the two disagreeing about the same agent is its own bug.
  select exists(select 1 from public.producer_documents
                 where agent_id = _agent and doc_type in ('eo_certificate', 'eo')) into v_has_eo;
  select exists(select 1 from public.producer_documents
                 where agent_id = _agent and doc_type = 'aml_certificate') into v_has_aml;
  select exists(select 1 from public.producer_documents
                 where agent_id = _agent and doc_type = 'government_id') into v_has_gov_id;
  select exists(select 1 from public.producer_documents
                 where agent_id = _agent and doc_type = 'voided_check') into v_has_banking;

  select exists(select 1 from public.state_licenses
                 where agent_id = _agent
                   and (expires_date is null or expires_date >= current_date))
    into v_has_license;

  -- ── What counts, in the order somebody would work through it ──────────────
  v_total := v_total + 15;
  if v_has_identity then v_earned := v_earned + 15;
    else v_missing := array_append(v_missing, 'Name and date of birth'); end if;

  v_total := v_total + 15;
  if v_has_npn then v_earned := v_earned + 15;
    else v_missing := array_append(v_missing, 'NPN number'); end if;

  v_total := v_total + 15;
  if v_has_address then v_earned := v_earned + 15;
    else v_missing := array_append(v_missing, 'Home address'); end if;

  v_total := v_total + 10;
  if v_has_contact then v_earned := v_earned + 10;
    else v_missing := array_append(v_missing, 'Email and phone'); end if;

  v_total := v_total + 20;
  if v_has_eo then v_earned := v_earned + 20;
    else v_missing := array_append(v_missing, 'E&O certificate'); end if;

  v_total := v_total + 15;
  if v_has_aml then v_earned := v_earned + 15;
    else v_missing := array_append(v_missing, 'AML certificate'); end if;

  v_total := v_total + 10;
  if v_has_license then v_earned := v_earned + 10;
    else v_missing := array_append(v_missing, 'State license'); end if;

  -- ── Only for an agency that says it handles contracting itself ────────────
  if v_collect_pii then
    v_total := v_total + 10;
    if v_has_ssn then v_earned := v_earned + 10;
      else v_missing := array_append(v_missing, 'SSN (last 4)'); end if;

    v_total := v_total + 10;
    if v_has_gov_id then v_earned := v_earned + 10;
      else v_missing := array_append(v_missing, 'Government ID'); end if;

    v_total := v_total + 10;
    if v_has_banking then v_earned := v_earned + 10;
      else v_missing := array_append(v_missing, 'Voided check'); end if;
  end if;

  return jsonb_build_object(
    -- Normalised, so 100% is reachable whatever is in play. The old function
    -- hardcoded weights summing to 100 and then scored two criteria nobody
    -- could satisfy; computing the denominator makes that arithmetic
    -- impossible to get wrong again.
    'pct', case when v_total = 0 then 0 else round(100 * v_earned / v_total) end,
    'missing', to_jsonb(v_missing)
  );
end $$;

comment on function public.agent_completion(uuid) is
  'Profile completeness. Every criterion is reachable from the UI and the denominator is computed, so 100% is always attainable. Sensitive criteria are included only when the agency sets collect_contracting_pii.';
