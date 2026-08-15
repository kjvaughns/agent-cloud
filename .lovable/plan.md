# Fix commissions, trails and renewals never being written

## What is actually happening

Your one live policy (Ethos, TruStage Advantage Whole Life, $129.45/mo, effective 2026-08-15) posted fine. The commission schedule for it is completely empty — `commission_schedule` has 0 rows in the whole database — and no "setup issue" was recorded either, so Finances has nothing to show and nothing to explain.

Your compensation setup is fine: you hold an active 90% contract on Ethos, the carrier is enabled for the agency, and there are 330 grid rows. The money is failing at the moment of writing, for three separate reasons found in the database:

1. **The calculator writes a payment type the table forbids.** It writes the as-earned balance months as `payment_type = "as_earned"`, but the table only allows `advance`, `deferred`, `trail`, `override`, `renewal`. Postgres rejects the write, and because all rows (advance, as-earned, renewals, overrides) go in one batch, *every* row is thrown away — one bad value costs the whole schedule.
2. **An agent cannot write their upline's override rows.** The write rule on `commission_schedule` allows a row only when `agent_id` is your own id or you are the agency owner. Override legs are written with the upline's id as the payee, so the same batch is refused again as soon as anybody has an upline above them.
3. **The "why you weren't paid" record can never be written by an agent.** The write rule on `commission_setup_issues` requires agency-owner or platform-admin. Any agent hitting a genuine setup gap gets silence — which is exactly what you saw: no money, no explanation.

A fourth, latent problem: the batch upserts on `idempotency_key`, whose unique index is *partial* (`WHERE idempotency_key IS NOT NULL`). Postgres cannot infer a partial index as a conflict target, so even after the above are fixed the upsert can fail with "no unique or exclusion constraint matching the ON CONFLICT specification".

## The fix

**Payment types**
- Stop writing `as_earned`; write those months as `deferred`, which is the allowed type that already means "the balance not advanced" and is what Finances and the dashboard already read.

**Write rules (database)**
- Allow a commission row whose payee is an upline of the writing agent, in the same agency — so override legs land. Reads stay as they are.
- Allow an agent to record a setup issue for their own policy, so the "why this wasn't paid" banner works for agents and not just owners.

**Idempotency**
- Make the unique index on `idempotency_key` a full unique index (the column is always set by the calculator) so the upsert conflict target resolves, keeping retries and recalculation safe from duplicating payments.

**Backfill the existing policy**
- Run the calculator for the one existing policy after the fixes, so your Ethos deal shows its advance, deferred months, renewals and any override immediately instead of only future deals working.

**Make failure visible**
- Surface the calculator's write failure to the agent instead of only a server log: if the schedule cannot be written, Post Deal / Pipeline says so with the reason, and Finances shows the outstanding setup issue.
- Keep Finances reading only live rows (`superseded_at IS NULL`) so a recalculation never double-counts.

## Verification

- Post-fix: `commission_schedule` has rows for the Ethos policy — one advance, the deferred balance months, year 2-5 and year 6+ renewals if the Ethos grid carries level "90" rows for that product, and an override leg per upline.
- Finances totals and the reconciliation page show non-zero pending amounts.
- Re-running the calculation for the same policy changes amounts in place and creates no duplicates.

## Technical notes

- `src/lib/commission-calculator.ts`: `payment_type: "as_earned"` → `"deferred"`.
- Migration: replace `uq_commission_schedule_idempotency` with a non-partial unique index; widen `commission_schedule_org_modify` WITH CHECK to include `is_in_downline(agent_id, auth.uid())`-style upline payees within `my_org_ids()`; add an agent-scoped write policy on `commission_setup_issues` (`agent_id = auth.uid()`).
- Backfill via a one-off admin server function call using the existing `calculateAndInsertAllCommissions`, not new logic — it stays the single source of truth for commission rows.
- Renewals depend on the Ethos grid having rows for carrier level "90" and this product; if none match, the plan's UI change will say "no renewal grid row" rather than silently paying nothing.
