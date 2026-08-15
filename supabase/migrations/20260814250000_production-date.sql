-- One production date, and it is right for imported policies too.
--
-- The leaderboard could show zero for a month in which the book of business
-- plainly contained business. This is why.
--
-- Production is windowed on `policies.posted_at`. For a deal an agent posts
-- through the product that is exactly right: it is the moment the business was
-- written. For an imported book it is nonsense. Two of the four import paths
-- stamp `posted_at = now()`:
--
--   admin-import.functions.ts:1116   posted_at: new Date().toISOString()
--   import-helpers.ts:515            posted_at: new Date().toISOString()
--
-- So an agency importing four hundred policies written over three years gets
-- four hundred policies dated the afternoon of the import. Every one of those
-- months reads zero, and the import month shows a spike that never happened.
-- The book of business, which has no date window at all, shows them correctly
-- the whole time — which is precisely the contradiction that was reported.
--
-- ── The rule ──
--
--   production_date = effective_date when it falls BEFORE posted_at,
--                     posted_at otherwise.
--
-- A policy whose effective date precedes the date it was posted was
-- necessarily written before it was posted: that is an import, or somebody
-- entering an old policy by hand. Its effective date is the best evidence of
-- when the business actually happened, and it is the only such evidence this
-- schema holds — `policies` has no created_at and no submitted_at.
--
-- A policy whose effective date comes AFTER it was posted is an ordinary
-- forward-dated sale, and `posted_at` is correct. This is deliberate and it
-- matters: windowing those on effective_date is the bug that made the
-- dashboard's chart disagree with the tiles above it, fixed in #144. The rule
-- above cannot reintroduce it, because it only ever moves a date backwards.
--
-- One rule, no import marker to get wrong, and it needs nothing the row does
-- not already carry.
--
-- Forward only. Nothing is dropped, no row loses data, and `posted_at` keeps
-- every value it has — this adds a column beside it rather than rewriting it,
-- so the raw fact of when a row was entered survives.

alter table public.policies
  add column if not exists production_date timestamptz;

comment on column public.policies.production_date is
  'When the business was written, for every production figure in the product. effective_date when it precedes posted_at (an import or a hand-entered old policy), otherwise posted_at. Never effective_date for a forward-dated sale.';

-- Backfill. Guarded on null so re-running adds nothing and never overwrites a
-- date a later import set deliberately.
update public.policies
   set production_date = case
     when effective_date is not null
      and effective_date::timestamptz < posted_at
     then effective_date::timestamptz
     else posted_at
   end
 where production_date is null;

-- ── New rows, not just the ones already here ──
--
-- The backfill runs once. Without this, the very next import writes four
-- hundred more policies dated the afternoon of the import, and the bug is back
-- the first time anybody uses the feature that caused it.
--
-- A trigger rather than an edit to the import paths, for two reasons. There
-- are four of them (admin-import, book-import, import-helpers, post-deal) and
-- an edit to three is a rule that a fifth will not know about. And naming a
-- column in an insert payload before the column exists is rejected outright by
-- PostgREST, so those edits could not ship until this had already applied —
-- which is exactly backwards from how these migrations are applied by hand.
--
-- The same rule as the backfill, and it defers entirely to a caller that sets
-- the column itself, so a future import that knows a better date can say so.
--
-- Deliberately NOT a column default of `now()`. Defaults are applied when the
-- tuple is built, before a BEFORE INSERT trigger ever sees it, so a default
-- would mean `new.production_date` was never null and the trigger could never
-- tell "the caller said nothing" from "the caller chose now". The trigger is
-- the only writer of the fallback, and it always sets a value — which is what
-- lets the column be NOT NULL with no default at all.
create or replace function public.set_policy_production_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.production_date is null then
    new.production_date := case
      when new.effective_date is not null
       and new.effective_date::timestamptz < coalesce(new.posted_at, now())
      then new.effective_date::timestamptz
      else coalesce(new.posted_at, now())
    end;
  end if;
  return new;
end $$;

comment on function public.set_policy_production_date() is
  'Dates a new policy by when the business was written. Mirrors the backfill in 20260814250000 so an imported book is not dated the afternoon it was imported.';

drop trigger if exists policies_set_production_date on public.policies;
create trigger policies_set_production_date
  before insert on public.policies
  for each row execute function public.set_policy_production_date();

-- Now that nothing can insert a null, the column can require one. Ordered
-- after the trigger on purpose: NOT NULL with neither a default nor a trigger
-- would reject every insert in between.
--
-- A re-run finds the column already not-null, which is not an error worth
-- failing a migration over; a genuinely unfilled row still is.
do $$
begin
  if exists (select 1 from public.policies where production_date is null) then
    raise exception 'production_date backfill left rows null';
  end if;
  alter table public.policies alter column production_date set not null;
exception
  when others then
    if sqlerrm not like '%backfill left rows null%' then
      raise notice 'production_date not-null: %', sqlerrm;
    else
      raise;
    end if;
end $$;

-- If an earlier attempt at this migration set a default, take it back: see the
-- note above the trigger for why a default and the trigger cannot coexist.
alter table public.policies alter column production_date drop default;

-- Every production query filters on this column and groups by agent or
-- organization. Without these it is a sequential scan per leaderboard render.
create index if not exists idx_policies_org_production_date
  on public.policies (organization_id, production_date desc);
create index if not exists idx_policies_agent_production_date
  on public.policies (agent_id, production_date desc);
-- Status is in the eligibility rule, so it is part of the same lookup.
create index if not exists idx_policies_status_production_date
  on public.policies (status, production_date desc);

-- ── Which statuses count, in the database ──
--
-- The same three the TypeScript excludes (src/lib/production/source.ts,
-- NON_PRODUCTION_STATUSES). A withdrawn application was pulled before it
-- placed, a not-taken policy was declined by the client, and carrier_na means
-- the carrier does not write it — in none of those cases was business placed,
-- and in none of them ever will be.
--
-- Deliberately NOT excluded: lapsed and cancelled. Those were genuinely
-- written, the premium was real and the commission was advanced. Netting them
-- out of production would make production and retention impossible to
-- reconcile; retention is the separate number for what survived.
--
-- A function rather than a repeated `not in (...)` so the list lives in one
-- place on this side too, and so the leaderboard, the dashboard and anything
-- added later cannot drift apart by editing one copy.
--
-- No `SET search_path`: the body references no objects, and a SET clause would
-- stop the planner inlining it, which would cost the index on (status,
-- production_date) that the query below depends on.
create or replace function public.policy_counts_as_production(_status text)
returns boolean
language sql
immutable
as $$
  select _status is null
      or _status not in ('withdrawn', 'not_taken', 'carrier_na');
$$;

comment on function public.policy_counts_as_production(text) is
  'Does a policy with this status count towards production? Mirrors NON_PRODUCTION_STATUSES in src/lib/production/source.ts; change both together.';

-- ── The dashboard reads the same date as everything else ──
--
-- Unchanged from 20260715120000 except in two respects, both of which are the
-- point of this migration:
--
--   1. The window is `production_date`, not `posted_at`. Without this the
--      dashboard would keep dating an imported book to the afternoon it was
--      imported while the leaderboard, the team page and the book of business
--      all agreed on when the business was actually written. One wrong screen
--      is worse than the bug being everywhere, because it reads as the others
--      being wrong.
--
--   2. The production figures skip statuses that are not production. The
--      status grid and the donut do NOT: those are pipeline views, and a
--      withdrawn application is exactly the thing somebody opens that grid to
--      see. Filtering it there would hide the work rather than correct a
--      number.
--
-- Everything else — downline-only team production, the range-respecting grid
-- and donut, the recursive active downline count — is carried over verbatim.
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(_range_start timestamptz, _range_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_uid uuid := auth.uid();
BEGIN
  WITH RECURSIVE downline AS (
    SELECT v_uid AS id
    UNION ALL
    SELECT p.id FROM public.profiles p JOIN downline d ON p.upline_id = d.id
  ),
  team_ids AS (SELECT id FROM downline),
  range_policies AS (
    SELECT pol.*, (pol.agent_id = v_uid) AS is_mine
    FROM public.policies pol
    WHERE pol.agent_id IN (SELECT id FROM team_ids)
      AND pol.production_date >= _range_start
      AND pol.production_date < _range_end
  ),
  -- Production only. The grid and donut below read range_policies whole.
  produced AS (
    SELECT * FROM range_policies
    WHERE public.policy_counts_as_production(status::text)
  ),
  kpis AS (
    SELECT
      COALESCE(SUM(CASE WHEN is_mine THEN annual_premium END), 0) AS my_prod,
      COALESCE(SUM(CASE WHEN NOT is_mine THEN annual_premium END), 0) AS team_prod,
      COUNT(*) FILTER (WHERE is_mine) AS my_policies,
      COUNT(*) FILTER (WHERE NOT is_mine) AS team_policies
    FROM produced
  ),
  status_grid AS (
    SELECT status::text AS status, COUNT(*) AS cnt
    FROM range_policies
    GROUP BY status
  ),
  donut AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'active') AS active_cnt,
      COUNT(*) FILTER (WHERE status = 'in_review') AS in_review_cnt,
      COUNT(*) AS total_cnt
    FROM range_policies
  ),
  active_downline AS (
    SELECT COUNT(*) AS cnt
    FROM public.profiles
    WHERE id IN (SELECT id FROM team_ids)
      AND id <> v_uid
      AND status = 'active'
  ),
  active_contracts AS (
    SELECT COUNT(*) AS cnt FROM public.agent_commission_levels WHERE agent_id = v_uid
  ),
  months AS (
    SELECT date_trunc('month', now()) - (i || ' months')::interval AS m_start
    FROM generate_series(0, 11) i
  ),
  trend AS (
    SELECT
      to_char(m.m_start, 'YYYY-MM-DD') AS month,
      COALESCE(SUM(CASE WHEN pol.agent_id = v_uid THEN pol.annual_premium END), 0) AS my_prod,
      COALESCE(SUM(CASE WHEN pol.agent_id <> v_uid THEN pol.annual_premium END), 0) AS team_prod,
      COUNT(*) FILTER (WHERE pol.agent_id = v_uid) AS my_policies,
      COUNT(pol.id) FILTER (WHERE pol.agent_id <> v_uid) AS team_policies
    FROM months m
    LEFT JOIN public.policies pol
      ON pol.production_date >= m.m_start
     AND pol.production_date < m.m_start + interval '1 month'
     AND pol.agent_id IN (SELECT id FROM team_ids)
     AND public.policy_counts_as_production(pol.status::text)
    GROUP BY m.m_start
    ORDER BY m.m_start
  )
  SELECT jsonb_build_object(
    'my_prod', (SELECT my_prod FROM kpis),
    'team_prod', (SELECT team_prod FROM kpis),
    'my_policies', (SELECT my_policies FROM kpis),
    'team_policies', (SELECT team_policies FROM kpis),
    'status_grid', COALESCE((SELECT jsonb_object_agg(status, cnt) FROM status_grid), '{}'::jsonb),
    'donut', jsonb_build_object(
      'active', (SELECT active_cnt FROM donut),
      'in_review', (SELECT in_review_cnt FROM donut),
      'total', (SELECT total_cnt FROM donut)
    ),
    'active_downline', (SELECT cnt FROM active_downline),
    'active_contracts', (SELECT cnt FROM active_contracts),
    'trend', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'month', month, 'my_prod', my_prod, 'team_prod', team_prod,
      'my_policies', my_policies, 'team_policies', team_policies
    )) FROM trend), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

notify pgrst, 'reload schema';
