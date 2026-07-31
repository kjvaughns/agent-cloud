-- ============================================================================
-- CONTRACTING OPERATIONS — PART 3: REQUESTS, WRITING NUMBERS, HIERARCHIES
--
-- On the relationship with the existing `contract_requests` table:
--
--   contract_requests    stays the APPOINTMENT RECORD — "does this agent have
--                        this carrier". It carries activated_at, writing_number
--                        and a six-value status, and the agent-facing carrier
--                        list already reads it.
--   contracting_requests is the UNIT OF OPERATIONAL WORK — the seventeen-status
--                        workflow, assignment, readiness, packet, submission.
--
-- They are not duplicates: one is a fact about the producer, the other is a
-- job on somebody's desk. A request that reaches approved writes through to
-- the appointment record rather than becoming a second answer to the same
-- question.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. CONTRACTING REQUESTS
-- ---------------------------------------------------------------------------

create table if not exists public.contracting_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Human-facing identifier. Staff quote this on the phone to a carrier; a
  -- uuid is unusable for that.
  reference text,

  agent_id uuid not null references public.profiles(id) on delete cascade,
  org_carrier_id uuid not null references public.org_carriers(id) on delete cascade,

  contract_type text not null default 'new_contract' check (contract_type in (
    'new_contract','state_appointment','product_line_addition','transfer','release',
    'recontract','comp_level_change','hierarchy_change','writing_number_correction',
    'appointment_reinstatement','other'
  )),

  status text not null default 'draft' check (status in (
    'draft','missing_information','missing_documents','awaiting_agent','awaiting_manager',
    'awaiting_owner_approval','ready_to_submit','assigned','submitted','carrier_reviewing',
    'nigo','additional_info_requested','approved','writing_number_issued','declined',
    'cancelled','closed'
  )),

  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),

  product_lines text[] not null default '{}',
  requested_comp_level_id uuid references public.carrier_comp_levels(id) on delete set null,
  requested_advance_level text,
  desired_effective_date date,

  -- Hierarchy as requested. Resolved against carrier_hierarchy_records when the
  -- packet is built; stored here because the request is the thing being
  -- approved and it must not silently change underneath an approval.
  direct_upline_id uuid references public.profiles(id) on delete set null,
  requested_hierarchy_note text,
  is_transfer boolean not null default false,

  notes text,
  internal_notes text,

  -- Workflow ownership.
  created_by uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz,
  assigned_by uuid references public.profiles(id) on delete set null,
  due_date date,

  submitted_at timestamptz,
  submitted_by uuid references public.profiles(id) on delete set null,
  submission_method text,
  submission_reference text,
  carrier_confirmation_number text,

  approved_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  closed_at timestamptz,

  -- Readiness cache, recomputed by the engine on every mutation that could
  -- change it. Never trusted as the sole gate — the engine re-runs before a
  -- request may leave ready_to_submit.
  readiness_state text not null default 'not_started' check (readiness_state in (
    'not_started','missing_information','missing_documents','missing_license',
    'missing_hierarchy','missing_writing_number','awaiting_approval','ready_to_submit',
    'submitted','approved'
  )),
  readiness_pct integer not null default 0 check (readiness_pct between 0 and 100),
  readiness_blockers jsonb not null default '[]'::jsonb,
  readiness_checked_at timestamptz,

  -- Resulting appointment record, once the carrier says yes.
  contract_record_id uuid references public.contract_requests(id) on delete set null,

  -- Integration preparation.
  external_provider text,
  external_record_id text,
  external_status text,
  last_synced_at timestamptz,
  sync_source text,
  sync_error text,
  manual_override boolean not null default false,
  integration_metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contracting_requests_org_status
  on public.contracting_requests(organization_id, status, updated_at desc);
create index if not exists idx_contracting_requests_agent
  on public.contracting_requests(agent_id, status);
create index if not exists idx_contracting_requests_assigned
  on public.contracting_requests(assigned_to, status) where assigned_to is not null;
create index if not exists idx_contracting_requests_carrier
  on public.contracting_requests(org_carrier_id, status);
create index if not exists idx_contracting_requests_due
  on public.contracting_requests(organization_id, due_date)
  where due_date is not null;

-- One open request per agent, carrier and contract type. Duplicate carrier
-- submissions are the most common and most embarrassing failure in this
-- process, so it is a constraint rather than a warning in the UI.
create unique index if not exists idx_contracting_requests_no_duplicate_open
  on public.contracting_requests(agent_id, org_carrier_id, contract_type)
  where status not in ('approved','writing_number_issued','declined','cancelled','closed');

create unique index if not exists idx_contracting_requests_reference
  on public.contracting_requests(organization_id, reference) where reference is not null;

grant select, insert, update on public.contracting_requests to authenticated;
grant all on public.contracting_requests to service_role;

alter table public.contracting_requests enable row level security;

-- Agents see their own. Managers see their downline. Contracting staff see the
-- organization. Nobody sees another agency.
drop policy if exists contracting_requests_read on public.contracting_requests;
create policy contracting_requests_read on public.contracting_requests
  for select to authenticated
  using (
    agent_id = auth.uid()
    or public.is_platform_admin()
    or public.is_in_downline(auth.uid(), agent_id)
    or public.can_view_contracting(organization_id)
  );

-- An agent may open a request for themselves; staff and uplines may open one
-- for anyone they already have access to.
drop policy if exists contracting_requests_insert on public.contracting_requests;
create policy contracting_requests_insert on public.contracting_requests
  for insert to authenticated
  with check (
    organization_id in (select public.my_org_ids())
    and (
      agent_id = auth.uid()
      or public.is_in_downline(auth.uid(), agent_id)
      or public.can_submit_contracts(organization_id)
    )
  );

-- An agent may edit their own request only while it is still theirs to edit.
-- Once it is with staff or a carrier, changes go through the workflow.
drop policy if exists contracting_requests_update on public.contracting_requests;
create policy contracting_requests_update on public.contracting_requests
  for update to authenticated
  using (
    public.can_submit_contracts(organization_id)
    or public.can_approve_contracts(organization_id)
    or (agent_id = auth.uid() and status in ('draft','missing_information','missing_documents','awaiting_agent'))
    or (public.is_in_downline(auth.uid(), agent_id) and status in ('draft','missing_information','missing_documents','awaiting_agent','awaiting_manager'))
  )
  with check (organization_id in (select public.my_org_ids()));

-- Reference numbers: AC-<org prefix>-<zero padded sequence>.
create sequence if not exists public.contracting_request_seq;

create or replace function public.set_contracting_request_reference()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.reference is null then
    new.reference := 'CR-' || to_char(now(), 'YY') || '-' ||
                     lpad(nextval('public.contracting_request_seq')::text, 6, '0');
  end if;
  return new;
end
$$;

drop trigger if exists trg_contracting_request_reference on public.contracting_requests;
create trigger trg_contracting_request_reference
  before insert on public.contracting_requests
  for each row execute function public.set_contracting_request_reference();

-- ---------------------------------------------------------------------------
-- 2. REQUESTED STATES
--
-- A separate row per state because a request is commonly approved for some
-- states and not others, and each carries its own appointment outcome.
-- ---------------------------------------------------------------------------

create table if not exists public.contracting_request_states (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null references public.contracting_requests(id) on delete cascade,

  state_code text not null,
  status text not null default 'requested'
    check (status in ('requested','submitted','approved','declined','withdrawn')),
  appointment_effective_date date,
  writing_number text,
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (request_id, state_code)
);

create index if not exists idx_request_states_request
  on public.contracting_request_states(request_id);

grant select, insert, update, delete on public.contracting_request_states to authenticated;
grant all on public.contracting_request_states to service_role;

alter table public.contracting_request_states enable row level security;

drop policy if exists request_states_read on public.contracting_request_states;
create policy request_states_read on public.contracting_request_states
  for select to authenticated
  using (exists (
    select 1 from public.contracting_requests r
     where r.id = request_id
       and (r.agent_id = auth.uid()
            or public.is_platform_admin()
            or public.is_in_downline(auth.uid(), r.agent_id)
            or public.can_view_contracting(r.organization_id))
  ));

drop policy if exists request_states_write on public.contracting_request_states;
create policy request_states_write on public.contracting_request_states
  for all to authenticated
  using (exists (
    select 1 from public.contracting_requests r
     where r.id = request_id
       and (public.can_submit_contracts(r.organization_id)
            or (r.agent_id = auth.uid() and r.status in ('draft','missing_information','awaiting_agent')))
  ))
  with check (organization_id in (select public.my_org_ids()));

-- ---------------------------------------------------------------------------
-- 3. REQUEST DOCUMENTS
--
-- Links an existing producer_documents row to a request, so uploading a W9
-- once satisfies every carrier that asks for one.
-- ---------------------------------------------------------------------------

create table if not exists public.contracting_request_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null references public.contracting_requests(id) on delete cascade,
  document_id uuid references public.producer_documents(id) on delete set null,

  requirement_key text not null,
  status text not null default 'missing'
    check (status in ('missing','uploaded','approved','rejected','expired','waived')),
  waived_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (request_id, requirement_key)
);

create index if not exists idx_request_documents_request
  on public.contracting_request_documents(request_id, status);

grant select, insert, update, delete on public.contracting_request_documents to authenticated;
grant all on public.contracting_request_documents to service_role;

alter table public.contracting_request_documents enable row level security;

drop policy if exists request_documents_read on public.contracting_request_documents;
create policy request_documents_read on public.contracting_request_documents
  for select to authenticated
  using (exists (
    select 1 from public.contracting_requests r
     where r.id = request_id
       and (r.agent_id = auth.uid()
            or public.is_platform_admin()
            or public.is_in_downline(auth.uid(), r.agent_id)
            or public.can_view_contracting(r.organization_id))
  ));

drop policy if exists request_documents_write on public.contracting_request_documents;
create policy request_documents_write on public.contracting_request_documents
  for all to authenticated
  using (exists (
    select 1 from public.contracting_requests r
     where r.id = request_id
       and (public.can_submit_contracts(r.organization_id) or r.agent_id = auth.uid())
  ))
  with check (organization_id in (select public.my_org_ids()));

-- ---------------------------------------------------------------------------
-- 4. STATUS HISTORY
--
-- Append only. The agent-visible message and the internal note are separate
-- columns on purpose: staff must be able to write "chasing the carrier again,
-- third time" without the agent reading it.
-- ---------------------------------------------------------------------------

create table if not exists public.contracting_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null references public.contracting_requests(id) on delete cascade,

  from_status text,
  to_status text not null,

  changed_by uuid references public.profiles(id) on delete set null,
  agent_visible_message text,
  internal_message text,
  next_action text,
  due_date date,
  attachment_document_id uuid references public.producer_documents(id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists idx_status_history_request
  on public.contracting_status_history(request_id, created_at desc);

grant select, insert on public.contracting_status_history to authenticated;
grant all on public.contracting_status_history to service_role;

alter table public.contracting_status_history enable row level security;

-- The agent sees the timeline but not the internal column; the API strips it.
-- The policy governs row access, the server function governs field access.
drop policy if exists status_history_read on public.contracting_status_history;
create policy status_history_read on public.contracting_status_history
  for select to authenticated
  using (exists (
    select 1 from public.contracting_requests r
     where r.id = request_id
       and (r.agent_id = auth.uid()
            or public.is_platform_admin()
            or public.is_in_downline(auth.uid(), r.agent_id)
            or public.can_view_contracting(r.organization_id))
  ));

drop policy if exists status_history_insert on public.contracting_status_history;
create policy status_history_insert on public.contracting_status_history
  for insert to authenticated
  with check (
    organization_id in (select public.my_org_ids())
    and exists (
      select 1 from public.contracting_requests r
       where r.id = request_id
         and (public.can_submit_contracts(r.organization_id)
              or public.can_approve_contracts(r.organization_id)
              or r.agent_id = auth.uid())
    )
  );

-- Record every status transition without asking the application to remember.
create or replace function public.log_contracting_status_change()
returns trigger language plpgsql set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.contracting_status_history
      (organization_id, request_id, from_status, to_status, changed_by)
    values (new.organization_id, new.id, old.status, new.status, auth.uid());
  elsif tg_op = 'INSERT' then
    insert into public.contracting_status_history
      (organization_id, request_id, from_status, to_status, changed_by)
    values (new.organization_id, new.id, null, new.status, auth.uid());
  end if;
  return new;
end
$$;

drop trigger if exists trg_log_contracting_status on public.contracting_requests;
create trigger trg_log_contracting_status
  after insert or update of status on public.contracting_requests
  for each row execute function public.log_contracting_status_change();

-- ---------------------------------------------------------------------------
-- 5. WRITING NUMBERS
--
-- Deliberately many-per-agent-per-carrier. Assuming one writing number per
-- carrier is wrong for any agency writing multiple product lines or operating
-- in states the carrier numbers separately.
-- ---------------------------------------------------------------------------

create table if not exists public.writing_numbers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete cascade,
  org_carrier_id uuid not null references public.org_carriers(id) on delete cascade,

  writing_number text not null,
  number_type text not null default 'individual' check (number_type in (
    'individual','agency','hierarchy','state_specific','product_specific'
  )),
  scope text not null default 'national' check (scope in ('national','state','product')),
  state_code text,
  product_line text,

  effective_date date,
  termination_date date,
  status text not null default 'active'
    check (status in ('active','pending','terminated','suspended','unknown')),

  comp_level_id uuid references public.carrier_comp_levels(id) on delete set null,
  advance_level text,

  -- Hierarchy as the carrier holds it, which may not match the org chart.
  direct_upline_id uuid references public.profiles(id) on delete set null,
  upline_writing_number text,
  upline_npn text,
  hierarchy_path text,

  source text not null default 'manual_entry'
    check (source in ('manual_entry','carrier_confirmation','import','request_outcome','external_api')),
  confirmation_document_id uuid references public.producer_documents(id) on delete set null,
  request_id uuid references public.contracting_requests(id) on delete set null,
  notes text,

  external_provider text,
  external_record_id text,
  last_synced_at timestamptz,
  manual_override boolean not null default false,

  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_writing_numbers_agent
  on public.writing_numbers(agent_id, status);
create index if not exists idx_writing_numbers_org_carrier
  on public.writing_numbers(organization_id, org_carrier_id, status);
create index if not exists idx_writing_numbers_lookup
  on public.writing_numbers(organization_id, writing_number);

-- The same number should not be recorded twice for one agent, carrier, state
-- and product. Nulls are distinct in Postgres, so coalesce into the index.
create unique index if not exists idx_writing_numbers_unique
  on public.writing_numbers(
    agent_id, org_carrier_id, writing_number,
    coalesce(state_code,''), coalesce(product_line,'')
  );

grant select, insert, update, delete on public.writing_numbers to authenticated;
grant all on public.writing_numbers to service_role;

alter table public.writing_numbers enable row level security;

drop policy if exists writing_numbers_read on public.writing_numbers;
create policy writing_numbers_read on public.writing_numbers
  for select to authenticated
  using (
    agent_id = auth.uid()
    or public.is_platform_admin()
    or public.is_in_downline(auth.uid(), agent_id)
    or public.can_view_contracting(organization_id)
  );

drop policy if exists writing_numbers_write on public.writing_numbers;
create policy writing_numbers_write on public.writing_numbers
  for all to authenticated
  using (public.can_manage_contracting(organization_id) or public.can_submit_contracts(organization_id))
  with check (public.can_manage_contracting(organization_id) or public.can_submit_contracts(organization_id));

-- ---------------------------------------------------------------------------
-- 6. CARRIER HIERARCHIES
--
-- One row per agent per carrier. The org chart is not the carrier hierarchy —
-- an agent can sit under a different upline at each carrier, and the packet
-- must carry the carrier's version, not the internal one.
-- ---------------------------------------------------------------------------

create table if not exists public.carrier_hierarchy_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  org_carrier_id uuid not null references public.org_carriers(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete cascade,

  direct_upline_id uuid references public.profiles(id) on delete set null,
  direct_upline_name text,
  direct_upline_npn text,
  direct_upline_writing_number text,
  direct_upline_comp_level_id uuid references public.carrier_comp_levels(id) on delete set null,

  agency_owner_id uuid references public.profiles(id) on delete set null,
  agency_owner_npn text,
  agency_writing_number text,

  hierarchy_path text,
  "current_role" text,
  current_comp_level_id uuid references public.carrier_comp_levels(id) on delete set null,

  effective_date date,
  status text not null default 'active'
    check (status in ('active','pending','superseded','terminated')),
  pending_change_id uuid,

  confirmation_document_id uuid references public.producer_documents(id) on delete set null,
  notes text,

  external_provider text,
  external_record_id text,
  last_synced_at timestamptz,
  manual_override boolean not null default false,

  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (org_carrier_id, agent_id)
);

create index if not exists idx_carrier_hierarchy_agent
  on public.carrier_hierarchy_records(agent_id, status);
create index if not exists idx_carrier_hierarchy_upline
  on public.carrier_hierarchy_records(direct_upline_id) where direct_upline_id is not null;
create index if not exists idx_carrier_hierarchy_org
  on public.carrier_hierarchy_records(organization_id, org_carrier_id);

grant select, insert, update, delete on public.carrier_hierarchy_records to authenticated;
grant all on public.carrier_hierarchy_records to service_role;

alter table public.carrier_hierarchy_records enable row level security;

drop policy if exists carrier_hierarchy_read on public.carrier_hierarchy_records;
create policy carrier_hierarchy_read on public.carrier_hierarchy_records
  for select to authenticated
  using (
    agent_id = auth.uid()
    or direct_upline_id = auth.uid()
    or public.is_platform_admin()
    or public.is_in_downline(auth.uid(), agent_id)
    or public.can_view_contracting(organization_id)
  );

drop policy if exists carrier_hierarchy_write on public.carrier_hierarchy_records;
create policy carrier_hierarchy_write on public.carrier_hierarchy_records
  for all to authenticated
  using (public.can_manage_hierarchy(organization_id))
  with check (public.can_manage_hierarchy(organization_id));

-- ---------------------------------------------------------------------------
-- 7. HIERARCHY CHANGE REQUESTS
-- ---------------------------------------------------------------------------

create table if not exists public.hierarchy_change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text,

  agent_id uuid not null references public.profiles(id) on delete cascade,
  -- Null means the change applies to every carrier the agent holds.
  org_carrier_id uuid references public.org_carriers(id) on delete cascade,

  change_type text not null check (change_type in (
    'promotion','demotion','manager_reassignment','upline_change','carrier_hierarchy_change',
    'comp_change','release','transfer','agency_transfer','writing_number_correction','role_change'
  )),

  current_upline_id uuid references public.profiles(id) on delete set null,
  requested_upline_id uuid references public.profiles(id) on delete set null,
  current_comp_level_id uuid references public.carrier_comp_levels(id) on delete set null,
  requested_comp_level_id uuid references public.carrier_comp_levels(id) on delete set null,
  "current_role" text,
  requested_role text,
  current_writing_number text,

  requested_effective_date date,
  reason text,

  -- Filled by the impact analysis when the request is raised, so an approver
  -- sees what they are agreeing to rather than guessing.
  carrier_impact jsonb not null default '[]'::jsonb,
  commission_impact jsonb not null default '{}'::jsonb,

  status text not null default 'draft' check (status in (
    'draft','awaiting_manager','awaiting_owner','approved','processing',
    'submitted_to_carrier','carrier_confirmed','applied','declined','cancelled'
  )),

  assigned_to uuid references public.profiles(id) on delete set null,
  submitted_by uuid references public.profiles(id) on delete set null,
  notes text,
  internal_notes text,

  applied_at timestamptz,
  declined_at timestamptz,
  decline_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hierarchy_changes_org
  on public.hierarchy_change_requests(organization_id, status, updated_at desc);
create index if not exists idx_hierarchy_changes_agent
  on public.hierarchy_change_requests(agent_id, status);
create unique index if not exists idx_hierarchy_changes_reference
  on public.hierarchy_change_requests(organization_id, reference) where reference is not null;

grant select, insert, update on public.hierarchy_change_requests to authenticated;
grant all on public.hierarchy_change_requests to service_role;

alter table public.hierarchy_change_requests enable row level security;

drop policy if exists hierarchy_changes_read on public.hierarchy_change_requests;
create policy hierarchy_changes_read on public.hierarchy_change_requests
  for select to authenticated
  using (
    agent_id = auth.uid()
    or public.is_platform_admin()
    or public.is_in_downline(auth.uid(), agent_id)
    or public.can_view_contracting(organization_id)
  );

drop policy if exists hierarchy_changes_insert on public.hierarchy_change_requests;
create policy hierarchy_changes_insert on public.hierarchy_change_requests
  for insert to authenticated
  with check (
    organization_id in (select public.my_org_ids())
    and (agent_id = auth.uid()
         or public.is_in_downline(auth.uid(), agent_id)
         or public.can_manage_hierarchy(organization_id))
  );

drop policy if exists hierarchy_changes_update on public.hierarchy_change_requests;
create policy hierarchy_changes_update on public.hierarchy_change_requests
  for update to authenticated
  using (
    public.can_manage_hierarchy(organization_id)
    or public.can_approve_contracts(organization_id)
    or (agent_id = auth.uid() and status = 'draft')
  )
  with check (organization_id in (select public.my_org_ids()));

drop trigger if exists trg_hierarchy_change_reference on public.hierarchy_change_requests;
create or replace function public.set_hierarchy_change_reference()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.reference is null then
    new.reference := 'HC-' || to_char(now(), 'YY') || '-' ||
                     lpad(nextval('public.contracting_request_seq')::text, 6, '0');
  end if;
  return new;
end
$$;
create trigger trg_hierarchy_change_reference
  before insert on public.hierarchy_change_requests
  for each row execute function public.set_hierarchy_change_reference();

-- ---------------------------------------------------------------------------
-- 8. HIERARCHY CHANGE APPROVALS
--
-- One row per required approval step, created when the request is raised so
-- the UI can show who is holding it up before anyone has acted.
-- ---------------------------------------------------------------------------

create table if not exists public.hierarchy_change_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  change_request_id uuid not null references public.hierarchy_change_requests(id) on delete cascade,

  step text not null check (step in ('manager','owner','contracting_staff','carrier')),
  step_order integer not null default 0,
  approver_id uuid references public.profiles(id) on delete set null,

  decision text not null default 'pending'
    check (decision in ('pending','approved','declined','skipped')),
  decided_at timestamptz,
  comment text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (change_request_id, step)
);

create index if not exists idx_hierarchy_approvals_request
  on public.hierarchy_change_approvals(change_request_id, step_order);
create index if not exists idx_hierarchy_approvals_pending
  on public.hierarchy_change_approvals(organization_id, decision) where decision = 'pending';

grant select, insert, update on public.hierarchy_change_approvals to authenticated;
grant all on public.hierarchy_change_approvals to service_role;

alter table public.hierarchy_change_approvals enable row level security;

drop policy if exists hierarchy_approvals_read on public.hierarchy_change_approvals;
create policy hierarchy_approvals_read on public.hierarchy_change_approvals
  for select to authenticated
  using (exists (
    select 1 from public.hierarchy_change_requests h
     where h.id = change_request_id
       and (h.agent_id = auth.uid()
            or public.is_platform_admin()
            or public.is_in_downline(auth.uid(), h.agent_id)
            or public.can_view_contracting(h.organization_id))
  ));

-- Only the named approver, or someone who can approve for the org, may decide.
drop policy if exists hierarchy_approvals_write on public.hierarchy_change_approvals;
create policy hierarchy_approvals_write on public.hierarchy_change_approvals
  for all to authenticated
  using (
    approver_id = auth.uid()
    or public.can_approve_contracts(organization_id)
    or public.can_manage_hierarchy(organization_id)
  )
  with check (organization_id in (select public.my_org_ids()));

-- ---------------------------------------------------------------------------
-- 9. TOUCH TRIGGERS
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'contracting_requests','contracting_request_states','contracting_request_documents',
    'writing_numbers','carrier_hierarchy_records','hierarchy_change_requests',
    'hierarchy_change_approvals'
  ] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger trg_touch_%1$s before update on public.%1$s
         for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;
