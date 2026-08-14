-- ---------------------------------------------------------------------------
-- A COMMISSION ROW CAN BE WRITTEN TWICE, OR CORRECTED, BUT NOT BOTH BY LUCK
--
-- The calculator's whole idempotency story was:
--
--     select id from commission_schedule where policy_id = $1 limit 1
--     if (existing.length > 0) return
--
-- which fails in both directions at once. A run that died halfway — after the
-- advance rows and before the override chain — left the policy permanently
-- half-paid, because the next attempt saw one row and returned. And a genuine
-- recalculation, after a level change or a corrected effective date, could
-- never write anything at all, because the old numbers were still sitting
-- there being "already done".
--
-- A stable key per intended payment fixes both. The key names the payment —
-- policy, recipient, kind, date, month — not the attempt, so:
--
--   * a retry writes the same keys and changes nothing
--   * a half-finished run completes on the next attempt
--   * a recalculation updates the amounts in place
--   * a leg that no longer applies is marked superseded, not deleted
--
-- Superseded rather than deleted because a commission that was once promised
-- and then withdrawn is a thing an agent will ask about, and "it is not in the
-- table" is not an answer. `superseded_at` keeps the old calculation readable
-- while taking it out of every sum.
-- ---------------------------------------------------------------------------

alter table public.commission_schedule
  -- Names the payment, not the attempt. See the calculator's commissionKey().
  add column if not exists idempotency_key text,
  -- Set when a recalculation no longer produces this leg. Every consumer must
  -- filter it out; nothing deletes it.
  add column if not exists superseded_at timestamptz,
  -- Groups the rows one calculation produced, so an audit can read a run whole.
  add column if not exists calc_run_id uuid;

-- Backfill a key for everything already written, from the same facts the
-- calculator will use. Rows that predate this cannot collide with new ones
-- because the shape is identical — which is the point: an existing policy's
-- next recalculation recognises its own rows rather than duplicating them.
update public.commission_schedule
   set idempotency_key = concat_ws(
         ':', policy_id::text, agent_id::text, payment_type,
         payment_date::text, coalesce(month_number, 0)::text)
 where idempotency_key is null;

-- Unique only where a key exists, so a row that somehow has none is still
-- legal rather than blocking the index creation on live data.
create unique index if not exists uq_commission_schedule_idempotency
  on public.commission_schedule(idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_commission_schedule_live
  on public.commission_schedule(policy_id, agent_id)
  where superseded_at is null;

comment on column public.commission_schedule.idempotency_key is
  'Stable across recalculation: policy:agent:type:date:month. Identifies the intended payment, never the attempt that wrote it.';
comment on column public.commission_schedule.superseded_at is
  'Set when a recalculation no longer produces this leg. The row stays readable so an agent can be told what changed; every sum must exclude it.';

notify pgrst, 'reload schema';
