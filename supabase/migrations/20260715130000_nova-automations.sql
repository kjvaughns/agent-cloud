-- Nova AI automations: notification channels + retention automations + custom automations
-- sophai_settings is the pre-existing per-agent toggle table (pre-Nova name).

alter table public.sophai_settings
  add column if not exists email_notifications_enabled boolean not null default true,
  add column if not exists sms_notifications_enabled boolean not null default false,
  add column if not exists anniversary_messages_enabled boolean not null default false,
  add column if not exists lapse_followup_enabled boolean not null default false;

create table if not exists public.nova_automations (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  trigger_type text not null check (trigger_type in ('birthday','policy_anniversary','beneficiary_checkin','lapse_follow_up','custom_date')),
  channel text not null default 'email' check (channel in ('email','sms','both')),
  message_template text not null,
  custom_date date,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.nova_automations enable row level security;

drop policy if exists nova_automations_own on public.nova_automations;
create policy nova_automations_own on public.nova_automations
  for all to authenticated
  using (agent_id = auth.uid())
  with check (agent_id = auth.uid());

create index if not exists idx_nova_automations_agent on public.nova_automations(agent_id);
