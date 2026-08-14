-- ---------------------------------------------------------------------------
-- THE TERMS OF A PARENT/CHILD AGENCY RELATIONSHIP GET A RECORD
--
-- organizations.parent_org_id says only that a relationship exists. It cannot
-- say what the relationship means: does the child's production count in the
-- parent's totals, do its posted deals flow into the parent's sales feed, is
-- the link active at all. Those are the toggles the IMO rollup reads, and
-- they need a row, not a foreign key.
--
--   agency_relationships
--     include_production   count the child in the parent's Total IMO numbers
--     allow_sales_feed     child deals may flow into the parent's feed
--     visibility           how much of the child the parent surface shows
--     status               active | paused | terminated — paused keeps the
--                          row (and its history) while excluding the child
--                          from every rollup; terminated is the tombstone
--
-- Backfilled with one row per existing parent_org_id link, defaults on —
-- today's implicit relationships become explicit with the permissive terms
-- they already effectively have (nothing reads the toggles until the rollup
-- ships, so the backfill changes no behaviour).
--
-- Direction of trust: the parent owns the terms. A child can READ its own
-- row — it is entitled to know whether it is being counted — and can change
-- nothing. A child never sees the parent's other children, production, or
-- anything else; those queries simply do not exist.
-- ---------------------------------------------------------------------------

create table if not exists public.agency_relationships (
  id uuid primary key default gen_random_uuid(),
  parent_org_id uuid not null references public.organizations(id) on delete cascade,
  child_org_id uuid not null references public.organizations(id) on delete cascade,
  include_production boolean not null default true,
  allow_sales_feed boolean not null default true,
  visibility text not null default 'full' check (visibility in ('full', 'summary', 'none')),
  status text not null default 'active' check (status in ('active', 'paused', 'terminated')),
  effective_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parent_org_id, child_org_id),
  check (parent_org_id <> child_org_id)
);

alter table public.agency_relationships enable row level security;
grant select, insert, update, delete on public.agency_relationships to authenticated;
grant all on public.agency_relationships to service_role;

-- The parent's admins manage the terms.
drop policy if exists agency_relationships_parent_write on public.agency_relationships;
create policy agency_relationships_parent_write on public.agency_relationships for all using (
  public.is_org_admin(parent_org_id)
) with check (public.is_org_admin(parent_org_id));

-- A child's admins may see their own row and nothing more. Members of the
-- parent read through the write policy above; ordinary members of the child
-- have no business here.
drop policy if exists agency_relationships_child_read on public.agency_relationships;
create policy agency_relationships_child_read on public.agency_relationships for select using (
  public.is_org_admin(child_org_id)
);

create index if not exists idx_agency_relationships_parent on public.agency_relationships(parent_org_id, status);
create index if not exists idx_agency_relationships_child on public.agency_relationships(child_org_id);

-- Today's implicit links become explicit rows, defaults on. Idempotent: the
-- unique pair makes re-running a no-op.
insert into public.agency_relationships (parent_org_id, child_org_id)
select o.parent_org_id, o.id
from public.organizations o
where o.parent_org_id is not null
on conflict (parent_org_id, child_org_id) do nothing;

notify pgrst, 'reload schema';
