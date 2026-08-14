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