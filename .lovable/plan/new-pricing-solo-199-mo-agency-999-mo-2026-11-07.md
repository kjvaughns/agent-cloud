# New pricing: Solo $199/mo, Agency $999/mo

Agent Cloud becomes the premium product. Licensing, Bankdocs, Release Center and Academy stay as free or included top-of-funnel tools that lead people to it.

## What changes
1. **Checkout prices**: Solo goes from $49 to $199/month and Agency from $399 to $999/month. The existing price IDs (`solo_agent`, `agency_plan`) are replaced in place, so checkout code doesn't change and live gets the new prices on publish.
2. **Site copy**: the landing pricing cards and comparison table, the Solo signup page (text and page description), and Settings → Billing all read from the shared price list, so changing it updates everything. Any hard-coded "$49 solo" text gets fixed.
3. **Positioning copy**: the pricing section and the "One plan, four tools" section say Agent Cloud is the full platform and the sister tools are free extras or included.
4. **Allison**: she quotes $199 / $999, explains the value (no comp cut, no big upfront fee, four tools included), and still never offers discounts.
5. **Current customers**: agencies marked free (Apex, Vantage and the others) keep full access. Anyone already paying the old price stays on it until they change plans.

## Not changing
Nova Pro ($49), sponsored Nova seats ($39) and White Label ($499/mo + $999 setup) stay the same unless you say otherwise.

## Technical details
- `payments--create_price` with id `solo_agent` (19900, monthly, qty 1) and `agency_plan` (99900, monthly, qty 1).
- `src/lib/billing/pricing.ts`: soloAgent 199, agencyBase 999.
- Fix the hard-coded text in `signup_.agent.tsx` and check `allison/knowledge.ts` and the landing components.
- Add a test to `scripts/payments-check.ts` that the price list shows solo = 199 and agency = 999.
