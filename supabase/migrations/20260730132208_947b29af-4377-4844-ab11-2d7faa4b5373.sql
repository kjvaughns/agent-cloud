-- ============================================================================
-- PHASE 3 — TASKS, SEARCH SUPPORT, AGENCY SETUP
-- ============================================================================

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,

  title       text not null,
  description text,

  assigned_to uuid not null references public.profiles(id) on delete cascade,
  created_by  uuid references public.profiles(id) on delete set null,

  status   text not null default 'open'   check (status   in ('open','in_progress','done','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),

  due_date     date,
  completed_at timestamptz,

  related_type text check (related_type in ('client','policy','prospect','contract','ticket','agent')),
  related_id   uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;

create index if not exists idx_tasks_assignee   on public.tasks(assigned_to, status, due_date);
create index if not exists idx_tasks_org        on public.tasks(organization_id, status, due_date);
create index if not exists idx_tasks_related    on public.tasks(related_type, related_id);
create index if not exists idx_tasks_due        on public.tasks(due_date) where status in ('open','in_progress');

alter table public.tasks enable row level security;

drop policy if exists tasks_access on public.tasks;
create policy tasks_access on public.tasks
  for all to authenticated
  using (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or (organization_id is not null
        and organization_id in (select public.my_org_ids())
        and (public.is_org_owner(organization_id)
             or public.is_in_downline(auth.uid(), assigned_to)))
  )
  with check (
    assigned_to = auth.uid()
    or created_by = auth.uid()
    or (organization_id is not null
        and organization_id in (select public.my_org_ids())
        and (public.is_org_owner(organization_id)
             or public.is_in_downline(auth.uid(), assigned_to)))
  );

drop trigger if exists trg_stamp_org_tasks on public.tasks;
create trigger trg_stamp_org_tasks
  before insert on public.tasks
  for each row execute function public.stamp_organization_id('assigned_to');

create or replace function public.touch_task()
returns trigger
language plpgsql set search_path = public
as $$
begin
  NEW.updated_at := now();
  if NEW.status = 'done' and (OLD.status is distinct from 'done') then
    NEW.completed_at := now();
  elsif NEW.status <> 'done' then
    NEW.completed_at := null;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_touch_task on public.tasks;
create trigger trg_touch_task
  before update on public.tasks
  for each row execute function public.touch_task();

-- ---------------------------------------------------------------------------
-- 2. SEARCH INDEXES
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm;

create index if not exists idx_clients_first_name_trgm on public.clients  using gin (first_name gin_trgm_ops);
create index if not exists idx_clients_last_name_trgm  on public.clients  using gin (last_name  gin_trgm_ops);
create index if not exists idx_clients_email_trgm      on public.clients  using gin (email      gin_trgm_ops);
create index if not exists idx_clients_phone_trgm      on public.clients  using gin (phone      gin_trgm_ops);

create index if not exists idx_policies_number_trgm    on public.policies using gin (policy_number gin_trgm_ops);

create index if not exists idx_profiles_first_name_trgm on public.profiles using gin (first_name gin_trgm_ops);
create index if not exists idx_profiles_last_name_trgm  on public.profiles using gin (last_name  gin_trgm_ops);
create index if not exists idx_profiles_email_trgm      on public.profiles using gin (email      gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. AGENCY SETUP CHECKLIST
-- ---------------------------------------------------------------------------

create table if not exists public.organization_setup_state (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  dismissed_steps text[] not null default '{}',
  checklist_dismissed boolean not null default false,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.organization_setup_state to authenticated;
grant all on public.organization_setup_state to service_role;

alter table public.organization_setup_state enable row level security;

drop policy if exists organization_setup_state_read on public.organization_setup_state;
create policy organization_setup_state_read on public.organization_setup_state
  for select to authenticated
  using (organization_id in (select public.my_org_ids()));

drop policy if exists organization_setup_state_write on public.organization_setup_state;
create policy organization_setup_state_write on public.organization_setup_state
  for all to authenticated
  using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

insert into public.organization_setup_state (organization_id)
select id from public.organizations
on conflict (organization_id) do nothing;