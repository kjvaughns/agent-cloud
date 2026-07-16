-- Nova AI automations: notification channels + retention automations + custom automations
-- Self-sufficient: the remote DB may be missing the sophai_* tables entirely
-- (schema drift from the Lovable-managed base migration), so create them first.

-- 0a) Base table (original definition from 20260522213134) if missing.
--     agent_id UNIQUE is required by the app's upsert (onConflict: "agent_id").
create table if not exists public.sophai_settings (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null unique references public.profiles(id) on delete cascade,
  policy_recovery_enabled boolean default false,
  sms_followup_enabled boolean default false,
  birthday_messages_enabled boolean default false,
  beneficiary_engagement_enabled boolean default false
);
alter table public.sophai_settings enable row level security;

drop policy if exists sophai_settings_owner_select on public.sophai_settings;
create policy sophai_settings_owner_select on public.sophai_settings
  for select to authenticated
  using (agent_id = auth.uid() or public.is_in_downline(auth.uid(), agent_id) or public.has_role(auth.uid(), 'admin'));

drop policy if exists sophai_settings_owner_modify on public.sophai_settings;
create policy sophai_settings_owner_modify on public.sophai_settings
  for all to authenticated
  using (agent_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (agent_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- 0b) Companion audit table (same drift), original definition.
create table if not exists public.sophai_activity (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  activity_type text not null,
  outcome text,
  created_at timestamptz not null default now()
);
alter table public.sophai_activity enable row level security;

drop policy if exists sophai_activity_owner_select on public.sophai_activity;
create policy sophai_activity_owner_select on public.sophai_activity
  for select to authenticated
  using (agent_id = auth.uid() or public.is_in_downline(auth.uid(), agent_id) or public.has_role(auth.uid(), 'admin'));

drop policy if exists sophai_activity_owner_modify on public.sophai_activity;
create policy sophai_activity_owner_modify on public.sophai_activity
  for all to authenticated
  using (agent_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (agent_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- 1) New Nova columns
alter table public.sophai_settings
  add column if not exists email_notifications_enabled boolean not null default true,
  add column if not exists sms_notifications_enabled boolean not null default false,
  add column if not exists anniversary_messages_enabled boolean not null default false,
  add column if not exists lapse_followup_enabled boolean not null default false;

-- 2) Custom automations
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
