-- The rules the product already assumes, told to the database.
--
-- Every constraint here is something the application believes and cannot
-- currently rely on. None of them changes behaviour for correct data; each
-- turns a class of silently-wrong state into a refused write.
--
-- Checked first, and deliberately NOT re-added, because they already exist:
--
--   agency_levels.base_pct        check (base_pct >= 0 and base_pct <= 500)
--                                 20260813220000:7
--   agency_levels.sort_order      check (sort_order >= 0)
--                                 20260814210000:98
--   advance options               enum public.advance_option
--                                 20260814210000:37
--   agent_commission_levels.status check (active/pending/terminated/superseded)
--                                 20260814210000:81
--   agency_relationships          unique (parent_org_id, child_org_id)
--                                 and check (parent <> child)
--                                 20260814121524:12
--
-- Also checked: 20260813232512 is not a conflicting duplicate of
-- 20260813220000. It re-runs the same `create table if not exists` and then
-- drops and recreates the four policies with `to authenticated` added. The
-- later definition is the correct one and applying both in order is right, so
-- there is nothing to consolidate — only something to record, which this note
-- does.
--
-- Forward only. Every constraint is added NOT VALID where existing data could
-- fail it, so applying this can never reject rows that are already stored;
-- what it does is stop new ones. Validation is left as a deliberate follow-up
-- so that a migration cannot fail halfway through on data nobody has looked at
-- yet.

-- ── A ladder needs an order ──
--
-- `sort_order` is `not null default 0`, so an agency that has never reordered
-- its rungs has every rung at 0. Rank comparisons — can this person invite
-- that one, is this level above that one — then tie for the entire agency,
-- and the tie resolves arbitrarily.
--
-- This cannot be a plain unique constraint: every existing agency is already
-- in the state it would reject. A partial unique index over ACTIVE rungs with
-- a non-zero order gives the guarantee where an agency has actually set an
-- order, and leaves the untouched ones alone.
create unique index if not exists idx_agency_levels_rank_unique
  on public.agency_levels (organization_id, sort_order)
  where active and sort_order > 0;

comment on index public.idx_agency_levels_rank_unique is
  'Two active rungs at the same non-zero order would make rank comparisons arbitrary. Scoped to sort_order > 0 because every rung defaults to 0 and existing agencies have never reordered.';

-- ── A row belongs to one agency ──
--
-- `agency_level_carrier_mappings` carries its own `organization_id` AND points
-- at an `agency_levels` row that carries one too. Nothing has ever checked
-- they agree. A mapping whose level belongs to a different agency is a
-- cross-organization leak with no UI to create it and no barrier if anything
-- ever does — and it would resolve compensation from another agency's ladder,
-- which is the worst kind of wrong number: plausible.
create or replace function public.mapping_level_same_org(_mapping_org uuid, _level_id uuid)
returns boolean
language sql
stable
as $$
  select _level_id is null
      or exists (
        select 1 from public.agency_levels al
        where al.id = _level_id and al.organization_id = _mapping_org
      );
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'agency_level_mappings_same_org'
  ) then
    -- NOT VALID: existing rows are not re-checked, so this cannot fail on data
    -- that is already stored. New and updated rows are checked from now on.
    alter table public.agency_level_carrier_mappings
      add constraint agency_level_mappings_same_org
      check (public.mapping_level_same_org(organization_id, agency_level_id))
      not valid;
  end if;
end $$;

-- ── An agent's rung belongs to their agency ──
--
-- Same shape, on the column that actually decides what somebody is paid.
-- `profiles.agency_level_id` points at a rung; nothing checks it is a rung of
-- the agency that agent is in.
create or replace function public.profile_level_same_org(_profile_org uuid, _level_id uuid)
returns boolean
language sql
stable
as $$
  select _level_id is null
      or _profile_org is null
      or exists (
        select 1 from public.agency_levels al
        where al.id = _level_id and al.organization_id = _profile_org
      );
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_level_same_org'
  ) then
    alter table public.profiles
      add constraint profiles_level_same_org
      check (public.profile_level_same_org(organization_id, agency_level_id))
      not valid;
  end if;
end $$;

-- ── One live relationship between two agencies ──
--
-- `unique (parent_org_id, child_org_id)` already stops a duplicate pair. What
-- it does not stop is the same child having several parents — which the
-- production rollup would then count twice, once under each.
create unique index if not exists idx_agency_relationships_one_active_parent
  on public.agency_relationships (child_org_id)
  where status = 'active';

comment on index public.idx_agency_relationships_one_active_parent is
  'A child agency with two active parents would have its production counted under both. Terminated and paused legs are exempt, so a child can be moved between parents.';

-- ── The review queue for uncertain rungs ──
--
-- The brief asks for `agency_level_id` to be backfilled with a review queue for
-- records that cannot be decided automatically. There is deliberately no
-- guessing here: an agent's rung determines what they are paid, and inferring
-- it from a percentage that happens to match would quietly put somebody on a
-- level nobody chose.
--
-- So this backfills only the unambiguous case — an agency with exactly one
-- active rung, where there is nothing to choose between — and lists everybody
-- else for a person to decide.
create table if not exists public.agency_level_review (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  -- What the agent is being paid today, so whoever reviews this can see the
  -- consequence of each choice rather than picking a name off a list.
  observed_pct numeric,
  candidate_level_ids uuid[] not null default '{}',
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (profile_id)
);

alter table public.agency_level_review enable row level security;
grant select, insert, update on public.agency_level_review to authenticated;
grant all on public.agency_level_review to service_role;

drop policy if exists agency_level_review_read on public.agency_level_review;
create policy agency_level_review_read on public.agency_level_review
  for select to authenticated
  using (organization_id in (select public.my_org_ids()) and public.is_org_owner(organization_id));

drop policy if exists agency_level_review_write on public.agency_level_review;
create policy agency_level_review_write on public.agency_level_review
  for all to authenticated
  using (organization_id in (select public.my_org_ids()) and public.is_org_owner(organization_id))
  with check (organization_id in (select public.my_org_ids()) and public.is_org_owner(organization_id));

-- The unambiguous case: one active rung in the agency, so there is nothing to
-- choose between.
update public.profiles p
   set agency_level_id = (
     select al.id from public.agency_levels al
     where al.organization_id = p.organization_id and al.active
   )
 where p.agency_level_id is null
   and p.organization_id is not null
   and (select count(*) from public.agency_levels al
        where al.organization_id = p.organization_id and al.active) = 1;

-- Everybody else is listed rather than guessed at.
insert into public.agency_level_review (organization_id, profile_id, reason, candidate_level_ids)
select p.organization_id,
       p.id,
       case
         when (select count(*) from public.agency_levels al
               where al.organization_id = p.organization_id and al.active) = 0
         then 'This agency has no positions set up yet.'
         else 'More than one position could apply, so nobody has been assigned automatically.'
       end,
       coalesce(
         (select array_agg(al.id order by al.sort_order, al.name)
          from public.agency_levels al
          where al.organization_id = p.organization_id and al.active),
         '{}'
       )
  from public.profiles p
 where p.agency_level_id is null
   and p.organization_id is not null
   and coalesce(p.status, 'active') <> 'terminated'
on conflict (profile_id) do nothing;

create index if not exists idx_agency_level_review_open
  on public.agency_level_review (organization_id)
  where resolved_at is null;

notify pgrst, 'reload schema';
