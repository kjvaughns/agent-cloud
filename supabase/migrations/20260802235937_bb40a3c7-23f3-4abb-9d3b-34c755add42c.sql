-- 1. commission grids org-scoped uniqueness
delete from public.commission_grids a
 using public.commission_grids b
 where a.carrier_id = b.carrier_id
   and a.product_name = b.product_name
   and a.level_name = b.level_name
   and coalesce(a.organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
     = coalesce(b.organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
   and coalesce(a.age_group_min, -1) = coalesce(b.age_group_min, -1)
   and a.id < b.id;

alter table public.commission_grids
  drop constraint if exists commission_grids_unique_row;

create unique index if not exists commission_grids_org_row_uniq
  on public.commission_grids (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    carrier_id,
    product_name,
    level_name,
    coalesce(age_group_min, -1)
  );

comment on index public.commission_grids_org_row_uniq is
  'One rate per organization, carrier, product, level and age band. The zero UUID stands in for the shared default set so NULL organizations compare equal to each other rather than to nothing.';

-- 2. backfill org carrier links
insert into public.org_carriers (organization_id, carrier_id, status, created_by)
select c.owner_organization_id, c.id, 'active', c.created_by
  from public.carriers c
 where c.is_private
   and c.owner_organization_id is not null
on conflict (organization_id, carrier_id) do nothing;

insert into public.org_carriers (organization_id, carrier_id, status)
select distinct cr.organization_id, cr.carrier_id, 'active'
  from public.contract_requests cr
 where cr.organization_id is not null
   and cr.carrier_id is not null
on conflict (organization_id, carrier_id) do nothing;

insert into public.org_carriers (organization_id, carrier_id, status)
select distinct g.organization_id, g.carrier_id, 'active'
  from public.commission_grids g
 where g.organization_id is not null
   and g.carrier_id is not null
on conflict (organization_id, carrier_id) do nothing;

-- 3. commission level requests can be resolved
alter table public.commission_level_requests
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.profiles(id) on delete set null;

drop policy if exists "upline_read" on public.commission_level_requests;
drop policy if exists commission_level_requests_read on public.commission_level_requests;
drop policy if exists commission_level_requests_decide on public.commission_level_requests;

create policy commission_level_requests_read on public.commission_level_requests
  for select to authenticated
  using (
    agent_id = auth.uid()
    or public.is_in_downline(auth.uid(), agent_id)
    or public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'agency_owner'::public.app_role)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

create policy commission_level_requests_decide on public.commission_level_requests
  for update to authenticated
  using (
    public.is_in_downline(auth.uid(), agent_id)
    or public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'agency_owner'::public.app_role)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  with check (
    public.is_in_downline(auth.uid(), agent_id)
    or public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'agency_owner'::public.app_role)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

create index if not exists idx_commission_level_requests_pending
  on public.commission_level_requests(agent_id, status)
  where status = 'pending';

-- 4. deal notification wording
CREATE OR REPLACE FUNCTION public.policy_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_client_name text;
  v_carrier_name text;
  v_monthly numeric;
BEGIN
  SELECT first_name || ' ' || last_name INTO v_client_name FROM public.clients WHERE id = NEW.client_id;
  SELECT name INTO v_carrier_name FROM public.carriers WHERE id = NEW.carrier_id;
  v_monthly := NEW.monthly_premium;
  IF NEW.effective_date IS NOT NULL THEN
    INSERT INTO public.calendar_events
      (agent_id, client_id, policy_id, title, event_type, start_at, all_day, is_auto_generated, color, notes)
    VALUES (
      NEW.agent_id, NEW.client_id, NEW.id,
      '📋 Policy Starting Soon — ' || COALESCE(v_client_name, 'client'),
      'policy_starting_soon',
      (NEW.effective_date - interval '30 days')::timestamptz,
      true, true, '#10b981',
      COALESCE(v_carrier_name,'') || CASE WHEN v_monthly IS NOT NULL THEN ' — $' || to_char(v_monthly,'FM999990.00') || '/month' ELSE '' END
    );
  END IF;
  INSERT INTO public.notifications (user_id, title, description, type)
  VALUES (
    NEW.agent_id,
    'New Deal Posted',
    CASE
      WHEN v_carrier_name IS NOT NULL THEN
        COALESCE(v_client_name, 'A client') || ' — ' || v_carrier_name || ' policy submitted.'
      ELSE
        COALESCE(v_client_name, 'A client') || ' — new policy submitted.'
    END,
    'deal'
  );
  RETURN NEW;
END $$;

-- 5. writing numbers authoritative
alter table public.writing_numbers drop constraint if exists writing_numbers_source_check;
alter table public.writing_numbers add constraint writing_numbers_source_check
  check (source in (
    'manual_entry','carrier_confirmation','import','request_outcome',
    'external_api','self_reported','legacy_backfill'
  ));

drop policy if exists writing_numbers_own on public.writing_numbers;
create policy writing_numbers_own on public.writing_numbers
  for all to authenticated
  using (agent_id = auth.uid() and source = 'self_reported')
  with check (agent_id = auth.uid() and source = 'self_reported');

insert into public.org_carriers (organization_id, carrier_id, status)
select distinct
  coalesce(src.organization_id, p.organization_id) as organization_id,
  src.carrier_id,
  'active'
from (
  select agent_id, carrier_id, organization_id
    from public.contract_requests
   where writing_number is not null and btrim(writing_number) <> ''
  union all
  select agent_id, carrier_id, organization_id
    from public.agent_commission_levels
   where writing_number is not null and btrim(writing_number) <> ''
) src
join public.profiles p on p.id = src.agent_id
where coalesce(src.organization_id, p.organization_id) is not null
  and not exists (
    select 1 from public.org_carriers oc
     where oc.organization_id = coalesce(src.organization_id, p.organization_id)
       and oc.carrier_id = src.carrier_id
  );

insert into public.writing_numbers (
  organization_id, agent_id, org_carrier_id, writing_number,
  number_type, scope, status, source, notes
)
select distinct on (src.agent_id, src.carrier_id, btrim(src.writing_number))
  oc.organization_id,
  src.agent_id,
  oc.id,
  btrim(src.writing_number),
  'individual',
  'national',
  'active',
  'legacy_backfill',
  'Backfilled from ' || src.origin || '.'
from (
  select agent_id, carrier_id, organization_id, writing_number,
         'contract_requests.writing_number' as origin, 1 as pref
    from public.contract_requests
   where writing_number is not null and btrim(writing_number) <> ''
  union all
  select agent_id, carrier_id, organization_id, writing_number,
         'agent_commission_levels.writing_number' as origin, 2 as pref
    from public.agent_commission_levels
   where writing_number is not null and btrim(writing_number) <> ''
) src
join public.profiles p on p.id = src.agent_id
join public.org_carriers oc
  on oc.organization_id = coalesce(src.organization_id, p.organization_id)
 and oc.carrier_id = src.carrier_id
order by src.agent_id, src.carrier_id, btrim(src.writing_number), src.pref
on conflict do nothing;

comment on column public.contract_requests.writing_number is
  'DEPRECATED as of 2026-08-02. public.writing_numbers is authoritative. Backfilled by 20260802220000. Retained so code deployed before that migration keeps working; read writing_numbers instead.';
comment on column public.agent_commission_levels.writing_number is
  'DEPRECATED as of 2026-08-02. public.writing_numbers is authoritative. Backfilled by 20260802220000. Retained so code deployed before that migration keeps working; read writing_numbers instead.';

-- 6. producer document vocabulary
update public.producer_documents d
   set doc_type = 'background_questionnaire'
 where d.doc_type = 'background_check'
   and not exists (
     select 1 from public.producer_documents o
      where o.agent_id = d.agent_id
        and o.doc_type = 'background_questionnaire'
   );

update public.producer_documents d
   set doc_type = 'other_document'
 where d.doc_type = 'other'
   and not exists (
     select 1 from public.producer_documents o
      where o.agent_id = d.agent_id
        and o.doc_type = 'other_document'
   );

update public.producer_documents d
   set doc_type = 'background_check_superseded',
       review_status = 'superseded'
 where d.doc_type = 'background_check';

update public.producer_documents d
   set doc_type = 'other_superseded',
       review_status = 'superseded'
 where d.doc_type = 'other';

-- 7. agent status revocation
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in (
    'not_activated','pending','active','hidden',
    'inactive','terminated','imported'
  ));

create or replace function public.assert_status_not_self_set()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return NEW; end if;
  if auth.uid() is distinct from NEW.id then return NEW; end if;
  if OLD.status is not distinct from NEW.status
     and OLD.terminated_at is not distinct from NEW.terminated_at then
    return NEW;
  end if;
  if OLD.status in ('inactive','terminated')
     or NEW.status in ('inactive','terminated') then
    raise exception
      'Your account status is set by your agency and cannot be changed here.'
      using errcode = 'insufficient_privilege';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_assert_status_not_self_set on public.profiles;
create trigger trg_assert_status_not_self_set
  before update of status, terminated_at on public.profiles
  for each row execute function public.assert_status_not_self_set();

create or replace function public.caller_is_active()
returns boolean
language sql stable security definer set search_path = public
as $$
  select not exists (
    select 1 from public.profiles
     where id = auth.uid()
       and status in ('inactive','terminated')
  )
$$;

grant execute on function public.caller_is_active() to authenticated;

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
  select case
    when exists (
      select 1 from public.profiles
       where id = _upline and status in ('inactive','terminated')
    ) then false
    else _target = _upline or exists (select 1 from downline where id = _target)
  end
$$;

create or replace function public.get_team_downline()
returns table(id uuid, first_name text, last_name text, email text, phone text,
              upline_id uuid, status text, last_active_at timestamptz,
              created_at timestamptz, depth_level integer, contracts_count integer,
              policies_count integer, premium_total numeric, completion_pct integer,
              missing jsonb)
language sql stable security definer set search_path = public
as $$
  WITH RECURSIVE dl AS (
    SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.upline_id,
           p.status, p.last_active_at, p.created_at, 1 AS depth_level
    FROM public.profiles p
    WHERE p.upline_id = auth.uid() AND public.caller_is_active()
    UNION ALL
    SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.upline_id,
           p.status, p.last_active_at, p.created_at, d.depth_level + 1
    FROM public.profiles p JOIN dl d ON p.upline_id = d.id
  )
  SELECT d.id, d.first_name, d.last_name, d.email, d.phone, d.upline_id,
         d.status, d.last_active_at, d.created_at, d.depth_level,
         COALESCE((SELECT COUNT(*)::int FROM public.agent_commission_levels WHERE agent_id = d.id), 0),
         COALESCE((SELECT COUNT(*)::int FROM public.policies WHERE agent_id = d.id), 0),
         COALESCE((SELECT SUM(annual_premium) FROM public.policies WHERE agent_id = d.id), 0),
         COALESCE((public.agent_completion(d.id)->>'pct')::int, 0),
         COALESCE(public.agent_completion(d.id)->'missing', '[]'::jsonb)
  FROM dl d
  ORDER BY d.depth_level, d.first_name;
$$;

create or replace function public.get_team_kpis()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
DECLARE result jsonb;
BEGIN
  IF NOT public.caller_is_active() THEN RETURN '{}'::jsonb; END IF;

  WITH RECURSIVE dl AS (
    SELECT id, 1 AS depth_level FROM public.profiles WHERE upline_id = auth.uid()
    UNION ALL
    SELECT p.id, d.depth_level + 1 FROM public.profiles p JOIN dl d ON p.upline_id = d.id
  ),
  base AS (SELECT * FROM dl)
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM base),
    'direct', (SELECT COUNT(*) FROM base WHERE depth_level = 1),
    'active', (SELECT COUNT(*) FROM public.profiles WHERE id IN (SELECT id FROM base) AND status = 'active'),
    'pending', (SELECT COUNT(*) FROM public.profiles WHERE id IN (SELECT id FROM base) AND status = 'pending'),
    'active_writers', (SELECT COUNT(DISTINCT agent_id) FROM public.policies WHERE agent_id IN (SELECT id FROM base) AND posted_at > now() - interval '30 days'),
    'contracts_total', (SELECT COUNT(*) FROM public.agent_commission_levels WHERE agent_id IN (SELECT id FROM base)),
    'contracts_active_pct', (
      SELECT CASE WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE p.status = 'active') / COUNT(*))
      END FROM public.agent_commission_levels acl
      JOIN public.profiles p ON p.id = acl.agent_id
      WHERE acl.agent_id IN (SELECT id FROM base)
    ),
    'max_depth', COALESCE((SELECT MAX(depth_level) FROM base), 0),
    'depth_distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('level', depth_level, 'count', cnt) ORDER BY depth_level)
      FROM (SELECT depth_level, COUNT(*) AS cnt FROM base GROUP BY depth_level) s
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

create or replace function public.get_team_alerts()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
DECLARE result jsonb;
BEGIN
  IF NOT public.caller_is_active() THEN RETURN '{}'::jsonb; END IF;

  WITH RECURSIVE dl AS (
    SELECT id FROM public.profiles WHERE upline_id = auth.uid()
    UNION ALL SELECT p.id FROM public.profiles p JOIN dl d ON p.upline_id = d.id
  )
  SELECT jsonb_build_object(
    'stale', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', first_name || ' ' || last_name))
                       FROM public.profiles WHERE id IN (SELECT id FROM dl)
                         AND (last_active_at IS NULL OR last_active_at < now() - interval '14 days')), '[]'::jsonb),
    'lapse', COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('id', pr.id, 'name', pr.first_name || ' ' || pr.last_name))
                       FROM public.policies pol JOIN public.profiles pr ON pr.id = pol.agent_id
                       WHERE pol.agent_id IN (SELECT id FROM dl) AND pol.status::text = 'lapse_pending'), '[]'::jsonb),
    'stuck_contracts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', cr.id, 'agent', pr.first_name || ' ' || pr.last_name))
                       FROM public.contract_requests cr JOIN public.profiles pr ON pr.id = cr.agent_id
                       WHERE cr.agent_id IN (SELECT id FROM dl) AND cr.status::text = 'issue'
                         AND cr.requested_at < now() - interval '7 days'), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

create or replace function public.get_team_leaderboard(_start timestamptz, _end timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
DECLARE
  v_uid uuid := auth.uid();
  v_prior_start timestamptz := _start - (_end - _start);
  result jsonb;
BEGIN
  IF NOT public.caller_is_active() THEN RETURN '{}'::jsonb; END IF;

  WITH RECURSIVE team AS (
    SELECT v_uid AS id UNION ALL
    SELECT p.id FROM public.profiles p JOIN team t ON p.upline_id = t.id
  ),
  cur AS (
    SELECT agent_id, COUNT(*) AS policies, COALESCE(SUM(annual_premium),0) AS premium, COALESCE(AVG(annual_premium),0) AS avg_deal
    FROM public.policies WHERE agent_id IN (SELECT id FROM team) AND posted_at >= _start AND posted_at < _end
    GROUP BY agent_id
  ),
  prev AS (
    SELECT agent_id, COALESCE(SUM(annual_premium),0) AS premium
    FROM public.policies WHERE agent_id IN (SELECT id FROM team) AND posted_at >= v_prior_start AND posted_at < _start
    GROUP BY agent_id
  ),
  joined AS (
    SELECT p.id, p.first_name, p.last_name,
      COALESCE(c.policies,0) AS policies,
      COALESCE(c.premium,0) AS premium,
      COALESCE(c.avg_deal,0) AS avg_deal,
      COALESCE(c.premium,0) - COALESCE(pr.premium,0) AS premium_change
    FROM public.profiles p
    LEFT JOIN cur c ON c.agent_id = p.id
    LEFT JOIN prev pr ON pr.agent_id = p.id
    WHERE p.id IN (SELECT id FROM team)
    ORDER BY premium DESC
  ),
  monthly AS (
    SELECT to_char(date_trunc('month', now()) - (i || ' months')::interval, 'YYYY-MM') AS month,
           date_trunc('month', now()) - (i || ' months')::interval AS m_start
    FROM generate_series(0,5) i
  ),
  team_monthly AS (
    SELECT m.month, pol.agent_id, p.first_name || ' ' || p.last_name AS agent_name, COALESCE(SUM(pol.annual_premium),0) AS premium
    FROM monthly m
    LEFT JOIN public.policies pol ON pol.posted_at >= m.m_start AND pol.posted_at < m.m_start + interval '1 month' AND pol.agent_id IN (SELECT id FROM team)
    LEFT JOIN public.profiles p ON p.id = pol.agent_id
    GROUP BY m.month, m.m_start, pol.agent_id, p.first_name, p.last_name
    ORDER BY m.m_start
  )
  SELECT jsonb_build_object(
    'self_id', v_uid,
    'rows', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', first_name || ' ' || last_name, 'policies', policies, 'premium', premium, 'avg_deal', avg_deal, 'trend', CASE WHEN premium_change > 0 THEN 'up' WHEN premium_change < 0 THEN 'down' ELSE 'flat' END)) FROM joined), '[]'::jsonb),
    'team_monthly', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', month, 'agent_id', agent_id, 'agent_name', agent_name, 'premium', premium)) FROM team_monthly WHERE agent_id IS NOT NULL), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;

create or replace function public.sync_membership_from_profile()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_status text;
begin
  if NEW.organization_id is null then
    return NEW;
  end if;

  v_status := case
    when NEW.status = 'invited' then 'invited'
    when NEW.status = 'inactive' then 'suspended'
    when NEW.status = 'terminated' then 'archived'
    else 'active'
  end;

  insert into public.organization_memberships
    (organization_id, profile_id, role, status, is_primary)
  values (
    NEW.organization_id,
    NEW.id,
    coalesce((select ur.role::text from public.user_roles ur
               where ur.user_id = NEW.id
               order by case ur.role::text
                 when 'super_admin' then 1 when 'agency_owner' then 2
                 when 'admin' then 3 when 'manager' then 4
                 when 'staff' then 5 else 6 end
               limit 1), 'agent'),
    v_status,
    true
  )
  on conflict (organization_id, profile_id)
    do update set status = excluded.status
     where public.organization_memberships.status is distinct from excluded.status;

  return NEW;
end $$;

drop trigger if exists trg_sync_membership_from_profile on public.profiles;
create trigger trg_sync_membership_from_profile
  after insert or update of organization_id, status on public.profiles
  for each row execute function public.sync_membership_from_profile();

update public.organization_memberships m
   set status = case p.status when 'inactive' then 'suspended' else 'archived' end
  from public.profiles p
 where p.id = m.profile_id
   and p.status in ('inactive','terminated')
   and m.status = 'active';

create or replace function public.is_org_admin(_org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.is_org_owner(_org)
    or (
      exists (
        select 1 from public.organization_memberships m
         where m.profile_id = auth.uid()
           and m.organization_id = _org
           and m.status = 'active'
      )
      and (
        public.has_role(auth.uid(), 'agency_owner'::public.app_role)
        or public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'super_admin'::public.app_role)
        or exists (
          select 1 from public.role_permissions rp
           where rp.profile_id = auth.uid()
             and rp.organization_id = _org
             and rp.staff_is_admin
             and rp.admin_manage_staff_configs
        )
      )
    )
$$;

create or replace function public.set_agent_status(_agent uuid, _status text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid;
  v_owner uuid;
  v_count integer;
begin
  if _status not in ('active','inactive','terminated') then
    raise exception 'Unsupported status %', _status using errcode = 'invalid_parameter_value';
  end if;

  select organization_id into v_org from public.profiles where id = _agent;
  if v_org is null then
    raise exception 'That agent is not in an organisation.' using errcode = 'no_data_found';
  end if;

  select owner_id into v_owner from public.organizations where id = v_org;
  if v_owner = _agent then
    raise exception 'The agency owner''s access cannot be revoked here. Transfer ownership first.'
      using errcode = 'insufficient_privilege';
  end if;

  if not public.is_org_owner(v_org) and not public.is_platform_admin() then
    raise exception 'Only the agency owner can change an agent''s status.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.profiles
     set status = _status,
         terminated_at = case when _status = 'terminated' then now() else null end
   where id = _agent;
  get diagnostics v_count = row_count;

  update public.organization_memberships
     set status = case _status
                    when 'inactive' then 'suspended'
                    when 'terminated' then 'archived'
                    else 'active' end
   where profile_id = _agent and organization_id = v_org;

  return v_count;
end $$;

grant execute on function public.set_agent_status(uuid, text) to authenticated;

notify pgrst, 'reload schema';