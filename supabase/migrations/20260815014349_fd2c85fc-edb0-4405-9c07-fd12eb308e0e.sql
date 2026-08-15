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

alter table public.policies alter column production_date drop default;

create index if not exists idx_policies_org_production_date
  on public.policies (organization_id, production_date desc);
create index if not exists idx_policies_agent_production_date
  on public.policies (agent_id, production_date desc);
create index if not exists idx_policies_status_production_date
  on public.policies (status, production_date desc);

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