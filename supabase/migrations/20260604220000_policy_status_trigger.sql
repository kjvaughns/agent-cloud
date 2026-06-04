create or replace function public.policy_status_trigger_fn()
returns trigger language plpgsql as $$
begin
  if NEW.effective_date is not null
     and NEW.effective_date::date <= current_date
     and NEW.status = 'issued_not_paid' then
    NEW.status := 'active';
  end if;
  return NEW;
end;
$$;

drop trigger if exists policy_status_auto on public.policies;
create trigger policy_status_auto
  before insert or update on public.policies
  for each row execute function public.policy_status_trigger_fn();

create or replace function public.promote_policy_status()
returns void language plpgsql as $$
begin
  update public.policies
  set status = 'active'
  where status = 'issued_not_paid'
    and effective_date is not null
    and effective_date::date <= current_date;
end;
$$;
