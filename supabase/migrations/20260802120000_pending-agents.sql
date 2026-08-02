-- ---------------------------------------------------------------------------
-- PENDING AGENTS
--
-- Somebody who accepts an invite gets an account, a dashboard, and everything
-- they need to become an agent — a producer profile, contracting, the
-- handbook, the academy. What they do not get is the selling half of the app,
-- because they are not selling yet.
--
-- Two things end that state, and either is enough:
--
--   the agency owner marks them active   — a deliberate decision
--   they post their first policy         — the fact the decision was for
--
-- The second is what this migration adds. It is not a new status: `pending` is
-- already the default on profiles and always has been. Nothing read it, and
-- nothing set it either — accepting an invite wrote `active` directly, so an
-- invited agent was a full billable seat the instant they chose a password,
-- before any licence, appointment or sale.
--
-- Existing accounts are untouched. Everyone already active stays active; this
-- only changes where new people start and what ends it.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists first_sale_at timestamptz;

comment on column public.profiles.first_sale_at is
  'When this agent posted their first policy. Set once, by trigger, and never cleared.';

create index if not exists idx_profiles_first_sale on public.profiles(first_sale_at)
  where first_sale_at is not null;

-- ---------------------------------------------------------------------------
-- A policy is the proof. Recording it activates whoever wrote it.
--
-- Deliberately a trigger rather than application code: policies arrive from
-- Post a Deal, from the pipeline, from a bulk import and from carrier sync,
-- and an agent's first sale should activate them whichever door it came
-- through. Four call sites that each have to remember is three too many.
-- ---------------------------------------------------------------------------

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
         -- Only ever promotes out of pending. An agent the owner deactivated
         -- does not come back because an old policy was imported.
         status = case when status = 'pending' then 'active' else status end
   where id = NEW.agent_id
     and (first_sale_at is null or status = 'pending');

  return NEW;
end $$;

drop trigger if exists trg_mark_first_sale on public.policies;
create trigger trg_mark_first_sale
  after insert on public.policies
  for each row execute function public.mark_first_sale();

-- ---------------------------------------------------------------------------
-- Backfill: anybody who has already sold has already earned this.
--
-- Without it, every existing agent would read as never having sold, and the
-- first thing an owner saw would be a screen full of people they know are
-- producing marked as though they were not.
-- ---------------------------------------------------------------------------

update public.profiles p
   set first_sale_at = f.first_posted,
       -- Same rule the trigger applies, applied to history: somebody who has
       -- already sold is already active. Leaving them pending would mean the
       -- backfill and the trigger disagreed about identical facts.
       status = case when p.status = 'pending' then 'active' else p.status end
  from (
    select agent_id, min(coalesce(posted_at, created_at)) as first_posted
      from public.policies
     where agent_id is not null
     group by agent_id
  ) f
 where f.agent_id = p.id
   and p.first_sale_at is null;

notify pgrst, 'reload schema';
