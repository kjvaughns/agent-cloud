-- ---------------------------------------------------------------------------
-- A NEW AGENT IS A REAL USER FROM MINUTE ONE
--
-- Signing up used to leave somebody "pending": the selling half of the app —
-- Clients, Pipeline, Calendar, Book of Business, Retention, Finances, Reports
-- and Nova — was hidden, behind a banner promising that "selling opens once
-- your agency activates you." That activation was never a real, discoverable
-- action, so people sat in front of a half-empty app with nothing to click.
-- The gate is gone from the application; this is the database half.
--
-- Two paths create an agent, and only one of them was in application code:
--
--   * Accepting an invite writes the status explicitly, and now writes
--     'active'. That is a code change, not this file.
--
--   * Plain signup inserts through handle_new_user(). Its pending_agents
--     branch already wrote 'active'; its ELSE branch names no status at all
--     and so inherited the column default, which was 'pending'. That is what
--     this migration fixes.
--
-- Both the default and the ELSE branch are changed. Either alone would do it
-- today, but leaving the other saying 'pending' would leave the next person
-- to read this deciding which one is authoritative.
--
-- Nothing is dropped and no row is rewritten. 'pending' remains a legal
-- status: existing rows keep it, and the roster still filters and displays it,
-- because an agency that has people sitting in that state today should keep
-- seeing them until it moves them on. What changes is that nobody NEW lands
-- there, and the status no longer hides anything either way.
-- ---------------------------------------------------------------------------

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
    -- Explicitly 'active'. This branch used to omit the status and take the
    -- column default; both now say the same thing.
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

-- The trigger already points at this function; replacing the body is enough.
-- Kept out of PUBLIC's reach exactly as the original migration left it.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

notify pgrst, 'reload schema';
