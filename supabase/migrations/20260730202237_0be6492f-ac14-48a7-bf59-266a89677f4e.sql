-- ============================================================================
-- CONTRACTING OPERATIONS — PART 4: TEMPLATES, READY TO SELL, AUDIT
-- ============================================================================

create table if not exists public.contracting_spreadsheet_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  org_carrier_id uuid references public.org_carriers(id) on delete cascade,
  name text not null,
  description text,
  storage_path text,
  file_name text,
  sheet_name text,
  header_row integer not null default 1 check (header_row >= 1),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_spreadsheet_templates_carrier
  on public.contracting_spreadsheet_templates(organization_id, org_carrier_id, active);

create table if not exists public.contracting_field_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.contracting_spreadsheet_templates(id) on delete cascade,
  column_header text not null,
  column_index integer,
  source_key text not null,
  static_value text,
  transform text check (transform is null or transform in ('upper','lower','title','date_mdy','date_iso','digits_only')),
  required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, column_header)
);

create index if not exists idx_field_mappings_template
  on public.contracting_field_mappings(template_id, sort_order);

create table if not exists public.contracting_email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  org_carrier_id uuid references public.org_carriers(id) on delete cascade,
  name text not null,
  applies_to text[] not null default '{}',
  to_email text,
  cc_email text,
  subject text not null,
  body text not null,
  suggested_attachments text[] not null default '{}',
  active boolean not null default true,
  is_default boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_templates_carrier
  on public.contracting_email_templates(organization_id, org_carrier_id, active);

do $$
declare t text;
begin
  foreach t in array array[
    'contracting_spreadsheet_templates','contracting_field_mappings','contracting_email_templates'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format(
      'create policy %1$s_read on public.%1$s for select to authenticated
         using (public.can_view_contracting(organization_id) or public.is_platform_admin())', t);

    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format(
      'create policy %1$s_write on public.%1$s for all to authenticated
         using (public.can_manage_contracting(organization_id))
         with check (public.can_manage_contracting(organization_id))', t);
  end loop;
end $$;

-- 3. GENERATED SUBMISSION ARTEFACTS
create table if not exists public.contracting_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid references public.contracting_requests(id) on delete cascade,
  change_request_id uuid references public.hierarchy_change_requests(id) on delete cascade,
  artifact_type text not null
    check (artifact_type in ('packet_pdf','spreadsheet_row','spreadsheet_batch','email','portal_handoff','manual')),
  method text,
  template_id uuid,
  payload_snapshot jsonb not null default '{}'::jsonb,
  storage_path text,
  recipient text,
  row_count integer,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  marked_submitted_at timestamptz,
  marked_submitted_by uuid references public.profiles(id) on delete set null,
  confirmation_reference text,
  notes text
);

create index if not exists idx_submissions_request
  on public.contracting_submissions(request_id, generated_at desc);
create index if not exists idx_submissions_org
  on public.contracting_submissions(organization_id, generated_at desc);

grant select, insert, update on public.contracting_submissions to authenticated;
grant all on public.contracting_submissions to service_role;

alter table public.contracting_submissions enable row level security;

drop policy if exists submissions_read on public.contracting_submissions;
create policy submissions_read on public.contracting_submissions
  for select to authenticated
  using (public.can_view_contracting(organization_id) or public.is_platform_admin());

drop policy if exists submissions_write on public.contracting_submissions;
create policy submissions_write on public.contracting_submissions
  for all to authenticated
  using (public.can_submit_contracts(organization_id))
  with check (public.can_submit_contracts(organization_id));

-- 4. READY TO SELL
create table if not exists public.ready_to_sell_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete cascade,
  org_carrier_id uuid not null references public.org_carriers(id) on delete cascade,
  status text not null default 'not_eligible' check (status in (
    'ready','missing_license','missing_appointment','contract_pending','contract_submitted',
    'missing_writing_number','missing_eo','missing_aml','missing_pdb','hierarchy_change_pending',
    'comp_approval_pending','not_eligible'
  )),
  sellable_states text[] not null default '{}',
  licensed_states text[] not null default '{}',
  appointed_states text[] not null default '{}',
  product_lines text[] not null default '{}',
  blockers jsonb not null default '[]'::jsonb,
  request_id uuid references public.contracting_requests(id) on delete set null,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (agent_id, org_carrier_id)
);

create index if not exists idx_ready_to_sell_org
  on public.ready_to_sell_records(organization_id, status);
create index if not exists idx_ready_to_sell_agent
  on public.ready_to_sell_records(agent_id, status);

grant select on public.ready_to_sell_records to authenticated;
grant all on public.ready_to_sell_records to service_role;

alter table public.ready_to_sell_records enable row level security;

drop policy if exists ready_to_sell_read on public.ready_to_sell_records;
create policy ready_to_sell_read on public.ready_to_sell_records
  for select to authenticated
  using (
    agent_id = auth.uid()
    or public.is_platform_admin()
    or public.is_in_downline(auth.uid(), agent_id)
    or public.can_view_contracting(organization_id)
  );

-- 5. CONTRACTING AUDIT LOG
create table if not exists public.contracting_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  record_type text not null,
  record_id uuid,
  subject_agent_id uuid references public.profiles(id) on delete set null,
  previous_value jsonb,
  new_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_contracting_audit_org
  on public.contracting_audit_log(organization_id, created_at desc);
create index if not exists idx_contracting_audit_record
  on public.contracting_audit_log(record_type, record_id, created_at desc);
create index if not exists idx_contracting_audit_subject
  on public.contracting_audit_log(subject_agent_id, created_at desc)
  where subject_agent_id is not null;

grant select on public.contracting_audit_log to authenticated;
grant all on public.contracting_audit_log to service_role;

alter table public.contracting_audit_log enable row level security;

drop policy if exists contracting_audit_read on public.contracting_audit_log;
create policy contracting_audit_read on public.contracting_audit_log
  for select to authenticated
  using (
    public.is_platform_admin()
    or (organization_id is not null and public.can_view_contracting_audit(organization_id))
  );

-- 6. DOCUMENT ACCESS LOG
create table if not exists public.document_access_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  document_id uuid references public.producer_documents(id) on delete set null,
  pdb_upload_id uuid references public.pdb_uploads(id) on delete set null,
  subject_agent_id uuid references public.profiles(id) on delete set null,
  accessed_by uuid references public.profiles(id) on delete set null,
  access_type text not null check (access_type in ('view','download','signed_url','export','bundle_download')),
  was_sensitive boolean not null default false,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists idx_document_access_org
  on public.document_access_log(organization_id, created_at desc);
create index if not exists idx_document_access_subject
  on public.document_access_log(subject_agent_id, created_at desc);

grant select on public.document_access_log to authenticated;
grant all on public.document_access_log to service_role;

alter table public.document_access_log enable row level security;

drop policy if exists document_access_read on public.document_access_log;
create policy document_access_read on public.document_access_log
  for select to authenticated
  using (
    public.is_platform_admin()
    or subject_agent_id = auth.uid()
    or (organization_id is not null and public.can_view_contracting_audit(organization_id))
  );

-- 7. TOUCH TRIGGERS
do $$
declare t text;
begin
  foreach t in array array[
    'contracting_spreadsheet_templates','contracting_field_mappings',
    'contracting_email_templates'
  ] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger trg_touch_%1$s before update on public.%1$s
         for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;