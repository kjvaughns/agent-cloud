-- ---------------------------------------------------------------------------
-- ONE WRITING NUMBER, ONE STORE
--
-- A writing number is the single most consequential identifier in contracting
-- — it is what the carrier pays against — and this schema has kept it in three
-- separate places, with nothing reconciling any of them:
--
--   contract_requests.writing_number        written by activateContract,
--                                           addAgentCarrier, the matrix cell
--   agent_commission_levels.writing_number  written by the admin comp-level
--                                           editor, and by nothing else
--   writing_numbers                         the ops table, with scope, state,
--                                           product line, comp level, upline
--                                           number, source and audit — and
--                                           until now, almost no rows
--
-- So an agent could be shown one number on their Contracts page, a different
-- one in the admin comp editor, and nothing at all in the ops table that the
-- packet and the carrier hierarchy are built from. Whichever surface you
-- happened to look at was the answer.
--
-- `writing_numbers` wins. It is the only one of the three that can express
-- what a writing number actually is: an agent can hold several at one carrier
-- — one per state, or per product line — which neither `text` column can
-- represent at all.
--
-- This migration does three things and drops nothing.
--
--   1. Lets an agent record their own number, which the table did not allow.
--   2. Backfills from BOTH legacy columns.
--   3. Marks both columns deprecated, in place, still readable.
--
-- The columns are deliberately not dropped. A drop is unrecoverable, the
-- backfill has to prove itself against real data first, and code deployed
-- before this migration is applied still writes them.
-- ---------------------------------------------------------------------------

-- ── 1. Provenance, and who may write ──────────────────────────────────────

-- Two new sources. `self_reported` is an agent typing in the number their
-- carrier sent them, which is a real and useful claim but not the same claim
-- as `carrier_confirmation` — and the distinction has to survive in the row,
-- because the write policy below is built on it.
alter table public.writing_numbers drop constraint if exists writing_numbers_source_check;
alter table public.writing_numbers add constraint writing_numbers_source_check
  check (source in (
    'manual_entry','carrier_confirmation','import','request_outcome',
    'external_api','self_reported','legacy_backfill'
  ));

-- The only write policy was:
--
--   for all using (can_manage_contracting(organization_id)
--                  or can_submit_contracts(organization_id))
--
-- An ordinary agent has neither permission, so an agent could never record a
-- number for themselves — while `contract_requests.writing_number`, which they
-- could write freely, was the column the app actually used. Consolidating onto
-- this table without this policy would take away a thing agents can do today.
--
-- Scoped to their own row and to `self_reported`, so an agent may state their
-- own number but can never overwrite one contracting staff confirmed, and can
-- never touch anybody else's.
drop policy if exists writing_numbers_own on public.writing_numbers;
create policy writing_numbers_own on public.writing_numbers
  for all to authenticated
  using (agent_id = auth.uid() and source = 'self_reported')
  with check (agent_id = auth.uid() and source = 'self_reported');

-- ── 2. Backfill ───────────────────────────────────────────────────────────

-- `writing_numbers.org_carrier_id` points at the org's link row, not the
-- global carrier, so every legacy row needs one. `20260802200000` already
-- created links from `contract_requests` and `commission_grids`; this covers
-- `agent_commission_levels`, which that migration did not look at, and any
-- row whose org is resolved from the profile rather than the record.
--
-- Without this the backfill would silently drop exactly the rows it exists to
-- rescue: an agent holding a number at a carrier the agency never linked.
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

-- Both legacy columns, in one pass.
--
-- `distinct on` picks one row per (agent, carrier, number): the two columns
-- frequently hold the same number for the same pair, and inserting both would
-- be two rows saying the same thing. `contract_requests` is ordered first
-- because it is the one the agent themselves last touched.
--
-- `on conflict do nothing` against `idx_writing_numbers_unique` makes this
-- safe to run twice — a real requirement here, since migrations are applied by
-- hand and a partially-applied run has to be resumable.
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

-- ── 3. Mark the legacy columns, keep them ─────────────────────────────────

comment on column public.contract_requests.writing_number is
  'DEPRECATED as of 2026-08-02. public.writing_numbers is authoritative. '
  'Backfilled by 20260802220000. Retained so code deployed before that '
  'migration keeps working; read writing_numbers instead.';

comment on column public.agent_commission_levels.writing_number is
  'DEPRECATED as of 2026-08-02. public.writing_numbers is authoritative. '
  'Backfilled by 20260802220000. Retained so code deployed before that '
  'migration keeps working; read writing_numbers instead.';

notify pgrst, 'reload schema';
