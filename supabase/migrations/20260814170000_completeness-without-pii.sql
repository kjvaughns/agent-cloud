-- ---------------------------------------------------------------------------
-- A COMPLETE PROFILE NO LONGER MEANS HANDING OVER A SOCIAL SECURITY NUMBER
--
-- Agent Cloud does not submit contracting paperwork to carriers — SureLC and
-- NIPR do — so it has no reason to hold an agent's SSN, date of birth,
-- driver's licence or bank account. The product stops asking for them.
--
-- `agent_completion()` has to move with that, or the change punishes the
-- people it is meant to protect. Two problems, both of which would have left
-- agents permanently short of 100% with no way to fix it:
--
--   * date_of_birth was worth 15 points and was NOT gated on the
--     collect_contracting_pii flag. Every agency scored it, always. With the
--     field gone from the profile there would have been no way to earn it.
--
--   * The flag-gated block added SSN, Government ID and a voided cheque —
--     30 more unreachable points for any agency that had the flag on.
--
-- Both are removed here. Identity is now name and NPN; the rest of the score
-- is unchanged and still sums to 100:
--
--     name + NPN        30   (15 identity, 15 npn)
--     home address      15
--     email and phone   10
--     E&O certificate   20
--     AML certificate   15
--     state licence     10
--                      ----
--                      100
--
-- Nothing is dropped or deleted. `profiles.ssn_last4`, `date_of_birth`,
-- `gender`, `marital_status`, the `drivers_license_*` columns,
-- `producer_banking` and every row in them stay exactly as they are — this
-- migration only changes what is *scored*. The columns keep serving the one
-- real consumer that remains: a contracting packet still emits an agent's
-- date of birth when a carrier requirement explicitly asks for it, for agents
-- whose DOB was captured before this change.
--
-- `organization_settings.collect_contracting_pii` is left in place too, and
-- simply stops being read. Hide-but-keep, the same as the columns.
-- ---------------------------------------------------------------------------

create or replace function public.agent_completion(_agent uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_profile        record;
  v_total          int := 0;
  v_missing        jsonb := '[]'::jsonb;
  v_has_identity   boolean;
  v_has_npn        boolean;
  v_has_address    boolean;
  v_has_contact    boolean;
  v_has_eo         boolean;
  v_has_aml        boolean;
  v_has_license    boolean;
begin
  select * into v_profile from public.profiles p where p.id = _agent;
  if not found then
    return jsonb_build_object('pct', 0, 'missing', jsonb_build_array('Profile'));
  end if;

  -- Identity is a name. Date of birth used to be required here; it is a
  -- carrier-application field, not something this platform runs on.
  v_has_identity := (v_profile.first_name is not null and v_profile.last_name is not null);
  v_has_npn      := (v_profile.npn_number is not null and v_profile.npn_number <> '');
  v_has_address  := (
    v_profile.street_address is not null and v_profile.street_address <> ''
    and v_profile.city is not null and v_profile.city <> ''
    and v_profile.state is not null and v_profile.state <> ''
    and v_profile.zip_code is not null and v_profile.zip_code <> ''
  );
  v_has_contact  := (
    v_profile.email is not null and v_profile.email <> ''
    and v_profile.phone is not null and v_profile.phone <> ''
  );

  select exists (
    select 1 from public.producer_documents d
     where d.agent_id = _agent
       and d.doc_type in ('eo', 'eo_certificate')
       and (d.expiration_date is null or d.expiration_date >= current_date)
  ) into v_has_eo;

  select exists (
    select 1 from public.producer_documents d
     where d.agent_id = _agent
       and d.doc_type = 'aml_certificate'
       and (d.expiration_date is null or d.expiration_date >= current_date)
  ) into v_has_aml;

  select exists (
    select 1 from public.state_licenses l
     where l.agent_id = _agent
       and (l.expires_date is null or l.expires_date >= current_date)
  ) into v_has_license;

  if v_has_identity then v_total := v_total + 15;
  else v_missing := v_missing || jsonb_build_array('Your name'); end if;

  if v_has_npn then v_total := v_total + 15;
  else v_missing := v_missing || jsonb_build_array('NPN number'); end if;

  if v_has_address then v_total := v_total + 15;
  else v_missing := v_missing || jsonb_build_array('Home address'); end if;

  if v_has_contact then v_total := v_total + 10;
  else v_missing := v_missing || jsonb_build_array('Email and phone'); end if;

  if v_has_eo then v_total := v_total + 20;
  else v_missing := v_missing || jsonb_build_array('E&O certificate'); end if;

  if v_has_aml then v_total := v_total + 15;
  else v_missing := v_missing || jsonb_build_array('AML certificate'); end if;

  if v_has_license then v_total := v_total + 10;
  else v_missing := v_missing || jsonb_build_array('State license'); end if;

  return jsonb_build_object('pct', v_total, 'missing', v_missing);
end;
$$;

comment on function public.agent_completion(uuid) is
  'Profile completeness: name, NPN, address, contact, E&O, AML, state licence. Deliberately scores no SSN, date of birth, government ID or banking — the platform does not collect them.';

notify pgrst, 'reload schema';
