create table if not exists public.agency_levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  base_pct numeric not null check (base_pct >= 0 and base_pct <= 500),
  sort_order integer not null default 0,
  can_invite boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.agency_level_carrier_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agency_level_id uuid not null references public.agency_levels(id) on delete cascade,
  org_carrier_id uuid not null references public.org_carriers(id) on delete cascade,
  carrier_level_name text,
  carrier_pct numeric check (carrier_pct >= 0 and carrier_pct <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_level_id, org_carrier_id)
);

alter table public.profiles add column if not exists agency_level_id uuid references public.agency_levels(id) on delete set null;
alter table public.invitation_links add column if not exists agency_level_id uuid references public.agency_levels(id) on delete set null;

alter table public.agency_levels enable row level security;
alter table public.agency_level_carrier_mappings enable row level security;
grant select, insert, update, delete on public.agency_levels to authenticated;
grant select, insert, update, delete on public.agency_level_carrier_mappings to authenticated;
grant all on public.agency_levels, public.agency_level_carrier_mappings to service_role;

drop policy if exists agency_levels_read on public.agency_levels;
create policy agency_levels_read on public.agency_levels for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.organization_id = agency_levels.organization_id)
);
drop policy if exists agency_levels_write on public.agency_levels;
create policy agency_levels_write on public.agency_levels for all to authenticated using (
  public.is_org_admin(organization_id)
) with check (public.is_org_admin(organization_id));

drop policy if exists agency_level_mappings_read on public.agency_level_carrier_mappings;
create policy agency_level_mappings_read on public.agency_level_carrier_mappings for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.organization_id = agency_level_carrier_mappings.organization_id)
);
drop policy if exists agency_level_mappings_write on public.agency_level_carrier_mappings;
create policy agency_level_mappings_write on public.agency_level_carrier_mappings for all to authenticated using (
  public.is_org_admin(organization_id)
) with check (public.is_org_admin(organization_id));

create index if not exists idx_agency_levels_org on public.agency_levels(organization_id, sort_order);
create index if not exists idx_agency_level_mappings_level on public.agency_level_carrier_mappings(agency_level_id);