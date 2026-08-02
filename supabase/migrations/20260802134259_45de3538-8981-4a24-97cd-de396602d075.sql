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

create index if not exists idx_handbook_sections_org on public.handbook_sections(organization_id, sort_order);
create index if not exists idx_scripts_org           on public.scripts(organization_id, sort_order);
create index if not exists idx_academy_courses_org   on public.academy_courses(organization_id, sort_order);

create unique index if not exists uq_handbook_fork
  on public.handbook_sections(organization_id, forked_from) where forked_from is not null;
create unique index if not exists uq_scripts_fork
  on public.scripts(organization_id, forked_from) where forked_from is not null;
create unique index if not exists uq_academy_courses_fork
  on public.academy_courses(organization_id, forked_from) where forked_from is not null;

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

do $$
declare
  t text;
begin
  foreach t in array array['handbook_sections', 'scripts', 'academy_courses']
  loop
    execute format('alter table public.%I enable row level security', t);

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

update public.academy_courses c
   set module_count = (select count(*) from public.academy_modules m where m.course_id = c.id);

notify pgrst, 'reload schema';