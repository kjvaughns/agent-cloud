-- ---------------------------------------------------------------------------
-- THE SCOPE LAYER
--
-- Every scoped page in the app asks the same question: "run this query over a
-- set of agents." Which set is the only thing that differs. So there is one
-- function that answers it, and every page calls that.
--
--   mine    just you
--   team    you plus everyone under you in the upline chain
--   agency  every active member of your organisations
--
-- What this replaces: `get_book_of_business`'s `hierarchy`, which meant
-- "self+downline" for a manager and "the whole org" for an owner. One value
-- with two meanings is why an owner could not ask for just their own downline,
-- and why an owner's team view and agency view were silently the same numbers.
-- The two are separate values now. `hierarchy` and `agent` are kept as aliases
-- so existing callers keep working; they resolve to exactly what they resolved
-- to before.
--
-- Everything here is built on the hardened helpers — is_in_downline (depth cap,
-- cycle guard, same-org constraint), my_org_ids, is_org_owner, is_org_admin —
-- rather than writing another recursive CTE. The unguarded CTEs elsewhere in
-- this schema are exactly what that hardening exists to replace.
-- ---------------------------------------------------------------------------

create or replace function public.scope_agent_ids(_scope text)
returns setof uuid
language sql stable security definer set search_path = public
as $$
  with my_orgs as (
    select o as oid from public.my_org_ids() o
  ),
  can_agency as (
    -- is_org_admin, not is_org_owner: the owner of the row and the people who
    -- administer the agency are not always the same account, and the Agency
    -- section unlocks for both.
    select coalesce(bool_or(public.is_org_admin(oid)), false) as ok from my_orgs
  ),
  effective as (
    select case
      -- Legacy alias. Resolves to precisely what it used to mean, which is
      -- why it is a case arm and not a rename.
      when _scope = 'hierarchy' then
        case when (select ok from can_agency) then 'agency' else 'team' end
      -- Legacy alias: the caller passed one agent id and expected it to be
      -- authorised. Intersecting a team set with that id does the same job
      -- structurally, so the old explicit check is no longer needed.
      when _scope = 'agent' then 'team'
      -- Degrade rather than raise. A stale bookmark carrying ?scope=agency
      -- after a demotion must not 500 the page.
      when _scope = 'agency' and not (select ok from can_agency) then 'team'
      when _scope in ('mine', 'team', 'agency') then _scope
      else 'team'
    end as s
  )

  -- Always yourself. This is what makes `team` collapse to `mine` for an agent
  -- with nobody under them, with no branch anywhere to say so.
  select auth.uid()

  union

  select p.id
    from public.profiles p
   where (select s from effective) = 'team'
     and public.is_in_downline(auth.uid(), p.id)

  union

  select p.id
    from public.profiles p
   where (select s from effective) = 'agency'
     and p.organization_id in (select oid from my_orgs);
$$;

comment on function public.scope_agent_ids(text) is
  'Resolves a scope name to the set of agent ids it covers. The single source of truth for mine/team/agency across the app.';

-- ---------------------------------------------------------------------------
-- What scopes may this person choose, and may they write to team rows?
--
-- Answered from the data, never from the role. A "manager" with nobody under
-- them should not be offered a Team view that is guaranteed to be empty, and
-- an "agent" who has recruited three people should not be denied one.
-- ---------------------------------------------------------------------------

create or replace function public.my_scopes()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'downline_count',
      (select count(*) from public.profiles p
        where public.is_in_downline(auth.uid(), p.id) and p.id <> auth.uid()),
    'can_agency',
      coalesce((select bool_or(public.is_org_admin(o)) from public.my_org_ids() o), false),
    -- Deliberately is_org_owner and not is_org_admin: this mirrors the
    -- <table>_org_modify RLS policies, which grant writes on the owner branch
    -- only. It reports what the database will actually allow, so the UI can
    -- disable an input instead of offering a save that silently does nothing.
    'can_edit_team_records',
      coalesce((select bool_or(public.is_org_owner(o)) from public.my_org_ids() o), false)
  );
$$;

comment on function public.my_scopes() is
  'Scope capabilities for the caller: downline size, whether agency scope is available, and whether team rows are writable.';

-- ---------------------------------------------------------------------------
-- People pickers
-- ---------------------------------------------------------------------------

create or replace function public.get_scope_agents(_scope text)
returns table (id uuid, first_name text, last_name text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.first_name, p.last_name
    from public.profiles p
   where p.id in (select s from public.scope_agent_ids(_scope) s)
   order by p.first_name nulls last, p.last_name nulls last;
$$;

-- Same signature and same contract as before, but resolved through the widest
-- scope the caller has. The old body asked only for the upline subtree, so an
-- org owner who happened to be nobody's upline got an empty agent dropdown
-- while the page beside it listed the whole agency's policies.
create or replace function public.get_downline_agents()
returns table (id uuid, first_name text, last_name text)
language sql stable security definer set search_path = public
as $$
  select g.id, g.first_name, g.last_name
    from public.get_scope_agents(
      case
        when coalesce((select bool_or(public.is_org_admin(o)) from public.my_org_ids() o), false)
        then 'agency'
        else 'team'
      end
    ) g
   where g.id <> auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Book of Business, rewritten onto the shared resolver.
--
-- Signature and result columns are unchanged, so every existing caller keeps
-- working. _agent_id stops being a third scope and becomes what it always
-- read like — a narrowing filter — intersected with the scope set. That
-- intersection is what authorises it: an id outside your scope yields nothing.
-- ---------------------------------------------------------------------------

create or replace function public.get_book_of_business(_scope text, _agent_id uuid default null)
returns table (
  id uuid, client_id uuid, agent_id uuid, carrier_id uuid, carrier_name text,
  product text, policy_number text, status policy_status,
  monthly_premium numeric, annual_premium numeric, face_amount numeric,
  effective_date date, posted_at timestamptz, carrier_integration text,
  is_gtl boolean, client_first_name text, client_last_name text,
  agent_first_name text, agent_last_name text
)
language sql stable security definer set search_path = public
as $$
  with scope_agents as (
    select s from public.scope_agent_ids(_scope) s
     where _agent_id is null or s = _agent_id
  )
  select
    pol.id, pol.client_id, pol.agent_id, pol.carrier_id,
    car.name as carrier_name,
    pol.product, pol.policy_number, pol.status,
    pol.monthly_premium, pol.annual_premium, pol.face_amount,
    pol.effective_date, pol.posted_at, pol.carrier_integration, pol.is_gtl,
    cli.first_name, cli.last_name,
    pr.first_name, pr.last_name
  from public.policies pol
  left join public.clients  cli on cli.id = pol.client_id
  left join public.profiles pr  on pr.id  = pol.agent_id
  left join public.carriers car on car.id = pol.carrier_id
  where pol.agent_id in (select s from scope_agents where s is not null)
  order by pol.posted_at desc;
$$;

grant execute on function public.scope_agent_ids(text) to authenticated;
grant execute on function public.my_scopes() to authenticated;
grant execute on function public.get_scope_agents(text) to authenticated;
grant execute on function public.get_downline_agents() to authenticated;
grant execute on function public.get_book_of_business(text, uuid) to authenticated;

-- PostgREST caches function signatures. Without this the new RPCs 404 until
-- something else happens to reload the schema.
notify pgrst, 'reload schema';
