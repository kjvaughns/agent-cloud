## Goal
Tighten the admin contracting/commissions workflow and make book-of-business imports auto-provision contracts + comp assignments.

## 1. Backfill commission grids for all carriers
- Add admin server fn `adminBackfillCommissionGrids` that, for every active carrier missing `commission_grids` rows, inserts a default level ladder (e.g. `Street 50% / 70% / 90% / 110% / 130% / 150%` with renewals `years_2_5_pct = 5`, `years_6_plus_pct = 3`) so the comp-level editor always has selectable levels.
- Surface as a one-click "Backfill missing grids" button on `admin.carriers.tsx` (and run once now via the same fn).
- Idempotent: only inserts levels that don't already exist per `(carrier_id, level_name)`.

## 2. Promote info@kingofsales.net to 150% on every carrier
- Add admin server fn `adminAssignAllCarriers({ agent_id, pct, level_name })` that:
  - Loads all active carriers.
  - Upserts `agent_commission_levels` rows for that agent at the given pct/level for every carrier (insert if missing, update if existing).
  - Also inserts `contract_requests` rows with `status = 'active'` for any carrier the agent doesn't already have a contract row for (so the Contracts page reflects reality).
- Run it once for `info@kingofsales.net` at `150% / "Executive 150"`.
- Add a "Set across all carriers" button in `CompLevelEditor` (admin-only) for reuse.

## 3. Editable writing numbers everywhere
- `admin.contracts.tsx` already has inline writing-number edit — keep.
- Add a `writing_number` column to `agent_commission_levels` (nullable text) plus an inline editor in `CompLevelEditor` per carrier row, saved via the existing `adminSetCompLevel` fn (extend payload).
- Mirror the value back into `contract_requests.writing_number` for the same `(agent_id, carrier_id)` when set, so both views stay in sync.

## 4. Auto-provision pending contracts + comp assignments on import
- In `admin-import.functions.ts` (and any agent-facing import path used for book-of-business), after policies are inserted, for the importing agent:
  - Collect distinct `carrier_id`s from the imported policies.
  - For each carrier without an existing `contract_requests` row → insert one with `status = 'requested'`, `notes = 'Auto-created from import'`.
  - For each carrier without an existing `agent_commission_levels` row → insert one with `assigned_pct = NULL`, `commission_level = NULL`, flagged `pending = true` (new boolean column) so admin sees it as "needs assignment".
- Admin agents detail view surfaces the pending rows with a "Set level" CTA (already wired via `CompLevelEditor` — just visually flag pending ones).

## 5. Recalculate commissions after step 2
- After assigning info@kingofsales.net across carriers, run the existing recalc fn so override chain + direct commissions populate for already-imported policies.

## Technical notes
- Schema changes (single migration):
  - `agent_commission_levels`: add `writing_number text`, `pending boolean default false`.
  - No new tables.
- New server fns (in `src/lib/admin.functions.ts`):
  - `adminBackfillCommissionGrids()`
  - `adminAssignAllCarriers({ agent_id, pct, level_name })`
  - Extend `adminSetCompLevel` to accept `writing_number` and sync to `contract_requests`.
- Import changes in `src/lib/admin-import.functions.ts` post-insert hook; same logic added to any agent self-import path.
- UI:
  - `admin.carriers.tsx`: "Backfill grids" button.
  - `CompLevelEditor`: writing-# input per row, "Set across all carriers" button, pending badge.

## Out of scope
- Renewal-rate accuracy per carrier (defaults applied; can be tuned later).
- Migrating to richer role enum.
- Building a separate "pending contracts" page (existing Contracts page filtered to `requested` already covers it).