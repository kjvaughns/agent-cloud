-- State and risk exceptions on a comp grid, and the rules that keep it sane.
--
-- ── Why ──
--
-- `commission_grids` has carried product, age band, level and three renewal
-- columns since the first schema. What it could not express is the two things
-- carriers publish alongside them: a state exception ("Florida pays 90 where
-- the national schedule pays 100") and a risk split ("tobacco pays 70").
--
-- The selector added in `src/lib/compensation/grid-rule.ts` already handles
-- both — a row with neither applies to everything, which is exactly today's
-- behaviour — so this migration is what lets an owner record one.
--
-- ── The index is the load-bearing part ──
--
-- `commission_grids_org_row_uniq` keys on
-- (organization, carrier, product, level, age_min). A Florida row for the same
-- product, level and age band as the national row collides with it, so
-- without this change the state exception could not be stored at all.
--
-- Extending the key rather than dropping it: the brief asks for duplicate
-- rules to be refused "unless a more specific state or risk rule distinguishes
-- them", which is precisely a wider unique key. Two national rows for the same
-- band are still refused; a national row and a Florida row are not the same
-- rule.
--
-- ── Age bands ──
--
-- A band whose minimum is above its maximum matches nobody, so a grid row
-- written that way is silently dead — the deal falls back and nothing says
-- why. The check refuses it at write time.
--
-- Added NOT VALID so applying this cannot reject rows already stored. Existing
-- inverted bands stay, and are listed by the query in the comment below for
-- somebody to fix deliberately rather than having a migration decide.
--
-- Forward-only and idempotent throughout.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. The two columns
-- ───────────────────────────────────────────────────────────────────────────

alter table public.commission_grids
  add column if not exists state_code text,
  add column if not exists risk_class text;

comment on column public.commission_grids.state_code is
  'Two-letter code when this row is a state exception. NULL means it applies in every state, which is how every existing row reads.';
comment on column public.commission_grids.risk_class is
  'tobacco or non_tobacco when the carrier splits the rate. NULL means it applies to both.';

-- A free-text risk class would let "Tobacco", "tobacco" and "smoker" all be
-- stored and none of them match each other at lookup time.
do $$ begin
  alter table public.commission_grids
    add constraint commission_grids_risk_class_check
    check (risk_class is null or risk_class in ('tobacco', 'non_tobacco'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.commission_grids
    add constraint commission_grids_state_code_check
    check (state_code is null or state_code ~ '^[A-Za-z]{2}$');
exception when duplicate_object then null; end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. An age band that matches nobody
-- ───────────────────────────────────────────────────────────────────────────
--
-- NOT VALID: existing rows are left alone. To find any that would fail:
--
--   select id, product_name, age_group_min, age_group_max
--     from public.commission_grids
--    where age_group_min is not null and age_group_max is not null
--      and age_group_min > age_group_max;

do $$ begin
  alter table public.commission_grids
    add constraint commission_grids_age_band_check
    check (
      age_group_min is null
      or age_group_max is null
      or age_group_min <= age_group_max
    ) not valid;
exception when duplicate_object then null; end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. One rule per distinguishable row
-- ───────────────────────────────────────────────────────────────────────────
--
-- The old index is replaced rather than supplemented: leaving it in place
-- would keep refusing exactly the state exceptions this migration exists to
-- allow.
--
-- `age_group_max` joins the key as well. Two rows for the same product and
-- level starting at 18 but ending at 70 and 85 are different rules, and the
-- old key treated them as the same one — so an owner adding a second band that
-- happened to share a lower bound had their first silently overwritten on
-- upsert.

drop index if exists public.commission_grids_org_row_uniq;

create unique index if not exists commission_grids_org_rule_uniq
  on public.commission_grids (
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    carrier_id,
    product_name,
    coalesce(level_name, ''),
    coalesce(age_group_min, -1),
    coalesce(age_group_max, -1),
    coalesce(upper(state_code), ''),
    coalesce(risk_class, '')
  );

comment on index public.commission_grids_org_rule_uniq is
  'One rate per organization, carrier, product, level, age band, state and risk class. Replaces commission_grids_org_row_uniq, which keyed on the lower age bound only and had no state or risk, so a Florida exception could not be stored beside its national row and a second band sharing a lower bound overwrote the first. The zero UUID stands in for the shared default set so NULL organizations compare equal to each other rather than to nothing.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4. A Discord event is delivered once
-- ───────────────────────────────────────────────────────────────────────────
--
-- The ledger is what stops a retry re-posting a sale an agency has already
-- seen. It has been enforced in application code only, which holds until two
-- requests race — exactly the case a retry creates.
--
-- Partial, on delivered rows: a skip and a later successful send for the same
-- event are two different facts and both belong in the ledger. Only two
-- *deliveries* of one event to one channel are wrong.

create unique index if not exists discord_deliveries_once
  on public.discord_deliveries (integration_id, event_type, policy_id)
  where policy_id is not null and status = 'sent';

comment on index public.discord_deliveries_once is
  'One successful delivery per channel, event type and policy. Partial on sent so a skip and a later send for the same event can both be recorded — they are different facts. Enforced here as well as in application code because the code path that needs it is a retry, which is when two requests race.';

notify pgrst, 'reload schema';
