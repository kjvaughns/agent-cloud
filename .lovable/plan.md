# Make Finances accurate and auditable

## Confirmed problems

The live schedule has 8,528 rows totaling $664,337.44, but every row is still marked `pending`. The Finances page nevertheless calls $300,777.06 dated through today “earned,” so scheduled estimates are being presented as actual payments.

The other confirmed issues are:

- The personal ledger uses one non-paginated read. Kaeden alone has 4,751 live schedule rows, so the KPIs, charts, and breakdowns can silently omit most of the ledger.
- All 420 policies have schedules regardless of policy disposition. Lapsed, cancelled, withdrawn, not-taken, postponed, and carrier-N/A policies still carry $52,583.08 of future payments.
- Renewal projections total $185,305.60. The engine creates default renewals for 419 policies through policy year 11, although the UI says years 2–10.
- 197 policies are still using provisional compensation because their carriers are not configured. Those estimates are mixed into ordinary commission totals with no visible distinction.
- The team report applies its selected date window, while the personal carrier/product breakdowns use lifetime rows and the “By Month” tab uses only the next 12 months. Adjacent totals therefore answer different questions.
- The calculator accepts `annualPremium` but discards it and always rebuilds annual premium as monthly premium × 12. The current imported rows happen to match, but future annual/modal cases will be wrong.
- Month arithmetic can roll dates such as January 31 into March, and per-month rounding can leave a few cents over or under the intended commission.
- GTL cap metadata is only partially applied; override rows are also incorrectly marked non-GTL.
- The explanation panel still documents obsolete fixed 75/25 and GTL formulas rather than the configured contract/carrier terms actually used.

## Repair

### 1. Establish one money vocabulary

Split every figure into explicit, non-overlapping states:

- **Projected** — eligible future schedule rows.
- **Scheduled to date** — eligible rows whose scheduled date has arrived, but which are not confirmed paid.
- **Paid** — only rows confirmed from a carrier statement or an explicit payment action.
- **Stopped / reversed** — rows suppressed because the policy no longer qualifies.

Do not relabel a pending row as paid or earned merely because its date passed. Use the same definitions in personal KPIs, the agency income report, exports, charts, and breakdown tables.

### 2. Fix the ledger reads and range consistency

- Page through the complete personal ledger just as the agency report already does.
- Move range/status/type filtering into the server query and return shared summaries so every section uses the same source rows.
- Give the personal overview and all breakdown tabs one visible date-range control.
- Make “By Month” use the selected range; reserve the next-12-month dataset for the forecast chart only.
- Ensure paid rows are excluded from pending totals and today is not counted again in “next 90 days.”

### 3. Make policy status control future money

- Define payout eligibility centrally and apply it whenever a policy status changes.
- Keep projections for submitted/in-review/issued-not-paid/active policies according to the existing workflow.
- Stop future deferred, override, and renewal rows for lapsed, cancelled, withdrawn, not-taken, postponed, and carrier-N/A policies without deleting history.
- Preserve already confirmed statement payments; record reversals/chargebacks rather than silently erasing paid history.
- Re-enable future rows only through an explicit recovery/reactivation recalculation.

### 4. Correct schedule generation

- Honor the supplied annual premium and derive it from monthly premium only when annual premium is absent.
- Generate renewals for the documented policy years 2–10, eliminating the current year-11 row.
- Use configured carrier/grid renewal rates where available. Keep agency defaults as clearly labeled projections, not confirmed income.
- Keep provisional, unconfigured-carrier schedules visibly provisional and exclude them from “paid” figures.
- Apply carrier cap metadata consistently to applicable direct and override schedules and preserve the correct carrier classification on every leg.
- Use end-of-month-safe date arithmetic.
- Put any rounding remainder on the final deferred payment so each policy’s year-one direct rows exactly equal annual premium × resolved rate.
- Recalculate when premium, carrier, effective date, writing agent, contract level, advance option, or relevant grid terms change.

### 5. Make each number explainable

For every payout row expose:

- policy and writing agent;
- annual premium used;
- compensation percentage and source;
- advance option and source;
- projected/paid/stopped state;
- provisional/default-rate warning where applicable;
- formula components for direct, override, and renewal amounts.

Replace the stale fixed-formula accordion with the actual rules used for the selected row or policy.

### 6. Backfill safely

- Snapshot aggregate totals and per-policy schedules before recalculation.
- Recalculate all policies through the existing `calculateAndInsertAllCommissions` path; do not introduce a second commission writer.
- Supersede obsolete year-11 renewals and future rows for ineligible policies rather than deleting them.
- Preserve carrier-statement matches and confirmed payment history.
- Produce a reconciliation report showing changed policies, old/new totals, stopped future money, provisional policies, and unresolved setup issues.

## Verification

- Kaeden’s full 4,751-row ledger is available without truncation.
- Personal, team, carrier, product, month, export, and schedule totals reconcile for the same filters.
- No pending row is labeled paid or earned solely because its date passed.
- Dead policies contribute no future projected payout; paid history remains intact.
- Renewals stop at policy year 10 and use either a named grid rate or a visibly provisional agency default.
- For every policy, year-one direct commission equals the premium basis × resolved percentage to the cent.
- Re-running recalculation creates no duplicate live rows and leaves unchanged schedules unchanged.
- Reconciliation against a carrier statement can move matched rows to paid and retain chargebacks as negative actuals.

## Technical scope

- `src/lib/finances.functions.ts`: paginated/filtered ledger reads and canonical summary buckets.
- `src/routes/_authenticated/finances.tsx` and `src/components/finances/income-report.tsx`: consistent range semantics, labels, breakdowns, and formula details.
- `src/lib/commission-calculator.ts` and `src/lib/compensation/resolve.ts`: premium basis, renewal horizon, dates, rounding, cap handling, and provenance.
- Policy update/sync paths: status-aware superseding/reactivation and recalculation triggers.
- Reconciliation functions and a database migration: explicit schedule state transitions while retaining immutable history.
- One-off audited backfill using the canonical calculator, followed by aggregate and per-policy checks.
