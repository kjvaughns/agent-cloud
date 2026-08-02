-- 1. rename import credential columns
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='scrape_requests' and column_name='agentlink_username') then
    alter table public.scrape_requests rename column agentlink_username to source_username;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='scrape_requests' and column_name='agentlink_password_encrypted') then
    alter table public.scrape_requests rename column agentlink_password_encrypted to source_password_encrypted;
  end if;
end $$;

comment on column public.scrape_requests.source_username is
  'Username on the platform this agent is importing their book from.';
comment on column public.scrape_requests.source_password_encrypted is
  'Obfuscated password for that platform. Held only until the import completes.';

-- 2. debrand seeded resource content
update public.handbook_sections
   set content_html = replace(
         replace(
           content_html,
           '<h3>AgentLink (Legacy)</h3>',
           '<h3>Importing From a Previous Platform</h3>'
         ),
         'If you are transitioning from another agency that used AgentLink/InsuraCloud, you can import your entire book of business into Agent Cloud using the Import from AgentLink feature on your Pipeline page.',
         'If you are transitioning from another agency, you can import your entire book of business into Agent Cloud using the Book Import feature on your Pipeline page.'
       )
 where content_html like '%AgentLink%';

update public.academy_courses
   set description = replace(
         description,
         'importing your existing book from AgentLink.',
         'importing your existing book from a previous platform.'
       )
 where description like '%AgentLink%';

-- 3. org membership repair
-- A no-op rewrite of the same organization still fires the cross-org
-- hierarchy check, which some existing accounts already violate. Only write
-- when the value actually changes.
create or replace function public.sync_profile_primary_org()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW.status = 'active' and NEW.is_primary then
    update public.profiles set organization_id = NEW.organization_id
     where id = NEW.profile_id
       and organization_id is distinct from NEW.organization_id;
  end if;
  return NEW;
end $$;

create or replace function public.stamp_organization_id()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_org uuid;
begin
  if NEW.organization_id is not null then
    return NEW;
  end if;
  execute format('select ($1).%I', TG_ARGV[0]) into v_owner using NEW;
  if v_owner is null then
    return NEW;
  end if;

  select organization_id into v_org
    from public.organization_memberships
   where profile_id = v_owner and status = 'active'
   order by is_primary desc
   limit 1;

  if v_org is null then
    select organization_id into v_org
      from public.profiles where id = v_owner;
  end if;

  NEW.organization_id := v_org;
  return NEW;
end $$;

insert into public.organization_memberships
  (organization_id, profile_id, role, status, is_primary)
select p.organization_id,
       p.id,
       coalesce((select ur.role::text from public.user_roles ur
                  where ur.user_id = p.id
                  order by case ur.role::text
                    when 'super_admin' then 1 when 'agency_owner' then 2
                    when 'admin' then 3 when 'manager' then 4
                    when 'staff' then 5 else 6 end
                  limit 1), 'agent'),
       case when p.status in ('invited') then 'invited'
            when p.status in ('terminated','inactive') then 'archived'
            else 'active' end,
       true
from public.profiles p
where p.organization_id is not null
on conflict (organization_id, profile_id) do nothing;

insert into public.organization_memberships
  (organization_id, profile_id, role, status, is_primary)
select o.id, o.owner_id, 'agency_owner', 'active',
       (select p.organization_id = o.id from public.profiles p where p.id = o.owner_id)
from public.organizations o
where o.owner_id is not null
on conflict (organization_id, profile_id)
  do update set role = 'agency_owner', status = 'active';

create or replace function public.sync_membership_from_profile()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW.organization_id is null then
    return NEW;
  end if;

  insert into public.organization_memberships
    (organization_id, profile_id, role, status, is_primary)
  values (
    NEW.organization_id,
    NEW.id,
    coalesce((select ur.role::text from public.user_roles ur
               where ur.user_id = NEW.id
               order by case ur.role::text
                 when 'super_admin' then 1 when 'agency_owner' then 2
                 when 'admin' then 3 when 'manager' then 4
                 when 'staff' then 5 else 6 end
               limit 1), 'agent'),
    case when NEW.status in ('invited') then 'invited'
         when NEW.status in ('terminated','inactive') then 'archived'
         else 'active' end,
    true
  )
  on conflict (organization_id, profile_id) do nothing;

  return NEW;
end $$;

drop trigger if exists trg_sync_membership_from_profile on public.profiles;
create trigger trg_sync_membership_from_profile
  after insert or update of organization_id on public.profiles
  for each row execute function public.sync_membership_from_profile();

comment on function public.sync_membership_from_profile is
  'Profile gains an organization -> membership row follows. The counterpart to trg_sync_profile_primary_org, which runs the other way.';

-- 4. import personal scope
alter table public.document_intake
  add column if not exists user_note text;

comment on column public.document_intake.user_note is
  'Optional plain-English description the uploader gave. Feeds classification and duplicate matching.';

drop policy if exists document_intake_access on public.document_intake;
create policy document_intake_access on public.document_intake
  for all to authenticated
  using (
    (
      organization_id is not null
      and organization_id in (select public.my_org_ids())
      and (public.is_org_owner(organization_id) or uploaded_by = auth.uid())
    )
    or (organization_id is null and uploaded_by = auth.uid())
  )
  with check (
    (
      organization_id is not null
      and organization_id in (select public.my_org_ids())
      and (public.is_org_owner(organization_id) or uploaded_by = auth.uid())
    )
    or (organization_id is null and uploaded_by = auth.uid())
  );

create index if not exists idx_document_intake_uploader
  on public.document_intake(uploaded_by, created_at desc);

-- 5. import proposals
create table if not exists public.import_proposals (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.document_intake(id) on delete cascade,
  batch_id uuid not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  target_table text not null,
  operation text not null default 'insert'
    check (operation in ('insert', 'update', 'skip')),
  scope text not null default 'own'
    check (scope in ('own', 'shared')),
  payload jsonb not null,
  match_id uuid,
  match_kind text check (match_kind in ('exact', 'fuzzy')),
  match_reason text,
  confidence numeric,
  decision text not null default 'pending'
    check (decision in ('pending', 'approved', 'skipped', 'rejected')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  applied_at timestamptz,
  applied_record_id uuid,
  apply_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_import_proposals_document
  on public.import_proposals(document_id, decision);
create index if not exists idx_import_proposals_batch
  on public.import_proposals(batch_id);
create index if not exists idx_import_proposals_approvals
  on public.import_proposals(organization_id, scope, decision)
  where scope = 'shared';
create index if not exists idx_import_proposals_creator
  on public.import_proposals(created_by, decision);

grant select, insert, update, delete on public.import_proposals to authenticated;
grant all on public.import_proposals to service_role;

alter table public.import_proposals enable row level security;

drop policy if exists import_proposals_own on public.import_proposals;
create policy import_proposals_own on public.import_proposals
  for all to authenticated
  using (
    (
      organization_id is not null
      and organization_id in (select public.my_org_ids())
      and (created_by = auth.uid() or public.is_org_owner(organization_id))
    )
    or (organization_id is null and created_by = auth.uid())
  )
  with check (
    (
      organization_id is not null
      and organization_id in (select public.my_org_ids())
      and (created_by = auth.uid() or public.is_org_owner(organization_id))
    )
    or (organization_id is null and created_by = auth.uid())
  );

drop policy if exists import_proposals_admin_shared on public.import_proposals;
create policy import_proposals_admin_shared on public.import_proposals
  for all to authenticated
  using (
    scope = 'shared'
    and organization_id is not null
    and organization_id in (select public.my_org_ids())
    and (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'agency_owner'::public.app_role)
      or public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  )
  with check (
    scope = 'shared'
    and organization_id is not null
    and organization_id in (select public.my_org_ids())
    and (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      or public.has_role(auth.uid(), 'agency_owner'::public.app_role)
      or public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

drop trigger if exists trg_stamp_org_import_proposals on public.import_proposals;
create trigger trg_stamp_org_import_proposals
  before insert on public.import_proposals
  for each row execute function public.stamp_organization_id('created_by');

create trigger update_import_proposals_updated_at
  before update on public.import_proposals
  for each row execute function public.set_updated_at();

comment on table public.import_proposals is
  'One intended change per row, produced by Import and applied only after a decision. applied_at makes re-running an apply idempotent.';

-- 6. imports bucket policies (bucket created via storage tool)
drop policy if exists "imports_owner_select" on storage.objects;
create policy "imports_owner_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'imports' and (
      auth.uid()::text = (storage.foldername(name))[1]
      or public.is_in_downline(auth.uid(), ((storage.foldername(name))[1])::uuid)
      or public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

drop policy if exists "imports_owner_write" on storage.objects;
create policy "imports_owner_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'imports' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "imports_owner_update" on storage.objects;
create policy "imports_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'imports' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "imports_owner_delete" on storage.objects;
create policy "imports_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'imports' and auth.uid()::text = (storage.foldername(name))[1]);

notify pgrst, 'reload schema';