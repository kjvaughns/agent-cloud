-- ============================================================================
-- PHASE 1 — MULTI-TENANT ISOLATION
-- ============================================================================

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'agent',
  status text not null default 'active' check (status in ('active','invited','suspended','archived')),
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, profile_id)
);

grant select, insert, update, delete on public.organization_memberships to authenticated;
grant all on public.organization_memberships to service_role;

create index if not exists idx_org_memberships_profile on public.organization_memberships(profile_id, status);
create index if not exists idx_org_memberships_org on public.organization_memberships(organization_id, status);

-- Backfill from the existing single-org column.
insert into public.organization_memberships (organization_id, profile_id, role, status, is_primary)
select p.organization_id,
       p.id,
       coalesce((select ur.role::text from public.user_roles ur
                  where ur.user_id = p.id
                  order by case ur.role::text
                    when 'super_admin' then 1 when 'agency_owner' then 2
                    when 'admin' then 3 when 'manager' then 4
                    when 'staff' then 5 else 6 end
                  limit 1), 'agent'),
       case when p.status in ('invited') then 'invited'
            when p.status in ('terminated','inactive') then 'archived'
            else 'active' end,
       true
from public.profiles p
where p.organization_id is not null
on conflict (organization_id, profile_id) do nothing;

-- Org owners always hold an active membership in the org they own.
insert into public.organization_memberships (organization_id, profile_id, role, status, is_primary)
select o.id, o.owner_id, 'agency_owner', 'active', true
from public.organizations o
where o.owner_id is not null
on conflict (organization_id, profile_id) do update set role = 'agency_owner', status = 'active';

alter table public.organization_memberships enable row level security;

drop policy if exists org_memberships_self on public.organization_memberships;
create policy org_memberships_self on public.organization_memberships
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists org_memberships_owner on public.organization_memberships;
create policy org_memberships_owner on public.organization_memberships
  for all to authenticated
  using (organization_id in (select id from public.organizations where owner_id = auth.uid()))
  with check (organization_id in (select id from public.organizations where owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. HELPER FUNCTIONS
-- ---------------------------------------------------------------------------

create or replace function public.my_org_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select organization_id from public.organization_memberships
   where profile_id = auth.uid() and status = 'active'
$$;

create or replace function public.is_org_owner(_org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.organizations where id = _org and owner_id = auth.uid())
$$;

create or replace function public.same_org(_profile uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships a
      join public.organization_memberships b on a.organization_id = b.organization_id
     where a.profile_id = auth.uid() and a.status = 'active'
       and b.profile_id = _profile   and b.status = 'active'
  )
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles
                  where user_id = auth.uid() and role::text = 'super_admin')
$$;

grant execute on function public.my_org_ids(), public.is_org_owner(uuid),
                          public.same_org(uuid), public.is_platform_admin()
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3 + 4. ORG COLUMN, BACKFILL, INSERT TRIGGER, AND POLICY REWRITE
-- ---------------------------------------------------------------------------

create or replace function public.stamp_organization_id()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_org uuid;
begin
  if NEW.organization_id is not null then
    return NEW;
  end if;
  execute format('select ($1).%I', TG_ARGV[0]) into v_owner using NEW;
  if v_owner is null then
    return NEW;
  end if;
  select organization_id into v_org
    from public.organization_memberships
   where profile_id = v_owner and status = 'active'
   order by is_primary desc
   limit 1;
  NEW.organization_id := v_org;
  return NEW;
end $$;

DO $do$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('clients','agent_id'),
    ('contact_history','agent_id'),
    ('policies','agent_id'),
    ('agent_commission_levels','agent_id'),
    ('contract_requests','agent_id'),
    ('commission_schedule','agent_id'),
    ('recruiting_prospects','recruiter_id'),
    ('wallet','agent_id'),
    ('wallet_transactions','agent_id'),
    ('sms_conversations','agent_id'),
    ('call_logs','agent_id'),
    ('dial_lists','agent_id'),
    ('needs_analysis','agent_id'),
    ('calendar_events','agent_id'),
    ('state_licenses','agent_id'),
    ('landing_pages','agent_id'),
    ('recruiting_funnels','agent_id'),
    ('challenges','agent_id'),
    ('trophies','agent_id'),
    ('sophai_settings','agent_id'),
    ('sophai_activity','agent_id'),
    ('producer_documents','agent_id'),
    ('onboarding_documents','agent_id')
  ) AS x(tbl, col)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = rec.tbl) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = rec.tbl
                      AND column_name = rec.col) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL',
      rec.tbl);

    EXECUTE format($f$
      UPDATE public.%I t
         SET organization_id = m.organization_id
        FROM public.organization_memberships m
       WHERE m.profile_id = t.%I
         AND m.status = 'active'
         AND t.organization_id IS NULL
    $f$, rec.tbl, rec.col);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(organization_id)',
                   'idx_' || rec.tbl || '_org', rec.tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(%I)',
                   'idx_' || rec.tbl || '_' || rec.col, rec.tbl, rec.col);

    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I',
                   'trg_stamp_org_' || rec.tbl, rec.tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stamp_organization_id(%L)',
      'trg_stamp_org_' || rec.tbl, rec.tbl, rec.col);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.tbl || '_owner_select', rec.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.tbl || '_owner_modify', rec.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.tbl || '_org_select', rec.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.tbl || '_org_modify', rec.tbl);

    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (
        (
          organization_id IS NOT NULL
          AND organization_id IN (SELECT public.my_org_ids())
          AND (
            %I = auth.uid()
            OR public.is_in_downline(auth.uid(), %I)
            OR public.is_org_owner(organization_id)
          )
        )
        OR (
          organization_id IS NULL
          AND (%I = auth.uid() OR public.is_in_downline(auth.uid(), %I))
        )
      )
    $p$, rec.tbl || '_org_select', rec.tbl, rec.col, rec.col, rec.col, rec.col);

    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR ALL TO authenticated
      USING (
        (
          organization_id IS NOT NULL
          AND organization_id IN (SELECT public.my_org_ids())
          AND (%I = auth.uid() OR public.is_org_owner(organization_id))
        )
        OR (organization_id IS NULL AND %I = auth.uid())
      )
      WITH CHECK (
        (
          organization_id IS NOT NULL
          AND organization_id IN (SELECT public.my_org_ids())
          AND (%I = auth.uid() OR public.is_org_owner(organization_id))
        )
        OR (organization_id IS NULL AND %I = auth.uid())
      )
    $p$, rec.tbl || '_org_modify', rec.tbl, rec.col, rec.col, rec.col, rec.col);
  END LOOP;
END
$do$;

-- ---------------------------------------------------------------------------
-- 4d. Tables keyed on a different column, handled explicitly.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS notifications_owner_select ON public.notifications;
DROP POLICY IF EXISTS notifications_owner_modify ON public.notifications;
DROP POLICY IF EXISTS notifications_self ON public.notifications;
CREATE POLICY notifications_self ON public.notifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS invitation_links_owner_select ON public.invitation_links;
DROP POLICY IF EXISTS invitation_links_owner_modify ON public.invitation_links;
DROP POLICY IF EXISTS invitation_links_org ON public.invitation_links;
CREATE POLICY invitation_links_org ON public.invitation_links
  FOR ALL TO authenticated
  USING (
    created_by = auth.uid()
    OR (organization_id IS NOT NULL AND organization_id IN (SELECT public.my_org_ids()))
  )
  WITH CHECK (
    created_by = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_owner(organization_id))
  );

DROP POLICY IF EXISTS "beneficiaries_via_client" ON public.beneficiaries;
CREATE POLICY beneficiaries_via_client ON public.beneficiaries
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id));

DROP POLICY IF EXISTS profiles_org_visibility ON public.profiles;
CREATE POLICY profiles_org_visibility ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.same_org(id)
    OR public.is_in_downline(auth.uid(), id)
    OR public.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- 5. Keep profiles.organization_id in sync with the primary membership.
-- ---------------------------------------------------------------------------

create or replace function public.sync_profile_primary_org()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW.status = 'active' and NEW.is_primary then
    update public.profiles set organization_id = NEW.organization_id where id = NEW.profile_id;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_sync_profile_primary_org on public.organization_memberships;
create trigger trg_sync_profile_primary_org
  after insert or update on public.organization_memberships
  for each row execute function public.sync_profile_primary_org();

-- ---------------------------------------------------------------------------
-- 6. HIERARCHY SAFETY — is_in_downline
-- ---------------------------------------------------------------------------

create or replace function public.is_in_downline(_upline uuid, _target uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  with recursive downline as (
    select p.id, 1 as depth
      from public.profiles p
     where p.upline_id = _upline
       and p.id <> _upline
       and (
         (select organization_id from public.profiles where id = _upline) is null
         or p.organization_id is not distinct from
            (select organization_id from public.profiles where id = _upline)
       )
    union
    select p.id, d.depth + 1
      from public.profiles p
      join downline d on p.upline_id = d.id
     where d.depth < 50
       and p.id <> d.id
       and (
         (select organization_id from public.profiles where id = _upline) is null
         or p.organization_id is not distinct from
            (select organization_id from public.profiles where id = _upline)
       )
  )
  select _target = _upline or exists (select 1 from downline where id = _target)
$$;

grant execute on function public.is_in_downline(uuid, uuid) to authenticated;

create or replace function public.assert_upline_same_org()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  _upline_org uuid;
begin
  if NEW.upline_id is null then
    return NEW;
  end if;

  if NEW.upline_id = NEW.id then
    raise exception 'A profile cannot be its own upline (profile %)', NEW.id
      using errcode = 'check_violation';
  end if;

  select organization_id into _upline_org from public.profiles where id = NEW.upline_id;

  if NEW.organization_id is not null and _upline_org is not null
     and NEW.organization_id <> _upline_org then
    raise exception
      'upline_id % belongs to organization %, but this profile belongs to organization %. '
      'An agent hierarchy may not cross an organization boundary.',
      NEW.upline_id, _upline_org, NEW.organization_id
      using errcode = 'check_violation';
  end if;

  return NEW;
end $$;

drop trigger if exists trg_assert_upline_same_org on public.profiles;
create trigger trg_assert_upline_same_org
  before insert or update of upline_id, organization_id on public.profiles
  for each row execute function public.assert_upline_same_org();

-- ---------------------------------------------------------------------------
-- 7. DROP THE LEGACY PERMISSIVE PROFILES POLICIES
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_visible"              ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all"            ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_or_related_read" ON public.profiles;

DROP POLICY IF EXISTS profiles_org_manage ON public.profiles;
CREATE POLICY profiles_org_manage ON public.profiles
  FOR ALL TO authenticated
  USING (
    id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_owner(organization_id))
  )
  WITH CHECK (
    id = auth.uid()
    OR (organization_id IS NOT NULL AND public.is_org_owner(organization_id))
  );

-- ---------------------------------------------------------------------------
-- 8. commission_backfill_queue — RLS was never enabled.
-- ---------------------------------------------------------------------------

alter table if exists public.commission_backfill_queue enable row level security;
revoke all on public.commission_backfill_queue from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9. user_roles — multi-role support and role-administration lockdown
-- ---------------------------------------------------------------------------

alter table public.user_roles drop constraint if exists user_roles_user_id_key;
create unique index if not exists user_roles_user_role_key on public.user_roles(user_id, role);

insert into public.user_roles (user_id, role)
select ur.user_id, 'super_admin'::app_role
  from public.user_roles ur
 where ur.role::text = 'admin'
on conflict do nothing;

DROP POLICY IF EXISTS user_roles_admin_all ON public.user_roles;
CREATE POLICY user_roles_platform_admin ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS user_roles_self_read ON public.user_roles;
CREATE POLICY user_roles_self_read ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.same_org(user_id));

-- ---------------------------------------------------------------------------
-- 10. INDEXES ON THE COLUMNS EVERY POLICY FILTERS ON
-- ---------------------------------------------------------------------------

create index if not exists idx_profiles_upline           on public.profiles(upline_id);
create index if not exists idx_policies_agent            on public.policies(agent_id);
create index if not exists idx_clients_agent             on public.clients(agent_id);
create index if not exists idx_contract_requests_agent   on public.contract_requests(agent_id);
create index if not exists idx_contact_history_agent     on public.contact_history(agent_id);
create index if not exists idx_wallet_transactions_agent on public.wallet_transactions(agent_id);
create index if not exists idx_sms_conversations_agent   on public.sms_conversations(agent_id);
create index if not exists idx_call_logs_agent           on public.call_logs(agent_id);
create index if not exists idx_dial_lists_agent          on public.dial_lists(agent_id);
create index if not exists idx_state_licenses_agent      on public.state_licenses(agent_id);
create index if not exists idx_notifications_user        on public.notifications(user_id, created_at desc);
create index if not exists idx_agent_comm_levels_agent   on public.agent_commission_levels(agent_id);
create index if not exists idx_beneficiaries_client      on public.beneficiaries(client_id);
create index if not exists idx_client_financials_client  on public.client_financials(client_id);
create index if not exists idx_life_events_client        on public.life_events(client_id);
create index if not exists idx_sms_messages_conversation on public.sms_messages(conversation_id);
create index if not exists idx_dial_list_entries_list    on public.dial_list_entries(list_id);

-- ---------------------------------------------------------------------------
-- 11. announcements — scope to the organization
-- ---------------------------------------------------------------------------

alter table public.announcements add column if not exists organization_id uuid
  references public.organizations(id) on delete cascade;

update public.announcements a
   set organization_id = p.organization_id
  from public.profiles p
 where a.created_by = p.id
   and a.organization_id is null
   and p.organization_id is not null;

create index if not exists idx_announcements_org on public.announcements(organization_id, created_at desc);

DROP POLICY IF EXISTS "announcements_read" ON public.announcements;
CREATE POLICY announcements_read ON public.announcements
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR organization_id IN (SELECT public.my_org_ids()));

DROP POLICY IF EXISTS "announcements_admin_write" ON public.announcements;
CREATE POLICY announcements_org_write ON public.announcements
  FOR ALL TO authenticated
  USING (
    (organization_id IS NOT NULL AND public.is_org_owner(organization_id))
    OR public.is_platform_admin()
  )
  WITH CHECK (
    (organization_id IS NOT NULL AND public.is_org_owner(organization_id))
    OR public.is_platform_admin()
  );