## Plan

1. **Make finances display earned commissions correctly**
   - Update the Finances KPIs so Direct YTD / MTD / YTD count commission rows whose `payment_date` is due, even if the row is still marked `pending`.
   - Keep future trail/renewal/override rows as pending/forecasted.
   - This directly fixes the current “0 direct” problem: the database already has direct commission schedule rows for `kjvaughns13@gmail.com`, but the UI only counts rows marked `paid`.

2. **Base commission generation on Book of Business annual premium**
   - Update the commission calculator to prefer `policies.annual_premium` from the book of business.
   - Fall back to `monthly_premium * 12` only when annual premium is missing.
   - This prevents inaccurate totals when imported annual premium and monthly premium do not perfectly match.

3. **Use the writing agent’s carrier commission level as the authority**
   - Rebuild commission schedule rows from `policies.agent_id + policies.carrier_id -> agent_commission_levels`.
   - For direct commissions, use the writing agent’s `assigned_pct` for that carrier.
   - For overrides, walk the writing agent’s upline and use each upline’s carrier-specific level to calculate only the spread above the downline.

4. **Stop silent zeroes when a policy cannot calculate**
   - Improve the admin recalculation result to report policies skipped because of:
     - missing carrier
     - missing/blank premium
     - missing writing-agent commission level
   - This makes it obvious why anything still calculates as zero instead of silently skipping.

5. **Fix import order so new imports provision first, then calculate**
   - During book-of-business import, auto-create pending carrier contracts/commission assignments before attempting commission calculation.
   - If the assignment has no percentage yet, mark it pending and skip calculation with a visible reason.
   - Once admin sets the percentage, recalculation will populate the schedule.

6. **Run the one-time data refresh for `kjvaughns13@gmail.com`**
   - After the code changes, recalculate commissions from the existing book of business.
   - Current database check shows:
     - 80 policies
     - 79 calculable policies
     - 1 policy missing carrier
     - about `$89,115` expected direct year-one commission from the book of business + current carrier levels
   - The UI should then show direct/YTD values instead of zero.

## Technical notes

- Files to update:
  - `src/lib/commission-calculator.ts`
  - `src/lib/admin.functions.ts`
  - `src/lib/admin-import.functions.ts`
  - `src/routes/_authenticated/finances.tsx`
- No new tables are needed.
- No schema migration is expected unless we decide to add a dedicated `writing_agent_id` column later; for this fix I’ll use the existing `policies.agent_id` as the writing agent source.