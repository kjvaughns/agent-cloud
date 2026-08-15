-- ---------------------------------------------------------------------------
-- ONE BOOK, WHOEVER TYPED IT IN
--
-- An agency imports its whole book before its agents have accounts. Every one
-- of those clients and policies is parked with `assigned_to_email`. Three
-- things then went wrong, and all three end the same way: the same sale
-- existing twice.
--
--   1. Claiming only happened for someone who was already on `pending_agents`.
--      An agent who signed up any other way — an invite link, a plain signup
--      before the roster tab was imported — landed in an empty app while their
--      own sales sat under somebody else's name.
--
--   2. Nothing claimed rows created AFTER signup. An agency that imports on
--      Tuesday for an agent who joined on Monday parks the rows against an
--      email that now belongs to a real account, and there was no second
--      chance to pick them up.
--
--   3. Import matching only ever looked at the uploader's own rows. So when
--      that agent uploaded their own export, the clients and policies their
--      upline had already imported were invisible to the matcher — every one
--      of them created a second time, and the production counted twice.
--
-- This migration is the database half: claim on any signup, claim again on
-- demand, and let the matcher see the agency's book without letting an agent
-- read it. Nothing is deleted and no ownership is invented — a row moves only
-- to the person whose email was already written on it.
-- ---------------------------------------------------------------------------

-- ── 1. Claim on signup, whichever way the account was created ───────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  pa RECORD;
  v_email_lower text := lower(NEW.email);
begin
  select * into pa from public.pending_agents where lower(email) = v_email_lower limit 1;

  if pa.id is not null then
    insert into public.profiles (id, email, first_name, last_name, upline_id, status)
    values (
      NEW.id,
      NEW.email,
      coalesce(nullif(NEW.raw_user_meta_data->>'first_name',''), pa.first_name, ''),
      coalesce(nullif(NEW.raw_user_meta_data->>'last_name',''),  pa.last_name,  ''),
      pa.upline_id,
      'active'
    );
    delete from public.pending_agents where id = pa.id;
  else
    insert into public.profiles (id, email, first_name, last_name, status)
    values (
      NEW.id, NEW.email,
      coalesce(NEW.raw_user_meta_data->>'first_name',''),
      coalesce(NEW.raw_user_meta_data->>'last_name',''),
      'active'
    );
  end if;

  -- Claiming is no longer inside the pending_agents branch. Whether the roster
  -- was imported first or not has nothing to do with whose sales these are:
  -- the email on the row is the whole of the claim.
  perform public.claim_records_for(NEW.id, v_email_lower);

  insert into public.user_roles (user_id, role) values (NEW.id, 'agent')
    on conflict do nothing;
  insert into public.wallet (agent_id, balance_cents) values (NEW.id, 0)
    on conflict do nothing;

  return NEW;
end;
$function$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ── 2. The claim itself, reusable ───────────────────────────────────────────

create or replace function public.claim_records_for(_user_id uuid, _email_lower text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_clients int := 0;
  v_policies int := 0;
  v_notes int := 0;
begin
  if _user_id is null or coalesce(_email_lower, '') = '' then
    return jsonb_build_object('clients', 0, 'policies', 0, 'notes', 0);
  end if;

  update public.clients
     set agent_id = _user_id, assigned_to_email = null
   where lower(assigned_to_email) = _email_lower;
  get diagnostics v_clients = row_count;

  update public.policies
     set agent_id = _user_id, assigned_to_email = null
   where lower(assigned_to_email) = _email_lower;
  get diagnostics v_policies = row_count;

  update public.contact_history
     set agent_id = _user_id, assigned_to_email = null
   where lower(assigned_to_email) = _email_lower;
  get diagnostics v_notes = row_count;

  -- Commission rows follow their policy. Left behind, the agent's Finances page
  -- shows a policy that earns nothing and the uploader keeps earnings that were
  -- never theirs.
  update public.commission_schedule cs
     set agent_id = _user_id
   from public.policies p
   where p.id = cs.policy_id
     and p.agent_id = _user_id
     and cs.agent_id is distinct from _user_id;

  return jsonb_build_object('clients', v_clients, 'policies', v_policies, 'notes', v_notes);
end;
$$;

revoke execute on function public.claim_records_for(uuid, text) from public, anon, authenticated;

-- Anyone signed in may claim what is addressed to their own email, and only
-- that: the email is read from their own auth record, never from an argument.
create or replace function public.claim_my_assigned_records()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_email text;
begin
  if auth.uid() is null then
    return jsonb_build_object('clients', 0, 'policies', 0, 'notes', 0);
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  return public.claim_records_for(auth.uid(), v_email);
end;
$$;

revoke execute on function public.claim_my_assigned_records() from public, anon;
grant execute on function public.claim_my_assigned_records() to authenticated;

-- ── 3. Duplicate scan across the agency, key by key ────────────────────────
--
-- Deliberately not "return the agency's book". An agent may not read their
-- upline's clients, and this must not become a way to. It answers only the
-- keys the caller already holds — the rows in the file in front of them — and
-- returns the minimum needed to say "this person, this policy, is already
-- here, and here is who has it".

create or replace function public.import_duplicate_scan(
  _phones text[] default '{}',
  _emails text[] default '{}',
  _name_dobs text[] default '{}',
  _names text[] default '{}',
  _policy_numbers text[] default '{}'
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
  v_email text;
begin
  if auth.uid() is null then
    return jsonb_build_object('clients', '[]'::jsonb, 'policies', '[]'::jsonb);
  end if;

  select organization_id into v_org from public.profiles where id = auth.uid();
  select lower(email) into v_email from auth.users where id = auth.uid();

  return jsonb_build_object(
    'clients', coalesce((
      select jsonb_agg(to_jsonb(x)) from (
        select c.id, c.agent_id, c.first_name, c.last_name, c.phone, c.email,
               c.date_of_birth, c.assigned_to_email
        from public.clients c
        left join public.profiles p on p.id = c.agent_id
        where (
                c.agent_id = auth.uid()
                or lower(c.assigned_to_email) = v_email
                or (v_org is not null and p.organization_id = v_org)
              )
          and (
                right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = any(_phones)
                or lower(trim(coalesce(c.email, ''))) = any(_emails)
                or lower(trim(coalesce(c.first_name, '')) || '|' || trim(coalesce(c.last_name, '')) || '|' || coalesce(c.date_of_birth::text, '')) = any(_name_dobs)
                or lower(trim(coalesce(c.first_name, '')) || '|' || trim(coalesce(c.last_name, ''))) = any(_names)
              )
        limit 20000
      ) x
    ), '[]'::jsonb),
    'policies', coalesce((
      select jsonb_agg(to_jsonb(y)) from (
        select pol.id, pol.agent_id, pol.client_id, pol.policy_number,
               pol.assigned_to_email, pol.monthly_premium, pol.effective_date
        from public.policies pol
        left join public.profiles p on p.id = pol.agent_id
        where (
                pol.agent_id = auth.uid()
                or lower(pol.assigned_to_email) = v_email
                or (v_org is not null and p.organization_id = v_org)
              )
          and lower(trim(coalesce(pol.policy_number, ''))) = any(_policy_numbers)
        limit 20000
      ) y
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.import_duplicate_scan(text[], text[], text[], text[], text[]) from public, anon;
grant execute on function public.import_duplicate_scan(text[], text[], text[], text[], text[]) to authenticated;

notify pgrst, 'reload schema';