## Enablement nav restructure

Reorganize the **Enablement** section into three tabs:

1. **Resources** — New Agent Guide, Agent Handbook, Scripts, State Licenses, Agent Academy
2. **Advanced Market** — Case Design, Advanced Desk
3. **Marketing** — Recruiting Funnels, Client Marketing, Marketing Tracker (unified)

### Changes

- Update `src/components/app-sidebar.tsx` (Enablement group) to the three tabs above with the sub-items listed.
- Rename the existing **Recruiting Tracker** route to a generic **Marketing Tracker** that supports both recruiting and client-marketing entries:
  - Rename file `src/routes/_authenticated/enablement/recruiting-tracker.tsx` → `marketing-tracker.tsx` (route path `/enablement/marketing-tracker`).
  - Update page title/copy to "Marketing Tracker" and add a **Type** filter/column with values `Recruiting` and `Client`.
  - Add a `type` column (default `recruiting`) to the underlying tracker table via migration so existing rows are preserved; backfill existing rows to `recruiting`.
  - Update any inserts/list queries to include `type`, and add a toggle in the new-entry form.
- Add a redirect from the old `/enablement/recruiting-tracker` path to `/enablement/marketing-tracker` so existing links don't 404.
- Leave all other Enablement pages untouched (only nav grouping + tracker rename).

No design changes to other pages, no commission/finance logic touched.