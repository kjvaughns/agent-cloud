update public.commission_schedule cs
   set agent_id = (split_part(cs.idempotency_key, ':', 2))::uuid,
       organization_id = coalesce(
         (select organization_id from public.profiles
           where id = (split_part(cs.idempotency_key, ':', 2))::uuid),
         cs.organization_id)
 where cs.payment_type = 'override'
   and cs.idempotency_key is not null
   and split_part(cs.idempotency_key, ':', 2) <> ''
   and cs.agent_id is distinct from (split_part(cs.idempotency_key, ':', 2))::uuid;

create or replace function public.claim_records_for(_user_id uuid, _email_lower text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  update public.commission_schedule cs
     set agent_id = _user_id,
         writing_agent_id = _user_id,
         idempotency_key = concat_ws(
           ':', cs.policy_id::text, _user_id::text, cs.payment_type,
           cs.payment_date::text, coalesce(cs.month_number, 0)::text)
   from public.policies p
   where p.id = cs.policy_id
     and p.agent_id = _user_id
     and cs.payment_type <> 'override'
     and cs.agent_id is distinct from _user_id;

  update public.commission_schedule cs
     set source_agent_id = _user_id,
         writing_agent_id = _user_id
   from public.policies p
   where p.id = cs.policy_id
     and p.agent_id = _user_id
     and cs.payment_type = 'override'
     and cs.source_agent_id is distinct from _user_id;

  return jsonb_build_object('clients', v_clients, 'policies', v_policies, 'notes', v_notes);
end;
$function$;

revoke execute on function public.claim_records_for(uuid, text) from public, anon, authenticated;
