-- ============================================================================
-- CONTRACTING OPERATIONS — PART 1: CARRIER DIRECTORY
-- ============================================================================

alter table public.carriers
  add column if not exists is_private boolean not null default false,
  add column if not exists owner_organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists logo_url text,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists created_at timestamptz not null default now();

alter table public.carriers drop constraint if exists carriers_private_owner_ck;
alter table public.carriers add constraint carriers_private_owner_ck
  check ((is_private and owner_organization_id is not null)
      or (not is_private and owner_organization_id is null));

create index if not exists idx_carriers_private_owner
  on public.carriers(owner_organization_id) where is_private;

alter table public.carriers enable row level security;

drop policy if exists carriers_read on public.carriers;
create policy carriers_read on public.carriers
  for select to authenticated
  using (not is_private or owner_organization_id in (select public.my_org_ids()));

drop policy if exists carriers_private_write on public.carriers;
create policy carriers_private_write on public.carriers
  for all to authenticated
  using (is_private and public.is_org_owner(owner_organization_id))
  with check (is_private and public.is_org_owner(owner_organization_id));

grant select on public.carriers to authenticated;
grant insert, update, delete on public.carriers to authenticated;
grant all on public.carriers to service_role;

-- 1. ORG CARRIERS
create table if not exists public.org_carriers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  carrier_id uuid not null references public.carriers(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active','paused','not_contracted','terminated')),
  contracting_portal_url text,
  surelc_url text,
  invitation_link text,
  contracting_email text,
  contracting_phone text,
  support_email text,
  support_phone text,
  turnaround_days integer check (turnaround_days is null or turnaround_days >= 0),
  product_types text[] not null default '{}',
  min_issue_age integer,
  max_issue_age integer,
  writing_number_scope text not null default 'national'
    check (writing_number_scope in ('national','state','product','mixed')),
  just_in_time_appointments boolean not null default false,
  transfers_allowed boolean not null default true,
  release_required boolean not null default false,
  release_requirements text,
  min_production_requirements text,
  internal_instructions text,
  staff_notes text,
  custom_statuses jsonb not null default '[]'::jsonb,
  external_provider text,
  external_record_id text,
  external_status text,
  last_synced_at timestamptz,
  sync_source text,
  sync_error text,
  manual_override boolean not null default false,
  integration_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, carrier_id)
);

create index if not exists idx_org_carriers_org on public.org_carriers(organization_id, status);
create index if not exists idx_org_carriers_carrier on public.org_carriers(carrier_id);

grant select, insert, update, delete on public.org_carriers to authenticated;
grant all on public.org_carriers to service_role;

alter table public.org_carriers enable row level security;

drop policy if exists org_carriers_read on public.org_carriers;
create policy org_carriers_read on public.org_carriers
  for select to authenticated
  using (organization_id in (select public.my_org_ids()) or public.is_platform_admin());

drop policy if exists org_carriers_write on public.org_carriers;
create policy org_carriers_write on public.org_carriers
  for all to authenticated
  using (public.is_org_owner(organization_id) or public.can_manage_contracting(organization_id))
  with check (public.is_org_owner(organization_id) or public.can_manage_contracting(organization_id));

-- 2. CONTRACTING METHODS
create table if not exists public.org_carrier_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  org_carrier_id uuid not null references public.org_carriers(id) on delete cascade,
  method text not null check (method in (
    'surelc','carrier_portal','invitation_link','email','spreadsheet','manual_form','api','other'
  )),
  applies_to text[] not null default '{}',
  target_url text,
  target_email text,
  instructions text,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_carrier_methods_carrier
  on public.org_carrier_methods(org_carrier_id, sort_order);

create unique index if not exists idx_org_carrier_methods_one_default
  on public.org_carrier_methods(org_carrier_id) where is_default;

grant select, insert, update, delete on public.org_carrier_methods to authenticated;
grant all on public.org_carrier_methods to service_role;

alter table public.org_carrier_methods enable row level security;

drop policy if exists org_carrier_methods_read on public.org_carrier_methods;
create policy org_carrier_methods_read on public.org_carrier_methods
  for select to authenticated
  using (organization_id in (select public.my_org_ids()) or public.is_platform_admin());

drop policy if exists org_carrier_methods_write on public.org_carrier_methods;
create policy org_carrier_methods_write on public.org_carrier_methods
  for all to authenticated
  using (public.is_org_owner(organization_id) or public.can_manage_contracting(organization_id))
  with check (public.is_org_owner(organization_id) or public.can_manage_contracting(organization_id));

-- 3. CARRIER REQUIREMENTS
create table if not exists public.carrier_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  org_carrier_id uuid not null references public.org_carriers(id) on delete cascade,
  kind text not null check (kind in ('field','document')),
  requirement_key text not null,
  label text not null,
  help_text text,
  necessity text not null default 'required'
    check (necessity in ('required','optional','conditional')),
  applies_to_states text[] not null default '{}',
  applies_to_contract_types text[] not null default '{}',
  applies_to_product_lines text[] not null default '{}',
  applies_to_comp_levels text[] not null default '{}',
  transfers_only boolean not null default false,
  hierarchy_changes_only boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_carrier_id, requirement_key)
);

create index if not exists idx_carrier_requirements_carrier
  on public.carrier_requirements(org_carrier_id, active, sort_order);

grant select, insert, update, delete on public.carrier_requirements to authenticated;
grant all on public.carrier_requirements to service_role;

alter table public.carrier_requirements enable row level security;

drop policy if exists carrier_requirements_read on public.carrier_requirements;
create policy carrier_requirements_read on public.carrier_requirements
  for select to authenticated
  using (organization_id in (select public.my_org_ids()) or public.is_platform_admin());

drop policy if exists carrier_requirements_write on public.carrier_requirements;
create policy carrier_requirements_write on public.carrier_requirements
  for all to authenticated
  using (public.is_org_owner(organization_id) or public.can_manage_contracting(organization_id))
  with check (public.is_org_owner(organization_id) or public.can_manage_contracting(organization_id));

-- 4. COMPENSATION LEVELS
create table if not exists public.carrier_comp_levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  org_carrier_id uuid not null references public.org_carriers(id) on delete cascade,
  level_name text not null,
  commission_pct numeric(6,3) check (commission_pct is null or commission_pct >= 0),
  advance_months integer check (advance_months is null or advance_months >= 0),
  advance_pct numeric(6,3) check (advance_pct is null or advance_pct >= 0),
  renewal_pct numeric(6,3) check (renewal_pct is null or renewal_pct >= 0),
  chargeback_rules text,
  role_eligibility text[] not null default '{}',
  max_downline_level_id uuid references public.carrier_comp_levels(id) on delete set null,
  min_production_requirements text,
  effective_date date,
  status text not null default 'active' check (status in ('active','inactive','retired')),
  notes text,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_carrier_id, level_name)
);

create index if not exists idx_carrier_comp_levels_carrier
  on public.carrier_comp_levels(org_carrier_id, status, sort_order);

grant select, insert, update, delete on public.carrier_comp_levels to authenticated;
grant all on public.carrier_comp_levels to service_role;

alter table public.carrier_comp_levels enable row level security;

drop policy if exists carrier_comp_levels_read on public.carrier_comp_levels;
create policy carrier_comp_levels_read on public.carrier_comp_levels
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_org_owner(organization_id)
    or public.can_manage_contracting(organization_id)
    or public.can_view_agency_comp(organization_id)
  );

drop policy if exists carrier_comp_levels_write on public.carrier_comp_levels;
create policy carrier_comp_levels_write on public.carrier_comp_levels
  for all to authenticated
  using (public.is_org_owner(organization_id) or public.can_manage_comp_levels(organization_id))
  with check (public.is_org_owner(organization_id) or public.can_manage_comp_levels(organization_id));

create table if not exists public.org_role_comp_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  org_carrier_id uuid not null references public.org_carriers(id) on delete cascade,
  internal_role text not null,
  comp_level_id uuid not null references public.carrier_comp_levels(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_carrier_id, internal_role)
);

create index if not exists idx_role_comp_mappings_org
  on public.org_role_comp_mappings(organization_id, org_carrier_id);

grant select, insert, update, delete on public.org_role_comp_mappings to authenticated;
grant all on public.org_role_comp_mappings to service_role;

alter table public.org_role_comp_mappings enable row level security;

drop policy if exists org_role_comp_mappings_read on public.org_role_comp_mappings;
create policy org_role_comp_mappings_read on public.org_role_comp_mappings
  for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_org_owner(organization_id)
    or public.can_manage_contracting(organization_id)
    or public.can_view_agency_comp(organization_id)
  );

drop policy if exists org_role_comp_mappings_write on public.org_role_comp_mappings;
create policy org_role_comp_mappings_write on public.org_role_comp_mappings
  for all to authenticated
  using (public.is_org_owner(organization_id) or public.can_manage_comp_levels(organization_id))
  with check (public.is_org_owner(organization_id) or public.can_manage_comp_levels(organization_id));

-- 5. TOUCH TRIGGERS
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public
as $$ begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'org_carriers','org_carrier_methods','carrier_requirements',
    'carrier_comp_levels','org_role_comp_mappings'
  ] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger trg_touch_%1$s before update on public.%1$s
         for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;