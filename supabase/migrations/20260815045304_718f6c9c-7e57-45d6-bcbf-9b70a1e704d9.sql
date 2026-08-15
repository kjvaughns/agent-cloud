create unique index if not exists idx_agency_levels_rank_unique
  on public.agency_levels (organization_id, sort_order)
  where active and sort_order > 0;

comment on index public.idx_agency_levels_rank_unique is
  'Two active rungs at the same non-zero order would make rank comparisons arbitrary. Scoped to sort_order > 0 because every rung defaults to 0 and existing agencies have never reordered.';

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
    alter table public.agency_level_carrier_mappings
      add constraint agency_level_mappings_same_org
      check (public.mapping_level_same_org(organization_id, agency_level_id))
      not valid;
  end if;
end $$;

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

create unique index if not exists idx_agency_relationships_one_active_parent
  on public.agency_relationships (child_org_id)
  where status = 'active';

comment on index public.idx_agency_relationships_one_active_parent is
  'A child agency with two active parents would have its production counted under both. Terminated and paused legs are exempt, so a child can be moved between parents.';

create table if not exists public.agency_level_review (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
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

update public.profiles p
   set agency_level_id = (
     select al.id from public.agency_levels al
     where al.organization_id = p.organization_id and al.active
   )
 where p.agency_level_id is null
   and p.organization_id is not null
   and (select count(*) from public.agency_levels al
        where al.organization_id = p.organization_id and al.active) = 1;

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