update public.announcements a
   set organization_id = p.organization_id
  from public.profiles p
 where a.created_by = p.id
   and a.organization_id is null
   and p.organization_id is not null;

drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements
  for select to authenticated
  using (organization_id in (select public.my_org_ids()));

alter table public.announcements
  add column if not exists audience text not null default 'agency',
  add column if not exists announcement_group_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'announcements_audience_check'
  ) then
    alter table public.announcements
      add constraint announcements_audience_check
      check (audience in ('agency', 'agency_and_subs'));
  end if;
end $$;

create index if not exists idx_announcements_group
  on public.announcements(announcement_group_id)
  where announcement_group_id is not null;

create table if not exists public.announcement_deliveries (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email', 'discord')),
  status text not null default 'sent' check (status in ('sent', 'failed', 'skipped')),
  target text,
  error text,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.announcement_deliveries to authenticated;
grant all on public.announcement_deliveries to service_role;

create index if not exists idx_announcement_deliveries_announcement
  on public.announcement_deliveries(announcement_id, created_at desc);

alter table public.announcement_deliveries enable row level security;

drop policy if exists announcement_deliveries_read on public.announcement_deliveries;
create policy announcement_deliveries_read on public.announcement_deliveries
  for select to authenticated
  using (organization_id in (select public.my_org_ids()));

drop policy if exists announcement_deliveries_write on public.announcement_deliveries;
create policy announcement_deliveries_write on public.announcement_deliveries
  for all to authenticated
  using (
    (organization_id is not null and public.is_org_owner(organization_id))
    or public.is_platform_admin()
  );

notify pgrst, 'reload schema';