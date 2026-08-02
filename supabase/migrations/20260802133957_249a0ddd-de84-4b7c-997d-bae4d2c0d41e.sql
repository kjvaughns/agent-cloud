alter table public.profiles
  add column if not exists first_sale_at timestamptz;

comment on column public.profiles.first_sale_at is
  'When this agent posted their first policy. Set once, by trigger, and never cleared.';

create index if not exists idx_profiles_first_sale on public.profiles(first_sale_at)
  where first_sale_at is not null;

create or replace function public.mark_first_sale()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW.agent_id is null then
    return NEW;
  end if;

  update public.profiles
     set first_sale_at = coalesce(first_sale_at, coalesce(NEW.posted_at, now())),
         status = case when status = 'pending' then 'active' else status end
   where id = NEW.agent_id
     and (first_sale_at is null or status = 'pending');

  return NEW;
end $$;

drop trigger if exists trg_mark_first_sale on public.policies;
create trigger trg_mark_first_sale
  after insert on public.policies
  for each row execute function public.mark_first_sale();

update public.profiles p
   set first_sale_at = f.first_posted,
       status = case when p.status = 'pending' then 'active' else p.status end
  from (
    select agent_id, min(coalesce(posted_at, effective_date::timestamptz)) as first_posted
      from public.policies
     where agent_id is not null
     group by agent_id
  ) f
 where f.agent_id = p.id
   and p.first_sale_at is null;

notify pgrst, 'reload schema';