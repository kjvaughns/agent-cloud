-- ============================================================================
-- PHASE 5 — NOTIFICATION PREFERENCES AND EXPORT AUDITING
-- ============================================================================

create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,

  email_enabled boolean not null default true,
  sms_enabled   boolean not null default false,

  notify_task_assigned      boolean not null default true,
  notify_policy_at_risk     boolean not null default true,
  notify_commission_posted  boolean not null default true,
  notify_contract_updates   boolean not null default true,
  notify_team_activity      boolean not null default false,
  notify_announcements      boolean not null default true,
  notify_billing            boolean not null default true,

  quiet_hours_start smallint check (quiet_hours_start between 0 and 23),
  quiet_hours_end   smallint check (quiet_hours_end   between 0 and 23),
  timezone text,

  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;

alter table public.notification_preferences enable row level security;

drop policy if exists notification_preferences_self on public.notification_preferences;
create policy notification_preferences_self on public.notification_preferences
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. EXPORT LOG
-- ---------------------------------------------------------------------------

create table if not exists public.export_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  performed_by uuid references public.profiles(id) on delete set null,
  export_type text not null,
  row_count integer not null default 0,
  filters jsonb,
  created_at timestamptz not null default now()
);

grant select on public.export_log to authenticated;
grant all on public.export_log to service_role;

create index if not exists idx_export_log_org
  on public.export_log(organization_id, created_at desc);

alter table public.export_log enable row level security;

drop policy if exists export_log_owner_read on public.export_log;
create policy export_log_owner_read on public.export_log
  for select to authenticated
  using (
    organization_id is not null
    and organization_id in (select public.my_org_ids())
    and public.is_org_owner(organization_id)
  );

-- ---------------------------------------------------------------------------
-- 3. Notification gate helper
-- ---------------------------------------------------------------------------

create or replace function public.may_notify(_profile uuid, _category text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  _row public.notification_preferences%rowtype;
begin
  select * into _row from public.notification_preferences where profile_id = _profile;

  if not found then
    return _category in ('task_assigned','policy_at_risk','commission_posted',
                         'contract_updates','announcements','billing');
  end if;

  if not _row.email_enabled then
    return false;
  end if;

  return case _category
    when 'task_assigned'     then _row.notify_task_assigned
    when 'policy_at_risk'    then _row.notify_policy_at_risk
    when 'commission_posted' then _row.notify_commission_posted
    when 'contract_updates'  then _row.notify_contract_updates
    when 'team_activity'     then _row.notify_team_activity
    when 'announcements'     then _row.notify_announcements
    when 'billing'           then _row.notify_billing
    else false
  end;
end $$;

grant execute on function public.may_notify(uuid, text) to authenticated;