-- ============================================================================
-- USAGE TRACKING
-- ============================================================================

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  role text,
  plan_type text,
  event text not null check (event in ('page_view', 'action', 'workflow_step')),
  path text not null,
  action text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_usage_events_org_time
  on public.usage_events(organization_id, created_at desc);
create index if not exists idx_usage_events_path
  on public.usage_events(organization_id, path, event);
create index if not exists idx_usage_events_action
  on public.usage_events(organization_id, action) where action is not null;

grant insert on public.usage_events to authenticated;
grant select on public.usage_events to authenticated;
grant all on public.usage_events to service_role;

alter table public.usage_events enable row level security;

drop policy if exists usage_events_insert on public.usage_events;
create policy usage_events_insert on public.usage_events
  for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists usage_events_read on public.usage_events;
create policy usage_events_read on public.usage_events
  for select to authenticated
  using (
    public.is_platform_admin()
    or (organization_id is not null and public.is_org_admin(organization_id))
  );

create or replace function public.prune_usage_events()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.usage_events where created_at < now() - interval '90 days';
  get diagnostics removed = row_count;
  return removed;
end
$$;

comment on table public.usage_events is
  'Product usage, for deciding what to simplify or remove. No personal data. Pruned at 90 days.';

-- ============================================================================
-- STARRED PAGES
-- ============================================================================

create table if not exists public.user_page_favorites (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  page_id    text not null check (char_length(page_id) between 1 and 64),
  created_at timestamptz not null default now(),
  primary key (profile_id, page_id)
);

grant select, insert, update, delete on public.user_page_favorites to authenticated;
grant all on public.user_page_favorites to service_role;

alter table public.user_page_favorites enable row level security;

drop policy if exists user_page_favorites_own on public.user_page_favorites;
create policy user_page_favorites_own on public.user_page_favorites
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create index if not exists idx_user_page_favorites_profile
  on public.user_page_favorites(profile_id);