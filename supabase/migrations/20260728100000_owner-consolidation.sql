-- ============================================================================
-- OWNER CONSOLIDATION
--
--   * Make kjvaughns13@gmail.com super_admin AND agency_owner.
--   * Make that account the owner_id of the agency org(s).
--   * Move everything belonging to info@kingofsales.net across, then remove it.
--
-- READ THIS BEFORE RUNNING
--
--   profiles is referenced with ON DELETE CASCADE by clients, policies,
--   commission_schedule, contract_requests, wallet, sms_conversations,
--   call_logs, state_licenses and others. Deleting the account outright would
--   permanently destroy every one of those rows — the book of business, not
--   just the login.
--
--   Section 3 therefore REASSIGNS that data to kjvaughns13@gmail.com before
--   section 4 deletes the account. Run the whole file in order. If you would
--   rather keep the login and only move the data, run 1–3 and skip 4.
--
--   Run section 0 first on its own and read the output, so you know what is
--   about to move.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. INVENTORY — run this first, by itself, and look at the numbers.
-- ---------------------------------------------------------------------------

do $do$
declare
  _keep uuid;
  _drop uuid;
  _n bigint;
begin
  select id into _keep from auth.users where lower(email) = 'kjvaughns13@gmail.com';
  select id into _drop from auth.users where lower(email) = 'info@kingofsales.net';

  raise notice 'keep (kjvaughns13@gmail.com) = %', coalesce(_keep::text, 'NOT FOUND');
  raise notice 'drop (info@kingofsales.net)  = %', coalesce(_drop::text, 'NOT FOUND');

  if _drop is null then
    raise notice 'Nothing to move — that account does not exist.';
    return;
  end if;

  execute 'select count(*) from public.clients where agent_id = $1' into _n using _drop;
  raise notice '  clients:             %', _n;
  execute 'select count(*) from public.policies where agent_id = $1' into _n using _drop;
  raise notice '  policies:            %', _n;
  execute 'select count(*) from public.commission_schedule where agent_id = $1' into _n using _drop;
  raise notice '  commission rows:     %', _n;
  execute 'select count(*) from public.contract_requests where agent_id = $1' into _n using _drop;
  raise notice '  contract requests:   %', _n;
  execute 'select count(*) from public.profiles where upline_id = $1' into _n using _drop;
  raise notice '  downline agents:     %', _n;
  execute 'select count(*) from public.organizations where owner_id = $1' into _n using _drop;
  raise notice '  organizations owned: %', _n;
end
$do$;

-- ---------------------------------------------------------------------------
-- 1. ROLES for kjvaughns13@gmail.com
--
--    user_roles carried UNIQUE(user_id) (20260604200000), which is why the
--    original super_admin grants silently no-op'd on ON CONFLICT DO NOTHING
--    and nobody ended up holding it. Replacing it with UNIQUE(user_id, role)
--    lets one account hold both super_admin and agency_owner, which is what
--    the app already expects.
-- ---------------------------------------------------------------------------

alter table public.user_roles drop constraint if exists user_roles_user_id_key;
create unique index if not exists user_roles_user_role_key on public.user_roles(user_id, role);

insert into public.user_roles (user_id, role)
select u.id, r.role
  from auth.users u
 cross join (values ('super_admin'::app_role), ('agency_owner'::app_role), ('admin'::app_role)) as r(role)
 where lower(u.email) = 'kjvaughns13@gmail.com'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. ORG OWNERSHIP
--
--    This is also what makes the Team > Roles & Permissions tab resolve:
--    the app checks organizations.owner_id.
-- ---------------------------------------------------------------------------

do $do$
declare
  _keep uuid;
  _drop uuid;
  _org  uuid;
begin
  select id into _keep from auth.users where lower(email) = 'kjvaughns13@gmail.com';
  if _keep is null then
    raise exception 'kjvaughns13@gmail.com not found — nothing to promote.';
  end if;

  select id into _drop from auth.users where lower(email) = 'info@kingofsales.net';

  -- Hand over any org the other account owns.
  if _drop is not null then
    update public.organizations set owner_id = _keep where owner_id = _drop;
  end if;

  -- Make sure the account is attached to an organization and owns it.
  select organization_id into _org from public.profiles where id = _keep;

  if _org is null then
    -- Fall back to the org it already owns, else the only org present.
    select id into _org from public.organizations where owner_id = _keep limit 1;
    if _org is null then
      select id into _org from public.organizations order by created_at limit 1;
    end if;
    if _org is not null then
      update public.profiles set organization_id = _org where id = _keep;
    end if;
  end if;

  if _org is not null then
    update public.organizations set owner_id = _keep where id = _org;
    raise notice 'kjvaughns13@gmail.com now owns organization %', _org;
  else
    raise notice 'No organization exists yet — create one, then re-run section 2.';
  end if;
end
$do$;

-- ---------------------------------------------------------------------------
-- 3. MOVE EVERYTHING OFF info@kingofsales.net
--
--    Every table below would otherwise be cascade-deleted in section 4. This
--    is the step that makes the deletion safe.
-- ---------------------------------------------------------------------------

do $do$
declare
  _keep uuid;
  _drop uuid;
  rec   record;
  _sql  text;
begin
  select id into _keep from auth.users where lower(email) = 'kjvaughns13@gmail.com';
  select id into _drop from auth.users where lower(email) = 'info@kingofsales.net';
  if _drop is null or _keep is null then
    raise notice 'Skipping reassignment — one of the accounts is missing.';
    return;
  end if;

  -- Re-parent the downline first, so nobody is orphaned by the delete.
  update public.profiles set upline_id = _keep where upline_id = _drop;

  -- Every (table, owner column) pair that cascades from profiles, guarded by
  -- an existence check so this runs on databases at any migration point.
  for rec in
    select * from (values
      ('clients','agent_id'), ('policies','agent_id'), ('commission_schedule','agent_id'),
      ('contract_requests','agent_id'), ('agent_commission_levels','agent_id'),
      ('contact_history','agent_id'), ('wallet','agent_id'), ('wallet_transactions','agent_id'),
      ('sms_conversations','agent_id'), ('call_logs','agent_id'), ('dial_lists','agent_id'),
      ('needs_analysis','agent_id'), ('calendar_events','agent_id'),
      ('state_licenses','agent_id'), ('landing_pages','agent_id'),
      ('recruiting_funnels','agent_id'), ('challenges','agent_id'), ('trophies','agent_id'),
      ('producer_documents','agent_id'), ('onboarding_documents','agent_id'),
      ('change_requests','agent_id'), ('surelc_progress','agent_id'),
      ('transfer_requests','agent_id'), ('recruiting_prospects','recruiter_id'),
      ('invitation_links','created_by'), ('notifications','user_id')
    ) as t(tbl, col)
  loop
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = rec.tbl and column_name = rec.col
    ) then
      _sql := format('update public.%I set %I = $1 where %I = $2', rec.tbl, rec.col, rec.col);
      execute _sql using _keep, _drop;
    end if;
  end loop;

  raise notice 'Reassigned records from info@kingofsales.net to kjvaughns13@gmail.com';
end
$do$;

-- ---------------------------------------------------------------------------
-- 4. REMOVE info@kingofsales.net
--
--    Only safe once section 3 has run. Deleting the auth user cascades to
--    profiles and to anything still pointing at it.
--
--    To keep the login and only move the data, stop here.
-- ---------------------------------------------------------------------------

do $do$
declare
  _drop uuid;
begin
  select id into _drop from auth.users where lower(email) = 'info@kingofsales.net';
  if _drop is null then
    raise notice 'info@kingofsales.net already gone.';
    return;
  end if;

  delete from public.user_roles where user_id = _drop;
  delete from public.profiles   where id      = _drop;
  delete from auth.users        where id      = _drop;

  raise notice 'Deleted info@kingofsales.net';
end
$do$;

-- ---------------------------------------------------------------------------
-- 5. VERIFY
-- ---------------------------------------------------------------------------

select u.email,
       array_agg(ur.role::text order by ur.role::text) as roles,
       p.organization_id,
       (select count(*) from public.organizations o where o.owner_id = u.id) as orgs_owned
  from auth.users u
  left join public.user_roles ur on ur.user_id = u.id
  left join public.profiles   p  on p.id       = u.id
 where lower(u.email) in ('kjvaughns13@gmail.com', 'info@kingofsales.net')
 group by u.email, p.organization_id, u.id;
