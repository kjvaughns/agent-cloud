-- ============================================================================
-- PHASE 5 — NOTIFICATION PREFERENCES AND EXPORT AUDITING
--
--   1. notification_preferences — per-user delivery choices. Org-level
--      switches landed in Phase 2; this is the individual layer beneath them.
--      A message sends only when BOTH the organization has enabled the channel
--      and the recipient has not opted out.
--   2. export_log — exporting a book of business is a data-egress event and
--      should leave a trail.
--
-- Run after 20260721100000_phase4-retention-reconciliation.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. NOTIFICATION PREFERENCES
-- ---------------------------------------------------------------------------

create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,

  -- Channels. In-app is always on; it is the notification centre itself.
  email_enabled boolean not null default true,
  sms_enabled   boolean not null default false,

  -- Categories.
  notify_task_assigned      boolean not null default true,
  notify_policy_at_risk     boolean not null default true,
  notify_commission_posted  boolean not null default true,
  notify_contract_updates   boolean not null default true,
  notify_team_activity      boolean not null default false,
  notify_announcements      boolean not null default true,
  notify_billing            boolean not null default true,

  -- Quiet hours, in the user's local timezone. Null means no quiet hours.
  quiet_hours_start smallint check (quiet_hours_start between 0 and 23),
  quiet_hours_end   smallint check (quiet_hours_end   between 0 and 23),
  timezone text,

  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

-- Strictly personal. Nobody edits anyone else's delivery preferences.
drop policy if exists notification_preferences_self on public.notification_preferences;
create policy notification_preferences_self on public.notification_preferences
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. EXPORT LOG
--
--    An export moves customer data out of the platform. Recording who took
--    what, and how much of it, is the minimum needed to answer that question
--    later.
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

create index if not exists idx_export_log_org
  on public.export_log(organization_id, created_at desc);

alter table public.export_log enable row level security;

-- Org owners can review their agency's export history. Writes are service-role
-- only, so a user cannot forge or suppress their own entry.
drop policy if exists export_log_owner_read on public.export_log;
create policy export_log_owner_read on public.export_log
  for select to authenticated
  using (
    organization_id is not null
    and organization_id in (select public.my_org_ids())
    and public.is_org_owner(organization_id)
  );

-- ---------------------------------------------------------------------------
-- 3. Gate helper: may this notification actually be delivered?
--
--    Both layers must agree. The org switch is the opt-in; the personal switch
--    is the opt-out. Absence of a preferences row means "use the defaults",
--    not "send everything".
-- ---------------------------------------------------------------------------

create or replace function public.may_notify(_profile uuid, _category text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  _row public.notification_preferences%rowtype;
begin
  select * into _row from public.notification_preferences where profile_id = _profile;

  -- No row yet: fall back to the column defaults by inspecting nothing and
  -- allowing the categories that default to true.
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
