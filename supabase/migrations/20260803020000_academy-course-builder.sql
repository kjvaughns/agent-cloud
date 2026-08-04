-- ---------------------------------------------------------------------------
-- A COURSE YOU CAN ACTUALLY BUILD
--
-- `academy_modules` has existed since May with four content columns — title,
-- video_url, content_html, quiz, resource_urls — and no way to write any of
-- them. `saveModule` and `deleteModule` were added later and have never had a
-- caller. So every course on the platform is a title, a category and a link
-- that opens in a new tab.
--
-- This migration adds what a course needs to be a course, and nothing else.
--
--   SECTIONS. A real curriculum groups its lessons — "The Foundation", "The
--   Close" — and the grouping is what tells somebody where they are. A nullable
--   `section` on the lesson rather than a table above it: the group is a label,
--   it has no fields of its own, and a table would need its own ownership
--   chain, its own fork rules and its own ordering for no gain. Lessons with no
--   section stay ungrouped, so nothing that exists today changes shape.
--
--   KIND. The reader currently guesses what a lesson is by asking which columns
--   are non-null. That guess is wrong the moment a lesson has both a video and
--   notes, and it cannot express a lesson that is only a quiz. Stored, checked,
--   and backfilled from the columns the guess was reading.
--
--   DURATION. Per lesson, and rolled up into the course by trigger — the same
--   treatment `module_count` already gets. `academy_courses.duration_minutes`
--   was a number somebody typed that no lesson had to agree with.
--
--   PUBLISHED. A half-written lesson should not appear in a live course. The
--   course already has this; its lessons did not, so the only way to draft one
--   was to leave it out and lose the work.
--
-- Two fixes ride along, both in the same area and both known:
--
--   `course_progress` has no unique constraint on (agent_id, module_id) in
--   every database — the table was created with `if not exists`, so whether the
--   constraint arrived depends on where the table came from. `setModuleComplete`
--   works around it with select-then-write, which two quick clicks can race into
--   two rows. Added here, after deduplicating whatever is already there.
--
--   `course_progress` RLS still grants the global `admin` role. `admin` is an
--   agency-level role, so today any agency admin can read and write every other
--   agency's progress rows. Every other resources table was moved off that
--   pattern in `20260802150000`; this one was missed.
--
-- Finally a bucket for course media, which is the first org-scoped bucket in
-- the schema — the existing three are all keyed on `auth.uid()` being the first
-- path segment, a shape that cannot say "any resource editor in this agency".
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1. LESSONS
-- ---------------------------------------------------------------------------

alter table public.academy_modules
  add column if not exists section text,
  add column if not exists kind text not null default 'text',
  add column if not exists duration_minutes integer not null default 0,
  add column if not exists is_published boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- `sort_order` has no uniqueness and ties break arbitrarily, which is fine
-- while a builder renumbers on every reorder — but a stable second key means
-- the same list comes back in the same order when it does not. Existing rows
-- all get the same `created_at` from the default, so this only helps going
-- forward; that is still better than nothing.
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

-- Backfill from what the reader was inferring, so no lesson changes how it
-- renders. Order matters: a lesson with a video and notes is a video lesson
-- with notes, which is what the "Watch" button already implied.
update public.academy_modules
   set kind = case
                when quiz is not null then 'quiz'
                when video_url is not null and video_url <> '' then 'video'
                when content_html is not null and content_html <> '' then 'text'
                when resource_urls is not null and jsonb_array_length(resource_urls) > 0 then 'document'
                else 'text'
              end
 where kind = 'text';


-- ---------------------------------------------------------------------------
-- 2. THE COURSE'S DURATION IS THE SUM OF ITS LESSONS
--
-- Only when the lessons actually say something. A course that lives outside
-- the platform — `academy_courses.url` set, no lessons — keeps the number
-- somebody typed, because there is nothing better to replace it with. That
-- exception is the whole reason this is a conditional roll-up rather than an
-- unconditional one.
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- 3. PROGRESS: ONE ROW PER AGENT PER LESSON
--
-- Deduplicate before constraining, keeping the row that says the most: a
-- completion beats an incompletion, and the most recent completion beats an
-- older one. Deleting the loser is safe — the surviving row carries the same
-- fact, and the id is not referenced anywhere.
-- ---------------------------------------------------------------------------

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
    -- The original CREATE TABLE named it `course_progress_agent_id_module_id_key`.
    -- Where that ran, there is nothing to add.
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


-- ---------------------------------------------------------------------------
-- 4. PROGRESS IS NOT AGENCY-WIDE READABLE BY ANY AGENCY'S ADMIN
--
-- The old policies granted `has_role(auth.uid(), 'admin')`, which in this
-- schema is an agency-level role rather than a platform one — so it let an
-- admin at agency A read and modify an agent at agency B. Replaced with the
-- same three answers the rest of the product gives: yourself, your downline,
-- and an admin of *your* agency.
--
-- Writes narrow to yourself alone. Marking somebody else's lesson complete is
-- not a feature anywhere in the app, and a completion recorded by another
-- person is not a record of anything.
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- 5. COURSE MEDIA
--
-- Public read, unlike every other bucket here. The others hold identity
-- documents, banking details and client PII, and their signed URLs expire on
-- purpose. This holds training video and course artwork, and an expiring URL
-- inside a <video> tag breaks playback part-way through a lesson — which is a
-- real failure in exchange for protecting a recording of somebody explaining
-- how to open a term policy. Paths carry a random id, so a file is not
-- reachable without being handed the link.
--
-- Writes are the part that matters, and they are gated on
-- `can_manage_resources` for the agency named by the first path segment.
-- Platform defaults live under `platform/` and are super-admin only, matching
-- the RLS on `academy_courses` where `organization_id is null`.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('academy-media', 'academy-media', true)
on conflict (id) do nothing;

create or replace function public.may_write_academy_media(_folder text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  if _folder = 'platform' then
    return public.is_platform_admin();
  end if;
  -- Anything that is not an organisation id is refused rather than cast. A
  -- failed cast inside a policy is an error page, not a denial.
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
