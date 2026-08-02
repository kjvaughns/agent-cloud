-- ---------------------------------------------------------------------------
-- TERMINATION THAT ACTUALLY TERMINATES
--
-- "Mark Terminated" has existed for a while. It writes `profiles.status =
-- 'terminated'` and hides the agent from rosters. That is all it does.
--
-- A terminated agent keeps their login, keeps their organisation's data, stays
-- in every downline query, and — proved against a scratch database built from
-- this migration history — can set themselves back to `active` and clear their
-- own `terminated_at`, because `profiles_org_manage` grants FOR ALL on
-- `id = auth.uid()` with no column-level restriction.
--
-- Six things have to change together. Closing them in the wrong order leaves
-- revocation reversible, or locks an agency owner out of their own agency.
--
--   1. The self-reinstate hole, first. Everything else is decoration while the
--      terminated party can undo it — and it gets *worse* once (3) lands,
--      because then a self-reinstate also re-activates their membership.
--   2. The SECURITY DEFINER RPC surface. This is the one that is easy to miss:
--      `get_team_downline()` is SECURITY DEFINER, granted to `authenticated`,
--      and walks `profiles.upline_id` recursively with no `my_org_ids()`, no
--      membership check and no caller check. RLS is not in its path. Archive
--      the membership and it still returns the whole downline roster with
--      email addresses, policy counts and premium totals.
--   3. Termination has to propagate to `organization_memberships`, because
--      `my_org_ids()` — which every org-scoped policy depends on — reads
--      exactly that and nothing else.
--   4. `is_in_downline` has no status filter, so a terminated agent is still a
--      valid upline everywhere.
--   5. `is_org_admin` reads `profiles.organization_id` rather than membership.
--   6. A single write path, so the two stores cannot drift.
--
-- Deliberately NOT here: `organization_memberships.status` gains no new value.
-- Its CHECK already allows 'suspended' and 'archived', `my_org_ids()` filters
-- on `= 'active'` so any non-active value revokes identically, and the existing
-- backfills already map terminated → archived. Adding a value would need an
-- unapplied-window fallback for something the database rejects with 23514, and
-- buy nothing.
--
-- This migration is deliberately self-sufficient. Applied on its own, with no
-- code deployed, the *existing* `setAgentTerminated` starts revoking access,
-- because (3) picks up the `profiles.status` write it already makes.
-- ---------------------------------------------------------------------------

-- ── 0. The status vocabulary, and a bug it was hiding ─────────────────────

-- `profiles_status_check` allowed ('not_activated','pending','active','hidden',
-- 'terminated'). `importAgents` writes 'imported', which is not in that list —
-- so that update fails with 23514, and because its result is never read the
-- failure is silent. The whole update is rejected, so an imported agent loses
-- their first name, last name AND upline_id: an orphaned profile in nobody's
-- downline.
--
-- Re-asserted OUTSIDE any `DO ... EXCEPTION WHEN others THEN NULL` block. The
-- previous declaration was wrapped in one, which means a failure to apply it
-- was swallowed and the constraint may simply not exist. If this fails, it
-- should fail loudly.
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in (
    'not_activated','pending','active','hidden',
    'inactive','terminated','imported'
  ));

-- ── 1. Nobody edits their own status ──────────────────────────────────────

-- RLS cannot express this: `with check` sees only the new row, so there is no
-- way to say "you may update this row but not this column". A BEFORE UPDATE
-- trigger is the fit, and matches `assert_upline_same_org` alongside it.
--
-- Narrow on purpose. It fires only when the revoked set is involved on either
-- side, so `mark_first_sale` — which promotes pending → active from inside the
-- agent's own session — is untouched.
create or replace function public.assert_status_not_self_set()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- Service role and SECURITY DEFINER paths have no JWT subject. Those already
  -- sit behind org-guard in the application layer.
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

-- A column-level REVOKE was tried here and removed, because it does nothing.
-- Postgres does not let a column-level revoke carve a column out of a
-- table-level grant, and Supabase grants `update` on `public.profiles` to
-- `authenticated` at the table level. Verified directly:
--
--   grant update on t to authenticated;
--   revoke update (b) on t from authenticated;
--   -- column_privileges still reports UPDATE on b
--
-- Making it work would mean revoking the table grant and re-granting every
-- other column individually — which silently breaks the next column anybody
-- adds. The trigger above is the real protection, and unlike a blanket revoke
-- it can allow the one self-write that is legitimate: `mark_first_sale`
-- promoting `pending` → `active` from inside the agent's own session.
--
-- A revoke that quietly does nothing is worse than no revoke; it invites the
-- belief that the trigger is redundant.

-- ── 2. The SECURITY DEFINER surface ───────────────────────────────────────

-- Returns true when there is no JWT subject, so service-role and definer paths
-- are unaffected.
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

-- `is_in_downline` gains the caller gate. Five of the eleven definer functions
-- route through it — scope_agent_ids, and therefore get_scope_agents,
-- get_downline_agents, get_book_of_business, my_scopes — so gating here fixes
-- them all at once.
--
-- Gated on `_upline`, not on `_target`. A revoked agent has no downline, which
-- is the security property. Filtering `_target` as well would silently orphan
-- the sub-tree beneath a terminated middle manager and change what "downline"
-- means for reporting — a bigger change than this migration is entitled to
-- make, and the roster already filters terminated agents for display.
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

-- The five that walk `profiles.upline_id` themselves and never touch
-- is_in_downline. Each keeps its body verbatim and gains only the gate.

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

create or replace function public.get_team_downline_for(p_root_id uuid)
returns table(id uuid, first_name text, last_name text, email text, phone text,
              upline_id uuid, status text, last_active_at timestamptz,
              created_at timestamptz, depth_level integer, contracts_count integer,
              policies_count integer, premium_total numeric, completion_pct integer,
              missing jsonb)
language sql stable security definer set search_path = public
as $$
  WITH RECURSIVE dl AS (
    SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.upline_id,
           p.status, p.last_active_at, p.created_at, 0 AS depth_level
    FROM public.profiles p
    WHERE p.id = p_root_id AND public.caller_is_active()
    UNION ALL
    SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.upline_id,
           p.status, p.last_active_at, p.created_at, d.depth_level + 1
    FROM public.profiles p JOIN dl d ON p.upline_id = d.id
    WHERE p.id != p_root_id
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

-- ── 3. Termination propagates to membership ───────────────────────────────

-- Was `after insert or update of organization_id` with `on conflict do
-- nothing`, so the mapping below only ever ran once, when the row was first
-- created. Terminating an agent who already had a membership changed nothing —
-- which is the whole reason termination revoked nothing.
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

  -- 'suspended' for inactive rather than 'archived' for both: functionally
  -- identical for access, since my_org_ids() filters on = 'active', but it
  -- keeps "reinstate from Inactive" distinguishable from "reinstate from
  -- Terminated" in the data.
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

-- Backfill: every already-terminated agent whose membership is still active.
update public.organization_memberships m
   set status = case p.status when 'inactive' then 'suspended' else 'archived' end
  from public.profiles p
 where p.id = m.profile_id
   and p.status in ('inactive','terminated')
   and m.status = 'active';

-- ── 4. is_org_admin reads membership, not the profile cache ───────────────

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

-- ── 5. One write path ─────────────────────────────────────────────────────

-- Both stores in one transaction, so they cannot drift, and a row count so the
-- caller cannot be told a change landed when RLS or a missing row meant it did
-- not.
--
-- Refuses to touch the organisation's owner. The org policies are conjunctive —
-- `organization_id in (my_org_ids()) AND (... or is_org_owner(...))` — so
-- is_org_owner does NOT rescue an owner whose membership is archived. Revoking
-- an owner locks them out of their own agency with no way back in.
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

  -- The trigger above mirrors this into organization_memberships. Asserted
  -- rather than assumed, because the whole point of this function is that the
  -- two stores stay together.
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
