-- ============================================================================
-- SELF-SERVE COMMISSION GRIDS + BULK DOCUMENT INTAKE
-- ============================================================================

alter table public.commission_grids
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists source          text default 'manual',
  add column if not exists source_file     text,
  add column if not exists confidence      numeric,
  add column if not exists effective_date  date,
  add column if not exists created_by      uuid references public.profiles(id) on delete set null,
  add column if not exists created_at      timestamptz not null default now(),
  add column if not exists updated_at      timestamptz not null default now();

do $do$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.commission_grids'::regclass
       and conname = 'commission_grids_source_check'
  ) then
    alter table public.commission_grids
      add constraint commission_grids_source_check
      check (source is null or source in ('manual','upload','ai_extracted','seed'));
  end if;
end
$do$;

create index if not exists idx_commission_grids_org
  on public.commission_grids(organization_id, carrier_id);

alter table public.commission_grids enable row level security;

drop policy if exists commission_grids_read on public.commission_grids;
create policy commission_grids_read on public.commission_grids
  for select to authenticated
  using (
    organization_id is null
    or organization_id in (select public.my_org_ids())
  );

drop policy if exists commission_grids_write on public.commission_grids;
create policy commission_grids_write on public.commission_grids
  for all to authenticated
  using (organization_id is not null and public.is_org_owner(organization_id))
  with check (organization_id is not null and public.is_org_owner(organization_id));

drop trigger if exists trg_stamp_org_commission_grids on public.commission_grids;
create trigger trg_stamp_org_commission_grids
  before insert on public.commission_grids
  for each row execute function public.stamp_organization_id('created_by');

-- ---------------------------------------------------------------------------
create table if not exists public.commission_grid_uploads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  carrier_id uuid references public.carriers(id) on delete set null,
  carrier_name text,

  file_name text not null,
  file_url   text,
  mime_type  text,

  status text not null default 'uploaded'
    check (status in ('uploaded','extracting','review','applied','failed')),
  extracted jsonb,
  row_count integer not null default 0,
  error text,

  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.commission_grid_uploads to authenticated;
grant all on public.commission_grid_uploads to service_role;

create index if not exists idx_grid_uploads_org
  on public.commission_grid_uploads(organization_id, created_at desc);

alter table public.commission_grid_uploads enable row level security;

drop policy if exists commission_grid_uploads_access on public.commission_grid_uploads;
create policy commission_grid_uploads_access on public.commission_grid_uploads
  for all to authenticated
  using (
    organization_id is not null
    and organization_id in (select public.my_org_ids())
    and (public.is_org_owner(organization_id) or uploaded_by = auth.uid())
  )
  with check (
    organization_id is not null
    and organization_id in (select public.my_org_ids())
    and (public.is_org_owner(organization_id) or uploaded_by = auth.uid())
  );

drop trigger if exists trg_stamp_org_grid_uploads on public.commission_grid_uploads;
create trigger trg_stamp_org_grid_uploads
  before insert on public.commission_grid_uploads
  for each row execute function public.stamp_organization_id('uploaded_by');

-- ---------------------------------------------------------------------------
-- 2. BULK DOCUMENT INTAKE
-- ---------------------------------------------------------------------------

create table if not exists public.document_intake (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  batch_id uuid not null,

  file_name text not null,
  file_url  text,
  mime_type text,
  size_bytes integer,

  status text not null default 'queued'
    check (status in ('queued','analyzing','needs_review','applied','dismissed','failed')),

  doc_type text,
  carrier_name text,
  period_label text,
  summary text,
  suggested_action text,
  extracted jsonb,
  confidence numeric,
  error text,

  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,

  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.document_intake to authenticated;
grant all on public.document_intake to service_role;

create index if not exists idx_document_intake_batch
  on public.document_intake(batch_id, created_at);
create index if not exists idx_document_intake_org
  on public.document_intake(organization_id, status, created_at desc);

alter table public.document_intake enable row level security;

drop policy if exists document_intake_access on public.document_intake;
create policy document_intake_access on public.document_intake
  for all to authenticated
  using (
    organization_id is not null
    and organization_id in (select public.my_org_ids())
    and (public.is_org_owner(organization_id) or uploaded_by = auth.uid())
  )
  with check (
    organization_id is not null
    and organization_id in (select public.my_org_ids())
    and (public.is_org_owner(organization_id) or uploaded_by = auth.uid())
  );

drop trigger if exists trg_stamp_org_document_intake on public.document_intake;
create trigger trg_stamp_org_document_intake
  before insert on public.document_intake
  for each row execute function public.stamp_organization_id('uploaded_by');