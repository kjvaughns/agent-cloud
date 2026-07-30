-- ============================================================================
-- CONTRACTING OPERATIONS — PART 2: PRODUCERS, LICENSING, PDB REVIEW
-- ============================================================================

create table if not exists public.producer_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  legal_first_name text,
  legal_middle_name text,
  legal_last_name text,
  preferred_name text,
  suffix text,
  resident_state text,
  resident_license_number text,
  address_history jsonb not null default '[]'::jsonb,
  employment_history jsonb not null default '[]'::jsonb,
  contracting_notes text,
  profile_completeness integer not null default 0
    check (profile_completeness between 0 and 100),
  completeness_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_producer_profiles_org on public.producer_profiles(organization_id);

grant select, insert, update on public.producer_profiles to authenticated;
grant all on public.producer_profiles to service_role;

alter table public.producer_profiles enable row level security;

drop policy if exists producer_profiles_read on public.producer_profiles;
create policy producer_profiles_read on public.producer_profiles
  for select to authenticated
  using (
    profile_id = auth.uid()
    or public.is_platform_admin()
    or public.is_in_downline(auth.uid(), profile_id)
    or (organization_id is not null and public.can_view_contracting(organization_id))
  );

drop policy if exists producer_profiles_self_write on public.producer_profiles;
create policy producer_profiles_self_write on public.producer_profiles
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists producer_profiles_staff_write on public.producer_profiles;
create policy producer_profiles_staff_write on public.producer_profiles
  for all to authenticated
  using (organization_id is not null and public.can_manage_contracting(organization_id))
  with check (organization_id is not null and public.can_manage_contracting(organization_id));

-- 2. LICENCE VERIFICATION PROVENANCE
alter table public.state_licenses
  add column if not exists status text not null default 'unknown'
    check (status in ('active','inactive','expired','pending','lapsed','unknown')),
  add column if not exists last_verified_at timestamptz,
  add column if not exists verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists verification_source text not null default 'manual_entry'
    check (verification_source in ('manual_entry','pdb_report','carrier_confirmation','import','external_api')),
  add column if not exists source_document_id uuid,
  add column if not exists next_review_date date,
  add column if not exists notes text,
  add column if not exists external_provider text,
  add column if not exists external_record_id text,
  add column if not exists last_synced_at timestamptz,
  add column if not exists sync_error text,
  add column if not exists manual_override boolean not null default false;

create index if not exists idx_state_licenses_review
  on public.state_licenses(organization_id, next_review_date)
  where next_review_date is not null;

create index if not exists idx_state_licenses_expiry
  on public.state_licenses(organization_id, expires_date)
  where expires_date is not null;

-- 3. CARRIER APPOINTMENTS
create table if not exists public.producer_appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete cascade,
  carrier_id uuid references public.carriers(id) on delete set null,
  carrier_name text,
  state_code text not null,
  line_of_authority text,
  status text not null default 'active'
    check (status in ('active','pending','terminated','expired','unknown')),
  effective_date date,
  termination_date date,
  termination_reason text,
  last_verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  verification_source text not null default 'manual_entry'
    check (verification_source in ('manual_entry','pdb_report','carrier_confirmation','import','external_api')),
  source_document_id uuid,
  notes text,
  external_provider text,
  external_record_id text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_producer_appointments_agent
  on public.producer_appointments(agent_id, status);
create index if not exists idx_producer_appointments_org
  on public.producer_appointments(organization_id, carrier_id, state_code);

grant select, insert, update, delete on public.producer_appointments to authenticated;
grant all on public.producer_appointments to service_role;

alter table public.producer_appointments enable row level security;

drop policy if exists producer_appointments_read on public.producer_appointments;
create policy producer_appointments_read on public.producer_appointments
  for select to authenticated
  using (
    agent_id = auth.uid()
    or public.is_platform_admin()
    or public.is_in_downline(auth.uid(), agent_id)
    or public.can_view_contracting(organization_id)
  );

drop policy if exists producer_appointments_write on public.producer_appointments;
create policy producer_appointments_write on public.producer_appointments
  for all to authenticated
  using (public.can_manage_licenses(organization_id))
  with check (public.can_manage_licenses(organization_id));

-- 4. REGULATORY ACTIONS
create table if not exists public.producer_regulatory_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete cascade,
  action_type text,
  state_code text,
  action_date date,
  disposition text,
  summary text,
  resolved boolean not null default false,
  source_document_id uuid,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_regulatory_actions_agent
  on public.producer_regulatory_actions(agent_id, resolved);

grant select, insert, update, delete on public.producer_regulatory_actions to authenticated;
grant all on public.producer_regulatory_actions to service_role;

alter table public.producer_regulatory_actions enable row level security;

drop policy if exists regulatory_actions_read on public.producer_regulatory_actions;
create policy regulatory_actions_read on public.producer_regulatory_actions
  for select to authenticated
  using (
    agent_id = auth.uid()
    or public.is_platform_admin()
    or public.can_manage_licenses(organization_id)
    or public.can_view_sensitive_docs(organization_id)
  );

drop policy if exists regulatory_actions_write on public.producer_regulatory_actions;
create policy regulatory_actions_write on public.producer_regulatory_actions
  for all to authenticated
  using (public.can_manage_licenses(organization_id))
  with check (public.can_manage_licenses(organization_id));

-- 5. PDB UPLOADS AND REVIEWS
alter table public.pdb_uploads
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists report_date date,
  add column if not exists uploaded_by uuid references public.profiles(id) on delete set null,
  add column if not exists file_size_bytes bigint,
  add column if not exists superseded_by uuid references public.pdb_uploads(id) on delete set null;

create index if not exists idx_pdb_uploads_agent_recent
  on public.pdb_uploads(agent_id, uploaded_at desc);

update public.pdb_uploads u
   set organization_id = p.organization_id
  from public.profiles p
 where p.id = u.agent_id and u.organization_id is null;

create table if not exists public.pdb_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete cascade,
  pdb_upload_id uuid not null references public.pdb_uploads(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','in_review','verified','rejected','superseded')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  licenses_recorded integer not null default 0,
  appointments_recorded integer not null default 0,
  regulatory_actions_found integer not null default 0,
  report_date date,
  next_review_date date,
  reviewer_notes text,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pdb_reviews_org_status
  on public.pdb_reviews(organization_id, status);
create index if not exists idx_pdb_reviews_agent
  on public.pdb_reviews(agent_id, created_at desc);
create index if not exists idx_pdb_reviews_next
  on public.pdb_reviews(organization_id, next_review_date)
  where next_review_date is not null;

grant select, insert, update on public.pdb_reviews to authenticated;
grant all on public.pdb_reviews to service_role;

alter table public.pdb_reviews enable row level security;

drop policy if exists pdb_reviews_read on public.pdb_reviews;
create policy pdb_reviews_read on public.pdb_reviews
  for select to authenticated
  using (
    agent_id = auth.uid()
    or public.is_platform_admin()
    or public.is_in_downline(auth.uid(), agent_id)
    or public.can_view_contracting(organization_id)
  );

drop policy if exists pdb_reviews_write on public.pdb_reviews;
create policy pdb_reviews_write on public.pdb_reviews
  for all to authenticated
  using (public.can_manage_licenses(organization_id))
  with check (public.can_manage_licenses(organization_id));

-- 6. PRODUCER DOCUMENTS — review state and sensitivity
alter table public.producer_documents
  add column if not exists review_status text not null default 'uploaded'
    check (review_status in ('uploaded','approved','rejected','expired','superseded')),
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists is_sensitive boolean not null default false,
  add column if not exists storage_path text,
  add column if not exists uploaded_by uuid references public.profiles(id) on delete set null,
  add column if not exists superseded_by uuid references public.producer_documents(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.producer_documents
   set is_sensitive = true
 where doc_type in ('w9','voided_check','direct_deposit','government_id','ssn_card','tax_document')
   and not is_sensitive;

create index if not exists idx_producer_documents_review
  on public.producer_documents(organization_id, review_status);

-- 7. PER-AGENCY CONTRACTING POLICY
create table if not exists public.org_contracting_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  pdb_refresh_days integer not null default 90
    check (pdb_refresh_days in (0,30,60,90,180,365)),
  license_expiry_warning_days integer not null default 45
    check (license_expiry_warning_days between 0 and 365),
  require_manager_review boolean not null default false,
  require_owner_approval boolean not null default true,
  require_owner_approval_for_comp_change boolean not null default true,
  require_owner_approval_for_hierarchy boolean not null default true,
  default_request_priority text not null default 'normal'
    check (default_request_priority in ('low','normal','high','urgent')),
  request_sla_days integer not null default 7 check (request_sla_days >= 0),
  auto_assign_staff_id uuid references public.profiles(id) on delete set null,
  agents_may_request_contracts boolean not null default true,
  warn_on_duplicate_requests boolean not null default true,
  notify_on_missing_documents boolean not null default true,
  notify_on_status_change boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.org_contracting_settings to authenticated;
grant all on public.org_contracting_settings to service_role;

alter table public.org_contracting_settings enable row level security;

drop policy if exists org_contracting_settings_read on public.org_contracting_settings;
create policy org_contracting_settings_read on public.org_contracting_settings
  for select to authenticated
  using (organization_id in (select public.my_org_ids()) or public.is_platform_admin());

drop policy if exists org_contracting_settings_write on public.org_contracting_settings;
create policy org_contracting_settings_write on public.org_contracting_settings
  for all to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- 8. TOUCH TRIGGERS
do $$
declare t text;
begin
  foreach t in array array[
    'producer_profiles','producer_appointments','producer_regulatory_actions',
    'pdb_reviews','org_contracting_settings','producer_documents'
  ] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger trg_touch_%1$s before update on public.%1$s
         for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;