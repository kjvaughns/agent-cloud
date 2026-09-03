# Team income report on Finances

Add a ranked income report at the top of Finances when the scope is Team or Agency, with its own date range, plus an agent dropdown that switches the whole page to that person's finances.

## What you'll see

**1. Income report (top of the page, Team/Agency only)**

A panel above everything else with its own date range picker (This month, Last month, Quarter, YTD, Last 12 months, Custom from/to — the same control the dashboard uses, independent of the rest of the page):

- Ranked list of everyone in scope by income earned in that range: #1, #2, #3…
- Per person: total earned, plus a breakdown into Direct (advance + trail), Override, Renewal, and Pending (scheduled after today in the range).
- A total line for the whole team/agency, and a share-of-total bar per person so the ranking reads at a glance.
- Your own line is marked YOU. Inactive former producers already handled elsewhere are not invented here — this lists people with commission rows.

This replaces the current "What your team earned" table, which had only Paid/Pending and no date control.

**2. Agent dropdown**

Next to the scope toggle, an agent picker (the same one Book of Business uses). Pick a person and the entire Finances page — KPI tiles, forecast chart, month-by-month ledger, carrier and product breakdowns — shows that agent's own commissions instead of yours, with a clear "Viewing Jorge Martinez's finances" banner and a one-click way back to your own. "Everyone" is the default and behaves exactly as today.

Permission stays what it already is: only an agency owner/admin, or a manager whose role has "view agent commissions" enabled, sees other people's pay. Regular agents see no dropdown and no income report — Finances stays personal for them.

## Rules kept intact

- Your own totals never change meaning at any scope. The income report is a separate question presented separately, so an override on a downline policy and their advance on the same policy are never added together.
- Only live schedule rows count (`superseded_at IS NULL`), so a recalculation can't double-count.
- "Earned" means a payment date of today or earlier (matching the existing tiles); anything later is Pending.

## Technical notes

- `src/lib/finances.functions.ts`
  - `getFinancesData` input gains optional `from`/`to` and `agentId`. When `agentId` is set, authorize it first (existing `canSeeTeamPay` plus a check that the id is inside `resolveScopeAgentIds(scope)`), then run the existing `fetchAll` against that id — no new query shapes.
  - Replace `earningsByAgent` with `incomeReport(supabase, agentIds, userId, from, to)`: one `commission_schedule` select (`agent_id, amount, status, payment_type, payment_date`, `superseded_at IS NULL`, `payment_date` between bounds, chunked `in()` for large downlines) aggregated per agent into `{ agent_id, name, total, direct, override, renewal, pending, is_self }`, sorted desc. Includes the caller's own line so the ranking is complete.
  - Rows come back paged past the 1000-row PostgREST cap, since a full agency year exceeds it.
- New `src/components/finances/income-report.tsx`: the ranked panel, using `DateRangePicker` from `@/components/ui/date-range-picker`, `fmtCurrency`, `StatTile`/`Panel` and existing tokens.
- `src/routes/_authenticated/finances.tsx`: add `agent` + `from`/`to` to `validateSearch` so a view is linkable; render `ScopeAgentFilter` beside `ScopeToggle`; pass `agentId` into the query key and server call; drop the old team table in favour of the new panel.
- No schema change and no migration — all of this reads `commission_schedule` as it stands.
