# Rebuild Finances around the real payout model

## Confirmed problems

- The calculator currently creates schedules for advance, deferred/trail, override, and renewal, but the Finances page treats any pending row dated through today as earned even though all 8,528 live rows are still marked pending.
- The personal ledger is fetched in one request while the team report is paginated, so high-volume ledgers can be silently truncated.
- Inactive policy statuses still carry future trail and renewal projections because status changes do not stop future schedule rows.
- `annualPremium` is accepted by the calculator but discarded in favor of monthly premium × 12.
- The current renewal list includes month 121 (policy year 11), regardless of whether that carrier grid actually defines that year.
- Date arithmetic uses JavaScript month rollover, which can shift policies issued on the 29th–31st into the wrong month.
- The page’s explanation and adjacent reports use conflicting formulas, date windows, and meanings for earned, pending, and projected.

## Correct payout model

Every policy produces only four kinds of compensation:

1. **Advance** — paid from advanceable premium.
2. **Override** — each upline’s carrier-level spread, paid on the same advance/trail timing as the writer.
3. **Trail** — monthly as-earned compensation after the advance window, only while premium continues.
4. **Renewal** — annual anniversary compensation from the carrier grid for that policy year, only while premium continues.

For a $100 monthly / $1,200 ALP policy, 80% writer, 9-month advance:

```text
Advanceable premium: $1,200 × 9/12 = $900
Writer advance:      $900 × 80% = $720
Writer trail:        $100 × 80% = $80 in policy months 10, 11, and 12
Year-2 renewal:      $1,200 × carrier grid year-2 renewal %
```

For uplines at 100% and 125%:

```text
Upline 1 spread: 100% - 80%  = 20%
Advance: $900 × 20% = $180; trail: $20 in months 10, 11, 12

Upline 2 spread: 125% - 100% = 25%
Advance: $900 × 25% = $225; trail: $25 in months 10, 11, 12
```

The override spread is calculated between consecutive payable carrier levels in the chain. A non-increasing level earns no override, and the hierarchy cannot pay more than the highest carrier level.

## Repair

### 1. Correct schedule arithmetic

- Use annual premium as the premium basis when supplied; derive it from monthly premium only when absent.
- Advance = `ALP × advance months / 12 × compensation rate`.
- Trail = `monthly premium × compensation rate` for each remaining policy month through month 12.
- Use policy-month semantics explicitly: a 9-month advance produces trail on the 9th, 10th, and 11th monthly anniversaries (policy months 10–12), followed by the first renewal on the 12th monthly anniversary (start of policy year 2).
- Apply that same advance window to every override spread.
- Resolve the writer and each upline against the same carrier, product, age, state, risk class, and policy year.
- Use end-of-month-safe anniversary dates.
- Put any rounding remainder on the final trail installment so year-one compensation reconciles to the cent.

### 2. Calculate renewals from the carrier grid

- On each annual anniversary, resolve the carrier grid row for that agent’s carrier level and that policy year.
- Personal renewal = `ALP × personal renewal rate for that policy year`.
- Renewal override = `ALP × that upline’s renewal-override rate for that carrier and policy year`.
- Do not present a flat agency fallback as an ordinary carrier renewal when the grid is missing. Flag the policy as needing renewal setup and omit a guaranteed renewal amount until configured.
- Stop at the last policy year configured by the carrier grid rather than generating an unconditional lifetime schedule.

### 3. Make trail and renewal conditional on premium persistence

- Persist and use the carrier status effective date supplied by carrier sync or status history.
- When a policy becomes lapsed, cancelled, withdrawn, not-taken, postponed, or carrier-N/A, supersede every unpaid trail, override-trail, and renewal due on or after that carrier status date.
- Preserve advances and payments confirmed before that date; do not erase history.
- If a carrier reports reinstatement, recalculate only eligible future installments from the reinstatement/status-effective date.
- Submitted, in-review, issued-not-paid, and lapse-pending schedules remain projected—not paid—until carrier evidence confirms eligibility.

### 4. Establish one money vocabulary

- **Projected** — an eligible future advance, override, trail, or renewal.
- **Due / unconfirmed** — its scheduled date arrived, but no statement confirmed payment.
- **Paid** — matched to a carrier statement or explicitly reconciled.
- **Stopped / reversed** — suppressed after a carrier status date or represented by a carrier-statement chargeback.

Never call a pending row paid or earned just because its date passed. Keep provisional estimates from unconfigured carriers visibly separate from configured compensation.

### 5. Fix Finances totals and filtering

- Page through the complete personal ledger.
- Give personal and team reports one shared date range and one shared eligibility/status definition.
- Apply the same filtered rows to headline totals, carrier/product/month breakdowns, exports, and ranked reports.
- Keep future projections out of paid totals, paid rows out of pending totals, and today out of “next 90 days.”
- Use historical selected-range data for “By Month”; reserve the next-12-month dataset for forecast only.
- Label the four categories exactly as Advance, Override, Trail, and Renewal.

### 6. Make every amount explainable

Show on each payout row:

- policy, writing agent, and recipient;
- monthly premium and ALP used;
- carrier level, compensation/override spread, and source;
- advance months and advanceable premium;
- policy month/year and scheduled anniversary;
- projected, due, paid, or stopped state;
- formula used and any missing-grid/provisional warning.

Replace the stale fixed-formula explainer with these exact rules and examples.

### 7. Recalculate safely

- Snapshot aggregate totals and per-policy schedules before recalculation.
- Recalculate through the existing single commission calculator only.
- Supersede obsolete rows instead of deleting them.
- Preserve statement matches and confirmed payment history.
- Produce a reconciliation report showing old/new totals, stopped future money, policies missing carrier grids, and changed formulas.

## Verification

- The worked $100/month, 80% writer, 9-month advance example yields exactly $720 advance plus three $80 trails.
- The 100% upline yields $180 advance plus three $20 trails; the 125% upline yields $225 plus three $25 trails.
- First renewal lands on the one-year anniversary and uses the year-2 carrier-grid percentage; later anniversaries use their own configured policy-year rows.
- A carrier-reported lapse stops unpaid trail and renewal rows on or after its effective status date while preserving earlier confirmed payments.
- No pending row is labeled paid or earned solely because its date passed.
- Personal, team, carrier, product, month, export, and payout totals reconcile for identical filters.
- Recalculation creates no duplicate live rows and unchanged schedules remain unchanged.

## Technical scope

- `src/lib/commission-calculator.ts` and `src/lib/compensation/resolve.ts`: premium basis, policy-month dates, advances, trails, consecutive-level overrides, grid renewals, and rounding.
- Compensation grid/lookup code: per-agent, per-policy-year personal and override renewal resolution.
- Policy status and carrier-sync paths: carrier status effective date, stopping/reinstating future rows, and recalculation triggers.
- `src/lib/finances.functions.ts`: complete paginated reads and canonical payout-state/date filtering.
- `src/routes/_authenticated/finances.tsx` and the income report: shared ranges, accurate labels/totals, four categories, and formula provenance.
- A schema migration only where needed for carrier status-effective dates and payout-state provenance, followed by an audited data recalculation through the canonical calculator.