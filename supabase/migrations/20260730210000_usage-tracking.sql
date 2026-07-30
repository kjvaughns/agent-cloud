-- ============================================================================
-- USAGE TRACKING
--
-- One table, written constantly, read rarely. Its whole job is to answer one
-- question before anybody deletes anything:
--
--   "Which pages and actions does anyone actually use?"
--
-- Deliberately records no personal data. A path, an action name and a role are
-- enough to answer that question; anything more would make this a privacy
-- surface rather than a product decision tool.
-- ============================================================================

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,

  organization_id uuid references public.organizations(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  -- Denormalised so a report can group by role without joining a million rows
  -- to profiles, and so the answer survives somebody changing roles later.
  role text,
  plan_type text,

  event text not null check (event in ('page_view', 'action', 'workflow_step')),

  -- For page_view: the route path, with ids stripped (see normalise below).
  -- For action: the page the action happened on.
  path text not null,
  -- For action / workflow_step: what happened. Null on a page view.
  action text,

  -- How long the user had been on the page, or how long an action took.
  duration_ms integer check (duration_ms is null or duration_ms >= 0),

  -- Small, non-identifying context only: a step name, a count, a result.
  meta jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

-- Reports group by path and by day; these are the only two access patterns.
create index if not exists idx_usage_events_org_time
  on public.usage_events(organization_id, created_at desc);
create index if not exists idx_usage_events_path
  on public.usage_events(organization_id, path, event);
create index if not exists idx_usage_events_action
  on public.usage_events(organization_id, action) where action is not null;

grant insert on public.usage_events to authenticated;
grant select on public.usage_events to authenticated;
grant all on public.usage_events to service_role;
grant usage, select on sequence public.usage_events_id_seq to authenticated;

alter table public.usage_events enable row level security;

-- Anyone may record their own activity, and only their own. Writing an event
-- as somebody else would make every report a lie.
drop policy if exists usage_events_insert on public.usage_events;
create policy usage_events_insert on public.usage_events
  for insert to authenticated
  with check (profile_id = auth.uid());

-- Reading is an owner/admin activity. An agent has no reason to see what the
-- rest of the agency clicks on.
drop policy if exists usage_events_read on public.usage_events;
create policy usage_events_read on public.usage_events
  for select to authenticated
  using (
    public.is_platform_admin()
    or (organization_id is not null and public.is_org_admin(organization_id))
  );

-- ---------------------------------------------------------------------------
-- RETENTION
--
-- This data answers a question that expires. Ninety days is more than enough to
-- decide what to delete, and keeping behavioural logs indefinitely is a
-- liability nobody asked for.
-- ---------------------------------------------------------------------------

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
