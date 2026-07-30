-- ============================================================================
-- PHASE 6 — AUTOMATION EXECUTION LEDGER
-- ============================================================================

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  automation_id uuid not null references public.nova_automations(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete cascade,

  subject_type text not null check (subject_type in ('client','policy','agent')),
  subject_id uuid not null,

  occurrence_key text not null,

  channel text not null check (channel in ('email','sms','in_app')),
  status  text not null default 'queued'
    check (status in ('queued','sent','skipped','failed','blocked')),

  reason text,
  rendered_message text,

  created_at timestamptz not null default now(),
  sent_at timestamptz
);

grant select on public.automation_runs to authenticated;
grant all on public.automation_runs to service_role;

create unique index if not exists idx_automation_runs_unique
  on public.automation_runs(automation_id, subject_id, occurrence_key, channel);

create index if not exists idx_automation_runs_agent
  on public.automation_runs(agent_id, created_at desc);
create index if not exists idx_automation_runs_org
  on public.automation_runs(organization_id, status, created_at desc);

alter table public.automation_runs enable row level security;

drop policy if exists automation_runs_access on public.automation_runs;
create policy automation_runs_access on public.automation_runs
  for select to authenticated
  using (
    agent_id = auth.uid()
    or (organization_id is not null
        and organization_id in (select public.my_org_ids())
        and public.is_org_owner(organization_id))
  );

drop trigger if exists trg_stamp_org_automation_runs on public.automation_runs;
create trigger trg_stamp_org_automation_runs
  before insert on public.automation_runs
  for each row execute function public.stamp_organization_id('agent_id');

-- Org-scope nova_automations
alter table public.nova_automations
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists last_run_at timestamptz;

update public.nova_automations a
   set organization_id = p.organization_id
  from public.profiles p
 where a.agent_id = p.id
   and a.organization_id is null
   and p.organization_id is not null;

create index if not exists idx_nova_automations_org
  on public.nova_automations(organization_id, enabled);

drop trigger if exists trg_stamp_org_nova_automations on public.nova_automations;
create trigger trg_stamp_org_nova_automations
  before insert on public.nova_automations
  for each row execute function public.stamp_organization_id('agent_id');