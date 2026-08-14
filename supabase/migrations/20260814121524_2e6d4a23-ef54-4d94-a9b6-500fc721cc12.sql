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

-- A child's admins may see their own row and nothing more.
drop policy if exists agency_relationships_child_read on public.agency_relationships;
create policy agency_relationships_child_read on public.agency_relationships for select using (
  public.is_org_admin(child_org_id)
);

create index if not exists idx_agency_relationships_parent on public.agency_relationships(parent_org_id, status);
create index if not exists idx_agency_relationships_child on public.agency_relationships(child_org_id);

insert into public.agency_relationships (parent_org_id, child_org_id)
select o.parent_org_id, o.id
from public.organizations o
where o.parent_org_id is not null
on conflict (parent_org_id, child_org_id) do nothing;

notify pgrst, 'reload schema';