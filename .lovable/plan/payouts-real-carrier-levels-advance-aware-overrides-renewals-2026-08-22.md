# Payouts: real carrier levels, advance-aware overrides, renewals

## What's wrong today

Checked the calculator (`src/lib/commission-calculator.ts`) and the compensation resolver (`src/lib/compensation/resolve.ts`, `lookup.server.ts`):

- **Personal money is already right.** $100/mo on a 6-month advance at 60% pays $360 up front and the remaining $360 split across months 7-12. Nothing to change there.
- **Overrides ignore the advance.** An upline's spread is paid as one lump on the effective date at the full annual amount — 30% of $1,200 = $360 on day one. It should be $180 advanced now and $180 trailed across months 7-12, exactly like the writing agent's money.
- **Uplines are priced off flat percentages, not the carrier grid.** The upline chain resolves each person without the deal (no product, age, state, risk class), so an upline whose real carrier level comes from the comp grid gets the flat agency-level number instead. The writing agent gets grid pricing; their upline does not — which is how a 90 vs 60 spread comes out wrong.
- **Renewals silently don't exist** unless the carrier's grid happens to carry a policy-year-2 row. There is no fallback anywhere in the codebase.

## What gets built

**1. Advance-aware overrides**

Each upline leg is split by the same advance the writing agent is on:

```text
$100/mo x 12 = $1,200 ALP        6-month advance -> 50% commissionable now
Agent    60%      -> $360 advance (month 0) + $360 trail (months 7-12)
Upline   90%-60%  -> $180 advance (month 0) + $180 trail (months 7-12)
```

A 9-month advance advances 75% and trails the rest across months 10-12; "as earned" advances nothing and pays all 12 months. Override trail rows are written as `payment_type: "override"` with the month number set, so Finances keeps showing them as overrides rather than as the agent's own deferred pay.

**2. Uplines priced on their actual carrier level**

The upline chain resolves with the same deal facts and grid rows the writing agent used, so an upline on a 90 comp grid row for that carrier/product resolves to 90 and the spread is a real 30 points. Resolution order is unchanged (contract override -> level + carrier mapping -> grid -> level base), and an upline with no resolvable level is still skipped rather than treated as zero.

**3. Renewals with editable agency defaults**

Two new fields on Agency settings, pre-filled with your numbers:

- Default renewal % (personal production) — 3%
- Default override renewal % — 1%

Whenever a carrier's grid has no renewal row for the policy year, these fill in. A grid renewal row still wins where the carrier publishes one, so nothing you've uploaded gets overridden by a default.

Schedule stays the annual one already in place: months 13, 25, 37, 49, 61, 73, 85, 97, 109, 121. Each renewal pays the writing agent their renewal % of ALP, and **every upline in the chain gets the override renewal % of ALP** at each renewal — 1% each, not 1% split.

**4. Where the money came from, in words**

Each renewal and override row records whether its percentage came from the carrier grid or the agency default, so a payout can be explained rather than argued about.

## Technical notes

- Migration: `renewal_pct_default numeric` and `override_renewal_pct_default numeric` on `organization_settings` (defaults 3 and 1), plus the matching Zod fields and inputs in `src/lib/org-settings.functions.ts` and the Agency settings page.
- `resolveOverrides` in `src/lib/compensation/resolve.ts` gains the advance months and monthly premium so each leg returns `{ advanceAmount, trailAmount, trailMonths }` instead of one lump — pure, so the arithmetic is testable without a database.
- `loadUplineChain` in `src/lib/compensation/lookup.server.ts` takes the optional `{ grid, deal }` and forwards it to `resolveForAgent`.
- The calculator writes override advance (month 0), override trail (months after the advance window), personal renewals and override renewals, all through the existing `idempotency_key` so recalculating a policy corrects amounts in place and never duplicates a payment.
- Existing policies are recalculated with the current backfill path (`scripts/backfill-commissions.ts`) so your book reflects the new math.
- A check script (`scripts/payout-math-check.ts`) asserts the worked example above end to end: 6-month, 9-month, 12-month and as-earned, plus renewal months and per-upline renewal amounts.
