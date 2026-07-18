-- Carrier Book Sync: weekly carrier CSV/XLSX upload -> carrier-accurate policy statuses
-- Upload restricted to agency owners/admins (enforced server-side); effect is hierarchy-wide.

-- 1) Source tracking on every synced policy
alter table public.policies
  add column if not exists last_synced_at timestamptz,
  add column if not exists sync_source text;

-- 2) Sync history
create table if not exists public.carrier_sync_logs (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  carrier_id uuid references public.carriers(id) on delete set null,
  file_name text,
  total_rows integer not null default 0,
  matched integer not null default 0,
  updated integer not null default 0,
  unmatched integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.carrier_sync_logs enable row level security;

drop policy if exists carrier_sync_logs_select on public.carrier_sync_logs;
create policy carrier_sync_logs_select on public.carrier_sync_logs
  for select to authenticated
  using (uploaded_by = auth.uid() or public.is_in_downline(auth.uid(), uploaded_by) or public.has_role(auth.uid(), 'admin'));

drop policy if exists carrier_sync_logs_insert on public.carrier_sync_logs;
create policy carrier_sync_logs_insert on public.carrier_sync_logs
  for insert to authenticated
  with check (uploaded_by = auth.uid());

create index if not exists idx_carrier_sync_logs_uploader on public.carrier_sync_logs(uploaded_by, created_at desc);

-- 3) Reusable per-carrier mapping templates (column map + carrier-status map)
create table if not exists public.carrier_mapping_templates (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  carrier_id uuid not null references public.carriers(id) on delete cascade,
  column_map jsonb not null default '{}'::jsonb,
  status_map jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (created_by, carrier_id)
);
alter table public.carrier_mapping_templates enable row level security;

drop policy if exists carrier_mapping_templates_own on public.carrier_mapping_templates;
create policy carrier_mapping_templates_own on public.carrier_mapping_templates
  for all to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());
