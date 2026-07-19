-- Contracts restructure v2.0: contract fields, transfer requests, comp grid history.
-- Additive only. "contracts" in the spec = contract_requests in this schema.

-- 1) Contract record fields
alter table public.contract_requests
  add column if not exists commission_level numeric,
  add column if not exists writing_number text,
  add column if not exists effective_date date,
  add column if not exists products text[],
  add column if not exists notes text,
  add column if not exists data_source text default 'manual'
    check (data_source in ('manual', 'imported', 'sureLc'));

-- 2) Transfer requests (hierarchy/release workflows between agencies)
create table if not exists public.transfer_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  agent_id uuid references public.profiles(id),
  carrier_id uuid references public.carriers(id),
  transfer_type text check (transfer_type in (
    'hierarchy_transfer', 'full_release', 'add_state', 'writing_number_transfer'
  )),
  from_agency_id uuid references public.organizations(id),
  to_agency_id uuid references public.organizations(id),
  to_agency_name text,
  current_level text,
  reason text not null,
  status text default 'draft' check (status in (
    'draft', 'submitted', 'pending_agent', 'pending_carrier',
    'pending_receiving_agency', 'completed', 'rejected', 'cancelled'
  )),
  submitted_by uuid references public.profiles(id),
  assigned_to uuid references public.profiles(id),
  documents jsonb,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.transfer_requests enable row level security;

-- Agents: own records. Org owners: their org's requests. Receiving agency owner: incoming.
drop policy if exists transfer_requests_select on public.transfer_requests;
create policy transfer_requests_select on public.transfer_requests
  for select to authenticated
  using (
    agent_id = auth.uid()
    or submitted_by = auth.uid()
    or organization_id in (select id from public.organizations where owner_id = auth.uid())
    or from_agency_id in (select id from public.organizations where owner_id = auth.uid())
    or to_agency_id in (select id from public.organizations where owner_id = auth.uid())
    or public.is_in_downline(auth.uid(), agent_id)
    or public.has_role(auth.uid(), 'super_admin')
  );

drop policy if exists transfer_requests_insert on public.transfer_requests;
create policy transfer_requests_insert on public.transfer_requests
  for insert to authenticated
  with check (submitted_by = auth.uid());

drop policy if exists transfer_requests_update on public.transfer_requests;
create policy transfer_requests_update on public.transfer_requests
  for update to authenticated
  using (
    submitted_by = auth.uid()
    or organization_id in (select id from public.organizations where owner_id = auth.uid())
    or to_agency_id in (select id from public.organizations where owner_id = auth.uid())
    or public.has_role(auth.uid(), 'super_admin')
  );

create index if not exists idx_transfer_requests_org on public.transfer_requests(organization_id, created_at desc);
create index if not exists idx_transfer_requests_agent on public.transfer_requests(agent_id);

-- 3) Transfer request activity timeline
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
alter table public.transfer_request_activity enable row level security;

drop policy if exists transfer_request_activity_select on public.transfer_request_activity;
create policy transfer_request_activity_select on public.transfer_request_activity
  for select to authenticated
  using (
    transfer_request_id in (select id from public.transfer_requests)  -- inherits parent visibility via its RLS
  );

drop policy if exists transfer_request_activity_insert on public.transfer_request_activity;
create policy transfer_request_activity_insert on public.transfer_request_activity
  for insert to authenticated
  with check (performed_by = auth.uid());

-- 4) Comp grid version history (org-scoped audit)
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
alter table public.comp_grid_history enable row level security;

drop policy if exists comp_grid_history_owner on public.comp_grid_history;
create policy comp_grid_history_owner on public.comp_grid_history
  for select to authenticated
  using (
    organization_id in (select id from public.organizations where owner_id = auth.uid())
    or public.has_role(auth.uid(), 'super_admin')
  );

drop policy if exists comp_grid_history_insert on public.comp_grid_history;
create policy comp_grid_history_insert on public.comp_grid_history
  for insert to authenticated
  with check (changed_by = auth.uid());

create index if not exists idx_comp_grid_history_org on public.comp_grid_history(organization_id, carrier_id, created_at desc);
