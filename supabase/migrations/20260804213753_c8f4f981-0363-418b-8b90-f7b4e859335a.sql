alter table public.academy_modules
  add column if not exists section text,
  add column if not exists kind text not null default 'text',
  add column if not exists duration_minutes integer not null default 0,
  add column if not exists is_published boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_academy_modules_order
  on public.academy_modules(course_id, sort_order, created_at);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'academy_modules_kind_check') then
    alter table public.academy_modules
      add constraint academy_modules_kind_check
      check (kind in ('video', 'text', 'quiz', 'document', 'embed'));
  end if;
end $$;

update public.academy_modules
   set kind = case
                when quiz is not null then 'quiz'
                when video_url is not null and video_url <> '' then 'video'
                when content_html is not null and content_html <> '' then 'text'
                when resource_urls is not null and jsonb_array_length(resource_urls) > 0 then 'document'
                else 'text'
              end
 where kind = 'text';

create or replace function public.sync_course_duration()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  _course uuid := coalesce(new.course_id, old.course_id);
  _sum integer;
begin
  select coalesce(sum(duration_minutes), 0) into _sum
    from public.academy_modules where course_id = _course;

  if _sum > 0 then
    update public.academy_courses
       set duration_minutes = _sum
     where id = _course and coalesce(duration_minutes, 0) is distinct from _sum;
  end if;

  return null;
end $$;

drop trigger if exists trg_sync_course_duration on public.academy_modules;
create trigger trg_sync_course_duration
  after insert or delete or update of duration_minutes, course_id
  on public.academy_modules
  for each row execute function public.sync_course_duration();

delete from public.course_progress c
 where c.id in (
   select id from (
     select id,
            row_number() over (
              partition by agent_id, module_id
              order by completed desc, completed_at desc nulls last, id
            ) as rn
       from public.course_progress
   ) t
   where t.rn > 1
 );

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'course_progress_agent_module_key'
       and conrelid = 'public.course_progress'::regclass
  ) and not exists (
    select 1 from pg_constraint
     where conrelid = 'public.course_progress'::regclass
       and contype = 'u'
       and array_length(conkey, 1) = 2
       and conkey @> array[
             (select attnum from pg_attribute
               where attrelid = 'public.course_progress'::regclass and attname = 'agent_id'),
             (select attnum from pg_attribute
               where attrelid = 'public.course_progress'::regclass and attname = 'module_id')
           ]::smallint[]
  ) then
    alter table public.course_progress
      add constraint course_progress_agent_module_key unique (agent_id, module_id);
  end if;
end $$;

create or replace function public.can_see_agent_progress(_agent uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select _agent = auth.uid()
      or public.is_platform_admin()
      or public.is_in_downline(auth.uid(), _agent)
      or exists (
        select 1 from public.profiles p
         where p.id = _agent
           and p.organization_id is not null
           and public.is_org_admin(p.organization_id)
      )
$$;

grant execute on function public.can_see_agent_progress(uuid) to authenticated;

drop policy if exists course_progress_owner_select on public.course_progress;
create policy course_progress_owner_select on public.course_progress
  for select to authenticated
  using (public.can_see_agent_progress(agent_id));

drop policy if exists course_progress_owner_modify on public.course_progress;
create policy course_progress_owner_modify on public.course_progress
  for all to authenticated
  using (agent_id = auth.uid())
  with check (agent_id = auth.uid());

create or replace function public.may_write_academy_media(_folder text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  if _folder = 'platform' then
    return public.is_platform_admin();
  end if;
  if _folder !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  return public.can_manage_resources(_folder::uuid);
end $$;

grant execute on function public.may_write_academy_media(text) to authenticated;

drop policy if exists "academy_media_read" on storage.objects;
create policy "academy_media_read" on storage.objects
  for select to public
  using (bucket_id = 'academy-media');

drop policy if exists "academy_media_insert" on storage.objects;
create policy "academy_media_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'academy-media'
    and public.may_write_academy_media((storage.foldername(name))[1])
  );

drop policy if exists "academy_media_update" on storage.objects;
create policy "academy_media_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'academy-media'
    and public.may_write_academy_media((storage.foldername(name))[1])
  );

drop policy if exists "academy_media_delete" on storage.objects;
create policy "academy_media_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'academy-media'
    and public.may_write_academy_media((storage.foldername(name))[1])
  );

notify pgrst, 'reload schema';