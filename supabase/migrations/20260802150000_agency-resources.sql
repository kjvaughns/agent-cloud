-- ---------------------------------------------------------------------------
-- EACH AGENCY'S OWN WORDS
--
-- The handbook, the scripts and the academy are one set of rows shared by
-- every agency on the platform. `handbook_sections`, `scripts` and
-- `academy_courses` have no organisation column at all, they are readable by
-- `using (true)`, and the only content that has ever been in them arrived in
-- a seed migration.
--
-- Two consequences, and the second is worse than the first.
--
--   Nobody can edit them. There is no write UI anywhere in the app, so an
--   agency's handbook is whatever the platform seeded and their scripts are
--   somebody else's scripts.
--
--   Anybody holding the `admin` role can edit them for everybody. The write
--   policies gate on the *global* has_role(auth.uid(),'admin') — no
--   organisation anywhere in the expression. `admin` is an agency-level role
--   in this schema; is_org_admin() grants on it. So an admin in one agency
--   could rewrite the handbook every other agency reads. That is the same
--   shape of hole as the analytics one: a check that looks like
--   authorisation and names no subject.
--
-- The model here is defaults plus overrides, which is what "each agency can
-- edit theirs" actually means in a multi-tenant table:
--
--   organization_id is null  →  the platform's default. Everyone reads it,
--                               only the platform writes it.
--   organization_id set      →  that agency's own. Only they read it, only
--                               they write it.
--
-- An agency editing a default does not mutate the shared row — it takes a
-- copy. Nothing an agency does can change what another agency reads.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. WHOSE ROW IS IT
-- ---------------------------------------------------------------------------

-- `forked_from` is what makes "defaults plus overrides" resolvable. An agency
-- that has taken a copy of a default should see their copy and not both, and
-- matching on slug or title to work that out would break the moment somebody
-- renames their version — which is the first thing anyone does. A pointer
-- says it exactly.
alter table public.handbook_sections
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists forked_from uuid references public.handbook_sections(id) on delete set null,
  add column if not exists updated_by uuid references public.profiles(id);

alter table public.scripts
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists forked_from uuid references public.scripts(id) on delete set null,
  add column if not exists sort_order integer default 0,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.profiles(id);

alter table public.academy_courses
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists forked_from uuid references public.academy_courses(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.profiles(id);

-- academy_modules deliberately has no column of its own. A module belongs to
-- a course and the course already knows whose it is; a second copy of the
-- answer is a second thing that can be wrong.

create index if not exists idx_handbook_sections_org on public.handbook_sections(organization_id, sort_order);
create index if not exists idx_scripts_org           on public.scripts(organization_id, sort_order);
create index if not exists idx_academy_courses_org   on public.academy_courses(organization_id, sort_order);

-- One fork per agency per default. Without this, two people editing the same
-- default at the same moment each get a copy and the agency ends up with two
-- of everything — the kind of duplicate that is obvious to a user and
-- invisible to whoever wrote the code.
create unique index if not exists uq_handbook_fork
  on public.handbook_sections(organization_id, forked_from) where forked_from is not null;
create unique index if not exists uq_scripts_fork
  on public.scripts(organization_id, forked_from) where forked_from is not null;
create unique index if not exists uq_academy_courses_fork
  on public.academy_courses(organization_id, forked_from) where forked_from is not null;


-- ---------------------------------------------------------------------------
-- 2. SLUGS ARE PER-AGENCY, NOT PER-PLATFORM
--
-- Both tables carry a globally UNIQUE slug. That is exactly the constraint
-- that makes a copy impossible: the first agency to fork "compensation"
-- takes the name away from everyone else. Scoped to the organisation, with
-- NULLs treated as equal so the platform still cannot have two of its own.
-- ---------------------------------------------------------------------------

alter table public.handbook_sections drop constraint if exists handbook_sections_slug_key;
alter table public.academy_courses   drop constraint if exists academy_courses_slug_key;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'handbook_sections_org_slug_key') then
    alter table public.handbook_sections
      add constraint handbook_sections_org_slug_key unique nulls not distinct (organization_id, slug);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'academy_courses_org_slug_key') then
    alter table public.academy_courses
      add constraint academy_courses_org_slug_key unique nulls not distinct (organization_id, slug);
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 3. WHO MAY EDIT AN AGENCY'S CONTENT
--
-- The two permission keys this reads — mgr_manage_resources and
-- staff_manage_resources — became real columns in the help-desk migration.
-- Before that they were checkboxes on the Roles page writing to nothing.
-- ---------------------------------------------------------------------------

create or replace function public.can_manage_resources(_org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select _org is not null and (
    public.is_org_admin(_org)
    or exists (
      select 1 from public.role_permissions rp
       where rp.profile_id = auth.uid()
         and rp.organization_id = _org
         and (coalesce(rp.mgr_manage_resources, false)
              or coalesce(rp.staff_manage_resources, false))
    )
  )
$$;

grant execute on function public.can_manage_resources(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 4. THE POLICIES
--
-- Read: the platform's defaults, plus your own agency's. Never another
-- agency's — which is a narrowing, and the point of the change.
--
-- Write: your own agency's, if you may manage resources. Platform defaults
-- are super_admin only, so an agency admin can no longer edit the rows every
-- other agency reads.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['handbook_sections', 'scripts', 'academy_courses']
  loop
    execute format('alter table public.%I enable row level security', t);

    -- Old names varied by table; clear all of them before writing the new pair.
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('drop policy if exists handbook_read on public.%I', t);
    execute format('drop policy if exists handbook_admin_write on public.%I', t);
    execute format('drop policy if exists scripts_read on public.%I', t);
    execute format('drop policy if exists scripts_admin_write on public.%I', t);

    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (
          organization_id is null
          or organization_id in (select public.my_org_ids())
        )
    $f$, t || '_read', t);

    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (
          case when organization_id is null
               then public.has_role(auth.uid(), 'super_admin')
               else public.can_manage_resources(organization_id) end
        )
        with check (
          case when organization_id is null
               then public.has_role(auth.uid(), 'super_admin')
               else public.can_manage_resources(organization_id) end
        )
    $f$, t || '_write', t);
  end loop;
end $$;


-- Modules follow their course, in both directions. The subselect runs through
-- academy_courses' own SELECT policy, so read access is defined once.
alter table public.academy_modules enable row level security;

drop policy if exists academy_modules_read        on public.academy_modules;
drop policy if exists academy_modules_admin_write on public.academy_modules;
drop policy if exists academy_modules_write       on public.academy_modules;

create policy academy_modules_read on public.academy_modules
  for select to authenticated
  using (course_id in (select id from public.academy_courses));

create policy academy_modules_write on public.academy_modules
  for all to authenticated
  using (
    course_id in (
      select c.id from public.academy_courses c
       where case when c.organization_id is null
                  then public.has_role(auth.uid(), 'super_admin')
                  else public.can_manage_resources(c.organization_id) end
    )
  )
  with check (
    course_id in (
      select c.id from public.academy_courses c
       where case when c.organization_id is null
                  then public.has_role(auth.uid(), 'super_admin')
                  else public.can_manage_resources(c.organization_id) end
    )
  );


-- ---------------------------------------------------------------------------
-- 5. MODULE COUNT
--
-- academy_courses.module_count is a stored number that nothing has ever
-- maintained, and academy_modules was never seeded — so every course on the
-- platform advertises a module count it does not have. Once agencies start
-- writing modules, a hand-maintained count would drift on the first edit.
-- ---------------------------------------------------------------------------

create or replace function public.sync_course_module_count()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  _course uuid := coalesce(NEW.course_id, OLD.course_id);
begin
  update public.academy_courses
     set module_count = (select count(*) from public.academy_modules where course_id = _course)
   where id = _course;
  return coalesce(NEW, OLD);
end $$;

drop trigger if exists trg_sync_course_module_count on public.academy_modules;
create trigger trg_sync_course_module_count
  after insert or delete or update of course_id on public.academy_modules
  for each row execute function public.sync_course_module_count();

-- Bring the existing rows in line with the truth rather than the seed.
update public.academy_courses c
   set module_count = (select count(*) from public.academy_modules m where m.course_id = c.id);

notify pgrst, 'reload schema';
