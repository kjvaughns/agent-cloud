-- Every agent can see the whole agency's board.
--
-- ── What was wrong ──
--
-- "Each agent should be able to see everyone in the agency, not just them and
-- their downline."
--
-- The board offers "My Agency" to everybody, and for everybody except an org
-- admin it quietly meant "my downline". `scope_agent_ids` degrades 'agency' to
-- 'team' when `is_org_admin` is false, so a regular agent pressed My Agency and
-- got their own downline with no indication that the question had been changed
-- on the way through.
--
-- Widening that function was the obvious move and is the wrong one. It is the
-- single source of truth for Book of Business, analytics, the dashboard tiles
-- and the agent picker; removing the degradation there would widen every one of
-- those surfaces to agency-wide CLIENT and POLICY data to answer a question
-- about a scoreboard.
--
-- Widening RLS on `policies` is wrong for the same reason, one level down.
-- `policies_org_select` gates on `agent_id = auth.uid() OR is_in_downline(...)
-- OR is_org_owner(...)`. Letting every agent read every peer's policy rows to
-- total them would hand out `client_id`, `policy_number`, `face_amount`,
-- `annual_premium`, carrier and effective date — to Book of Business, the
-- pipeline drawer, client detail, analytics and every export, not to the
-- leaderboard. RLS cannot say "these four aggregate columns, for this question".
--
-- A security definer function can. This returns names and totals and nothing
-- else, it is the only thing holding the widened reach, and its authorization
-- is one readable condition in its own body.
--
-- ── Only producers ──
--
-- Agents who wrote nothing in the window are not on the board. That is a
-- product decision, not an oversight: a leaderboard of an agency's whole roster
-- padded with zeroes is a list of people who did not sell, published to
-- everyone who did. `get_team_leaderboard` zero-fills because it is a manager's
-- view of their own team; this one is read by the whole agency.
--
-- ── Two things deliberately copied, and one deliberately not ──
--
--   * `policy_counts_as_production` is reused rather than inlined, and
--     `policy_is_placed` is added beside it for the same reason: those status
--     lists live in src/lib/production/source.ts as well, and two copies drift.
--
--   * The window end is INCLUSIVE. `get_team_leaderboard` uses `< _end`, but
--     every caller in this app sends an inclusive end (`.lte` in
--     `getLeaderboardData`, and `inWindow` in source.ts documents it as
--     inclusive). Matching the older function here would silently drop the last
--     day of every period.
--
-- Safe to run more than once. Creates and replaces functions; drops nothing,
-- deletes nothing, and alters no table.

-- ── The placed-status list, in one place ────────────────────────────────────

create or replace function public.policy_is_placed(_status text)
returns boolean
language sql
immutable
as $$
  select _status in ('active', 'issued_not_paid');
$$;

comment on function public.policy_is_placed(text) is
  'Did this policy actually make it onto the books? Mirrors PLACED_STATUSES in '
  'src/lib/production/source.ts; change both together.';

-- ── The board ───────────────────────────────────────────────────────────────

create or replace function public.get_org_leaderboard(_start timestamptz, _end timestamptz)
returns table (
  agent_id uuid,
  first_name text,
  last_name text,
  premium numeric,
  policies bigint,
  placed numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with my_orgs as (
    -- Membership is the record.
    select m.organization_id
      from public.organization_memberships m
     where m.profile_id = auth.uid()
       and m.status = 'active'
    union
    -- …and the denormalised copy is the fallback, for exactly the agents this
    -- function was written for: somebody whose membership row is missing is
    -- still in the agency, and a board that excluded them would be repeating
    -- the bug it is fixing. Guarded on the profile not being revoked, so it is
    -- not a way back in after termination — the same condition `getMyOrgIds`
    -- applies in the application.
    select p.organization_id
      from public.profiles p
     where p.id = auth.uid()
       and p.organization_id is not null
       and coalesce(p.status, '') not in ('inactive', 'terminated')
  ),
  members as (
    select m.profile_id as id
      from public.organization_memberships m
     where m.organization_id in (select organization_id from my_orgs)
       and m.status = 'active'
    union
    select p.id
      from public.profiles p
     where p.organization_id in (select organization_id from my_orgs)
       and coalesce(p.status, '') not in ('inactive', 'terminated', 'invited')
  ),
  produced as (
    select pol.agent_id,
           coalesce(sum(pol.annual_premium), 0) as premium,
           count(*) as policies,
           coalesce(sum(pol.annual_premium)
                    filter (where public.policy_is_placed(pol.status::text)), 0) as placed
      from public.policies pol
     where pol.agent_id in (select id from members)
       and public.policy_counts_as_production(pol.status::text)
       and pol.production_date >= _start
       and pol.production_date <= _end
     group by pol.agent_id
  )
  select pr.agent_id,
         p.first_name,
         p.last_name,
         pr.premium,
         pr.policies,
         pr.placed
    from produced pr
    join public.profiles p on p.id = pr.agent_id
   where public.caller_is_active()
   order by pr.premium desc;
$$;

comment on function public.get_org_leaderboard(timestamptz, timestamptz) is
  'Agency-wide leaderboard, readable by every active member. Returns names and '
  'aggregates only — never policy rows — which is why this is a function rather '
  'than a widening of policies RLS: the board needs four totals, and the table '
  'carries client identity, policy numbers and face amounts. Producers only; '
  'agents with nothing in the window are not listed. The window end is '
  'inclusive, matching every caller in the application.';

grant execute on function public.get_org_leaderboard(timestamptz, timestamptz) to authenticated;
grant execute on function public.policy_is_placed(text) to authenticated;

notify pgrst, 'reload schema';