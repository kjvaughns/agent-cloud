## Problem

Dashboard production tiles are mislabeled relative to what they contain.

The DB function `get_dashboard_metrics` currently returns:
- `my_prod` / `my_policies` — agent's own policies
- `team_prod` / `team_policies` — **downline only** (excludes the agent)

The user wants "Total Production (Team)" to mean the **literal total of the whole team including the agent themselves** (agent + downline), not downline-only.

## Fix

Make `team_prod` / `team_policies` (and the monthly trend `team_*` values) include the signed-in agent's own policies in addition to the downline.

### SQL migration — update `public.get_dashboard_metrics`

Change the KPI and trend aggregates so team totals include self:

```sql
-- kpis
SUM(annual_premium)                 AS team_prod      -- was: SUM(CASE WHEN NOT is_mine THEN annual_premium END)
COUNT(*)                            AS team_policies  -- was: COUNT(*) FILTER (WHERE NOT is_mine)

-- trend
SUM(pol.annual_premium)             AS team_prod
COUNT(pol.id)                       AS team_policies
```

`my_prod` / `my_policies` stay agent-only. Everything else (status grid, donut, active_downline, active_contracts) is unchanged.

### Dashboard UI (`src/routes/_authenticated/dashboard.tsx`)

Keep current labels — they will now be accurate:
- **My View:** "Individual Production (You)" = `my_prod`, "Total Production (Team)" = `team_prod` (now = self + downline), "My Policies" = `my_policies`, "Team Policies" = `team_policies` (self + downline).
- **Agency View:** "Total Agency Production" = `team_prod`, "Total Agency Policies" = `team_policies` (both now correctly include the agent).
- Trend chart legend "Team" stays — line now reflects self + downline.

No other pages or commission logic touched.
