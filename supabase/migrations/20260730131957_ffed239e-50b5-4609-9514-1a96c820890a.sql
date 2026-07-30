-- ============================================================================
-- PHASE 2 — REPAIR: contracts restructure v2.0
-- ============================================================================

alter table public.contract_requests
  add column if not exists commission_level numeric,
  add column if not exists writing_number text,
  add column if not exists effective_date date,
  add column if not exists products text[],
  add column if not exists notes text,
  add column if not exists data_source text default 'manual';

do $do$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.contract_requests'::regclass
       and conname = 'contract_requests_data_source_check'
  ) then
    update public.contract_requests
       set data_source = 'manual'
     where data_source is null or data_source not in ('manual','imported','sureLc');

    alter table public.contract_requests
      add constraint contract_requests_data_source_check
      check (data_source in ('manual','imported','sureLc'));
  end if;
end
$do$;

-- ---------------------------------------------------------------------------
-- 2. transfer_requests — ALTER the existing table into the v2.0 shape.
-- ---------------------------------------------------------------------------

alter table public.transfer_requests
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists transfer_type    text,
  add column if not exists from_agency_id   uuid references public.organizations(id),
  add column if not exists to_agency_id     uuid references public.organizations(id),
  add column if not exists to_agency_name   text,
  add column if not exists current_level    text,
  add column if not exists submitted_by     uuid references public.profiles(id),
  add column if not exists assigned_to      uuid references public.profiles(id),
  add column if not exists documents        jsonb,
  add column if not exists updated_at       timestamptz default now();

alter table public.transfer_requests alter column carrier_id drop not null;

update public.transfer_requests t
   set organization_id = p.organization_id
  from public.profiles p
 where t.agent_id = p.id
   and t.organization_id is null
   and p.organization_id is not null;

update public.transfer_requests t
   set from_agency_id = p.organization_id
  from public.profiles p
 where t.from_upline_id = p.id
   and t.from_agency_id is null
   and p.organization_id is not null;

update public.transfer_requests t
   set to_agency_id = p.organization_id
  from public.profiles p
 where t.to_upline_id = p.id
   and t.to_agency_id is null
   and p.organization_id is not null;

update public.transfer_requests
   set submitted_by = agent_id
 where submitted_by is null;

update public.transfer_requests
   set transfer_type = 'hierarchy_transfer'
 where transfer_type is null;

update public.transfer_requests
   set status = case
     when status in ('draft','submitted','pending_agent','pending_carrier',
                     'pending_receiving_agency','completed','rejected','cancelled')
       then status
     when status = 'pending'  then 'submitted'
     when status = 'approved' then 'completed'
     when status = 'denied'   then 'rejected'
     else 'submitted'
   end;

alter table public.transfer_requests alter column status set default 'draft';

do $do$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.transfer_requests'::regclass
       and conname = 'transfer_requests_status_check'
  ) then
    alter table public.transfer_requests
      add constraint transfer_requests_status_check
      check (status in ('draft','submitted','pending_agent','pending_carrier',
                        'pending_receiving_agency','completed','rejected','cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.transfer_requests'::regclass
       and conname = 'transfer_requests_type_check'
  ) then
    alter table public.transfer_requests
      add constraint transfer_requests_type_check
      check (transfer_type in ('hierarchy_transfer','full_release',
                               'add_state','writing_number_transfer'));
  end if;
end
$do$;

alter table public.transfer_requests enable row level security;

drop policy if exists transfer_requests_owner_select on public.transfer_requests;
drop policy if exists transfer_requests_owner_modify on public.transfer_requests;

drop policy if exists transfer_requests_select on public.transfer_requests;
create policy transfer_requests_select on public.transfer_requests
  for select to authenticated
  using (
    agent_id = auth.uid()
    or submitted_by = auth.uid()
    or assigned_to = auth.uid()
    or (organization_id is not null and organization_id in (select public.my_org_ids()))
    or (from_agency_id  is not null and public.is_org_owner(from_agency_id))
    or (to_agency_id    is not null and public.is_org_owner(to_agency_id))
    or public.is_in_downline(auth.uid(), agent_id)
  );

drop policy if exists transfer_requests_insert on public.transfer_requests;
create policy transfer_requests_insert on public.transfer_requests
  for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and (organization_id is null or organization_id in (select public.my_org_ids()))
  );

drop policy if exists transfer_requests_update on public.transfer_requests;
create policy transfer_requests_update on public.transfer_requests
  for update to authenticated
  using (
    submitted_by = auth.uid()
    or (organization_id is not null and public.is_org_owner(organization_id))
    or (to_agency_id    is not null and public.is_org_owner(to_agency_id))
  );

create index if not exists idx_transfer_requests_org   on public.transfer_requests(organization_id, created_at desc);
create index if not exists idx_transfer_requests_agent on public.transfer_requests(agent_id);

drop trigger if exists trg_stamp_org_transfer_requests on public.transfer_requests;
create trigger trg_stamp_org_transfer_requests
  before insert on public.transfer_requests
  for each row execute function public.stamp_organization_id('agent_id');

-- ---------------------------------------------------------------------------
-- 3. Transfer request activity timeline
-- ---------------------------------------------------------------------------

create table if not exists public.transfer_request_activity (
  id uuid primary key default gen_random_uuid(),
  transfer_request_id uuid references public.transfer_requests(id) on delete cascade,
  performed_by uuid references public.profiles(id),
  action text not null,
  previous_status text,
  new_status text,
  note text,
  created_at timestamptz default now()
);

grant select, insert, update, delete on public.transfer_request_activity to authenticated;
grant all on public.transfer_request_activity to service_role;

alter table public.transfer_request_activity enable row level security;

create index if not exists idx_transfer_activity_request
  on public.transfer_request_activity(transfer_request_id, created_at desc);

drop policy if exists transfer_request_activity_select on public.transfer_request_activity;
create policy transfer_request_activity_select on public.transfer_request_activity
  for select to authenticated
  using (transfer_request_id in (select id from public.transfer_requests));

drop policy if exists transfer_request_activity_insert on public.transfer_request_activity;
create policy transfer_request_activity_insert on public.transfer_request_activity
  for insert to authenticated
  with check (
    performed_by = auth.uid()
    and transfer_request_id in (select id from public.transfer_requests)
  );

-- ---------------------------------------------------------------------------
-- 4. Comp grid version history (org-scoped audit)
-- ---------------------------------------------------------------------------

create table if not exists public.comp_grid_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  carrier_id uuid references public.carriers(id),
  changed_by uuid references public.profiles(id),
  change_type text check (change_type in (
    'level_created', 'rate_changed', 'agent_promoted', 'agent_demoted', 'level_removed'
  )),
  level_name text,
  agent_id uuid references public.profiles(id),
  previous_value text,
  new_value text,
  reason text,
  effective_date date,
  created_at timestamptz default now()
);

grant select, insert, update, delete on public.comp_grid_history to authenticated;
grant all on public.comp_grid_history to service_role;

alter table public.comp_grid_history enable row level security;

create index if not exists idx_comp_grid_history_org
  on public.comp_grid_history(organization_id, carrier_id, created_at desc);

drop policy if exists comp_grid_history_owner on public.comp_grid_history;
drop policy if exists comp_grid_history_read on public.comp_grid_history;
create policy comp_grid_history_read on public.comp_grid_history
  for select to authenticated
  using (
    organization_id is not null and organization_id in (select public.my_org_ids())
  );

drop policy if exists comp_grid_history_insert on public.comp_grid_history;
create policy comp_grid_history_insert on public.comp_grid_history
  for insert to authenticated
  with check (
    changed_by = auth.uid()
    and (organization_id is null or organization_id in (select public.my_org_ids()))
  );

drop trigger if exists trg_stamp_org_comp_grid_history on public.comp_grid_history;
create trigger trg_stamp_org_comp_grid_history
  before insert on public.comp_grid_history
  for each row execute function public.stamp_organization_id('changed_by');