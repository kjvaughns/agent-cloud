alter table public.profiles alter column status set default 'active';

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

    update public.clients
       set agent_id = NEW.id, assigned_to_email = null
     where lower(assigned_to_email) = v_email_lower;

    update public.policies
       set agent_id = NEW.id, assigned_to_email = null
     where lower(assigned_to_email) = v_email_lower;

    update public.contact_history
       set agent_id = NEW.id, assigned_to_email = null
     where lower(assigned_to_email) = v_email_lower;

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

  insert into public.user_roles (user_id, role) values (NEW.id, 'agent')
    on conflict do nothing;
  insert into public.wallet (agent_id, balance_cents) values (NEW.id, 0)
    on conflict do nothing;

  return NEW;
end;
$function$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

notify pgrst, 'reload schema';