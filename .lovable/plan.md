## What I found

- The dashboard and production trend calculate by `posted_at`, but the import wrote every policy with `posted_at = import time`, so the app thinks all imported production happened today.
- Your imported policy `effective_date` values are spread across Jan–Jul 2026, so the source data does have usable dates.
- The downline/pending agents with imported production were created without `upline_id`, so Team Command Center does not include them in your hierarchy.
- Imported policies currently have `carrier_id = null`, so Book of Business can’t show/filter carrier names and carrier/profile matching cannot work.
- Duplicate protection exists mostly for clients, but policy-level duplicate protection is weak and not team-wide enough for future agent uploads.

## Plan

1. **One-time data repair**
   - Link the imported pending downline agents back under your profile so Team Command Center and dashboard hierarchy rollups include their inactive/pending production.
   - Update imported policies so `posted_at` reflects the policy’s effective date for historical production reporting, instead of the import date.
   - Backfill `carrier_id` on imported policies by matching imported carrier/product text to active carrier records.
   - Re-check totals after repair so personal production, team production, policy counts, and date distribution line up with the imported book.

2. **Fix dashboard metrics long term**
   - Update `get_dashboard_metrics` so production KPIs and production trend use `effective_date` as the business date for policies, falling back to `posted_at` only when no effective date exists.
   - Keep “posted/imported date” available where it matters, but stop using it as the primary production date.
   - Make policy count logic consistent so “My Policies” and “Team Policies” use the same date basis and hierarchy scope.

3. **Fix Book of Business display and carrier matching**
   - Update policy list sorting/filtering to prioritize effective date for production views.
   - Ensure policy rows include carrier name by storing and returning `carrier_id`/`carrier_name` correctly.
   - Add robust carrier matching during import using normalized names, common aliases, and active carrier records.

4. **Fix Team Command Center**
   - Ensure pending/inactive imported agents are included in hierarchy RPCs, roster tables, org chart, and production totals.
   - Show inactive/pending agents with their policy counts and production, not just active agents.
   - Make agent detail production use the same effective-date/carrier-aware policy data.

5. **Strengthen import duplicate protection**
   - Add database-level safeguards for policy duplicates where possible.
   - Make import matching team-aware: match duplicate clients/policies across the upline hierarchy, pending-assigned emails, and agents’ own books.
   - Use stronger policy duplicate keys: policy number + carrier when present; otherwise client + effective date + premium + carrier/product.
   - Make future agent uploads avoid duplicating policies already imported under the team/upline.

6. **Import code hardening**
   - Stop writing imported policy `posted_at` as “now” when an effective date is provided.
   - Parse spreadsheet dates deterministically instead of relying on JavaScript’s loose date parsing.
   - Create/link pending agents with the correct upline during import.
   - Store carrier information separately from product information.

7. **Validation**
   - Run read-only checks for:
     - personal production by effective-date period
     - team production by effective-date period
     - policy counts by agent
     - policy counts by month
     - carrier match coverage
     - duplicate-risk rows
   - Confirm dashboard, production trend, Team Command Center, and Book of Business are all using the corrected data path.

## Technical notes

- Main code areas:
  - `src/lib/dashboard.functions.ts`
  - database functions: `get_dashboard_metrics`, `get_team_downline`, `get_book_of_business`
  - `src/lib/admin-import.functions.ts`
  - `src/lib/import-helpers.ts`
  - Team and Book of Business route components if display behavior needs small adjustments
- Data changes will use Lovable Cloud data update tools, not schema migrations unless a unique index/function change is required.