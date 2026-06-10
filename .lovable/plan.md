# Commission System Fix + Finances/Dashboard Overhaul

## Goal
Commissions are currently broken: posting a deal writes 0 commission rows, the upline never gets overrides, no renewals are scheduled, and the Finances/Dashboard pages show wrong (often zero) numbers. This plan fixes calculation, backfills all existing policies, and rebuilds the displays that read this data.

## Scope

### 1. Database migration
- Add missing columns to `commission_schedule`: `commission_pct`, `advance_pct`, `annual_premium`, `client_name`, `writing_agent_id`, `writing_agent_name`, `policy_year`, `month_number`.
- Add indexes on `(agent_id, payment_date)` and `(policy_id)`.
- Mark GTL carrier rows: `advance_cap='fixed'`, `advance_cap_amount=600`, `advance_cap_months=6` (match by name ILIKE GTL / Guarantee Trust Life).
- Note: `commission-calculator.ts` already implements most of the spec. Keep it but extend renewal lookup fallback (current code only matches on `level_name`; add a `year_1_pct <= agentPct` fallback).

### 2. Commission calculator
- Keep existing `src/lib/commission-calculator.ts` as the single source of truth.
- Patch the renewal grid lookup to fall back to the best-matching `year_1_pct` row when no `level_name` match exists.
- Confirm override walk works for N levels (current code already loops upline chain — verify behavior).

### 3. Wire calculator into every policy-create path
Currently only `postDeal` is wired. Audit and add calls to:
- `src/lib/pipeline.functions.ts` → `addPolicy` (and any other inserts into `policies`).
- `src/lib/admin-import.functions.ts` → XLS import policy inserts.
- `src/lib/import-helpers.ts` → basic AgentLink import.
- Any other place that inserts into `policies` (will grep before editing).

### 4. Backfill existing policies
One-time script (server function callable from admin, OR a SQL migration block) that:
- Deletes existing rows from `commission_schedule` where `commission_pct IS NULL` (legacy/incomplete rows).
- Iterates every `policies` row with `annual_premium > 0` and calls the calculator logic.
- Idempotent: skip policies that already have schedule rows with the new columns populated.

### 5. Finances page rebuild
File: `src/routes/_authenticated/finances.tsx` + `src/lib/finances.functions.ts`.
- Update `getFinancesData` to return the new columns (mostly done — verify).
- Rebuild stat tiles: Direct YTD (paid), Override Pending, Trail+Renewal Pending, 90-Day Forecast.
- Type filter: Advance / Trail / Override / Renewal.
- `PayoutRow` shows: type badge, advance%, commission%, client/agent name, carrier, product, policy#, annual premium, status, "Month X of policy" or "Policy Year X" labels, GTL cap note.
- 12-month forecast chart with 4 series (direct/override/trail/renewal).

### 6. Dashboard / Pipeline / everywhere ALP-or-sale-size is shown
- Inspect `get_dashboard_metrics` RPC: confirm `my_prod` = policies where `agent_id = auth.uid()` and `team_prod` = strictly-downline (excludes self) to prevent double counting.
- Audit other places that show ALP / sale size / commission:
  - `src/routes/_authenticated/dashboard.tsx`
  - `src/routes/_authenticated/pipeline.tsx` and sold tab
  - `src/routes/_authenticated/leaderboard.tsx`
  - `src/routes/_authenticated/analytics.tsx`
  - `src/components/book-of-business/policy-detail-sheet.tsx`
  - `src/components/pipeline/client-detail-drawer.tsx` (sold tab earnings)
- Where they currently compute commission ad-hoc from `monthly_premium × 12 × someGuess`, switch to summing `commission_schedule` for the current user (or for the policy in detail views).

## Technical details

### Migration shape
```sql
ALTER TABLE public.commission_schedule
  ADD COLUMN IF NOT EXISTS commission_pct numeric,
  ADD COLUMN IF NOT EXISTS advance_pct numeric,
  ADD COLUMN IF NOT EXISTS annual_premium numeric,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS writing_agent_id uuid,
  ADD COLUMN IF NOT EXISTS writing_agent_name text,
  ADD COLUMN IF NOT EXISTS policy_year int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS month_number int;

CREATE INDEX IF NOT EXISTS commission_schedule_agent_date_idx
  ON public.commission_schedule (agent_id, payment_date);
CREATE INDEX IF NOT EXISTS commission_schedule_policy_idx
  ON public.commission_schedule (policy_id);

UPDATE public.carriers
   SET advance_cap='fixed', advance_cap_amount=600, advance_cap_months=6
 WHERE name ILIKE '%guarantee trust life%' OR name ILIKE '%GTL%';
```

### Backfill approach
Add admin server function `backfillCommissions` that:
1. Deletes existing rows in `commission_schedule` (clean rebuild — safest because most current rows are missing new columns and amounts may be wrong).
2. Selects all `policies` with `annual_premium > 0` and `agent_id IS NOT NULL`.
3. Calls `calculateAndInsertAllCommissions` for each.
4. Returns count of policies processed and rows inserted.

Expose as an "Admin → Recalculate commissions" button on `/admin` (or auto-trigger once via migration if you prefer). Recommend the button approach so it's repeatable.

### Files touched
- `supabase/migrations/<new>.sql` — schema + GTL flag.
- `src/lib/commission-calculator.ts` — renewal grid fallback fix.
- `src/lib/pipeline.functions.ts` — wire calculator into `addPolicy`.
- `src/lib/admin-import.functions.ts` — wire calculator into XLS import.
- `src/lib/import-helpers.ts` — wire into basic AgentLink import.
- `src/lib/admin.functions.ts` — add `backfillCommissions` server fn.
- `src/routes/admin.index.tsx` (or `admin.commissions.tsx`) — add backfill button.
- `src/lib/finances.functions.ts` — return new columns.
- `src/routes/_authenticated/finances.tsx` — tiles, filter, row, chart rebuild.
- `src/routes/_authenticated/dashboard.tsx` — verify production split.
- Pipeline/leaderboard/analytics/book-of-business views — switch commission readouts to `commission_schedule` aggregates.

## Out of scope
- Changing existing RLS policies on `commission_schedule` (already correct).
- Editing the legacy `generate_commission_schedule` Postgres trigger — calculator runs in app code; trigger is a no-op since policies inserted via app go through TS path. (Will verify it doesn't fire and create dupes; if it does, drop it in the same migration.)

## Confirmations needed
1. Backfill: nuke all existing `commission_schedule` rows and rebuild from `policies`, or only fill in policies that have no rows? (Recommend nuke+rebuild since current rows are wrong.)
2. The legacy `generate_commission_schedule` DB trigger — should I drop it in the migration to avoid double-writes? (Recommend yes.)
