-- Backdating a policy: the sale date becomes something a caller can set,
-- on insert AND on update.
--
-- 20260814250000 filled production_date on INSERT only, and only when null.
-- That is right for new deals and useless for correcting history: a policy
-- posted today could never be moved into the month it was actually written,
-- so an imported or hand-entered book could not be made to read accurately.

alter table public.policies
  add column if not exists production_date_set_by uuid references public.profiles(id) on delete set null,
  add column if not exists production_date_set_at timestamptz;

comment on column public.policies.production_date_set_by is
  'Who last set the sale date by hand. Null means the date is still the one derived on insert.';

-- Same rule as before for inserts; on update, honour an explicit
-- production_date, and re-derive it when the caller moved effective_date and
-- said nothing about production_date.
create or replace function public.set_policy_production_date()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  derived timestamptz;
begin
  derived := case
    when new.effective_date is not null
     and new.effective_date::timestamptz < coalesce(new.posted_at, now())
    then new.effective_date::timestamptz
    else coalesce(new.posted_at, now())
  end;

  if tg_op = 'INSERT' then
    if new.production_date is null then
      new.production_date := derived;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.production_date is null then
    -- Cannot be null: the column is NOT NULL and a caller clearing it means
    -- "go back to the derived date".
    new.production_date := derived;
  elsif new.production_date is not distinct from old.production_date
        and new.effective_date is distinct from old.effective_date
        and old.production_date_set_by is null then
    -- The effective date moved and nobody has ever pinned the sale date by
    -- hand, so the derived rule still owns it.
    new.production_date := derived;
  end if;
  return new;
end $$;

comment on function public.set_policy_production_date() is
  'Keeps policies.production_date in step with the sale: derived on insert, honoured when set explicitly, re-derived when effective_date moves and nobody pinned it.';

drop trigger if exists policies_set_production_date on public.policies;
create trigger policies_set_production_date
  before insert or update on public.policies
  for each row execute function public.set_policy_production_date();

-- A sale date in the future is production that has not happened. A trigger
-- rather than a CHECK because the rule depends on the clock.
create or replace function public.assert_production_date_not_future()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.production_date > now() + interval '1 day' then
    raise exception 'The sale date cannot be in the future.';
  end if;
  return new;
end $$;

drop trigger if exists policies_production_date_not_future on public.policies;
create trigger policies_production_date_not_future
  before insert or update on public.policies
  for each row execute function public.assert_production_date_not_future();