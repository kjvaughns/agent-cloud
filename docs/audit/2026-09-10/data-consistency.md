# Production and financial data consistency — audit 2026-09-10

Canonical rule: `src/lib/production/source.ts:9-44,89` — `SUM(annual_premium)` windowed on
`policies.production_date` (fallback `posted_at`), excluding `withdrawn`, `not_taken`,
`carrier_na`. Server helper: `src/lib/production/source.server.ts` (`selectProduction`).

## Who agrees with the canon

| Consumer | Where | Verdict |
|---|---|---|
| Dashboard tiles/trend | `get_dashboard_metrics` (DB fn) | agrees |
| Dashboard hero | `dashboard.functions.ts:188-241` | agrees |
| v1 production API | `routes/api/v1/production.ts:97-144` | agrees |
| Reports / analytics fns | `get_carrier_breakdown`, `get_agent_analytics`, `get_team_leaderboard`, `get_analytics_overview`, `get_trends_12mo` | agrees (aligned by 20260815030000) |
| Trophy Case | `records/records.ts:114` | agrees on rules, but reads raw rows instead of `selectProduction` |
| Leaderboard written totals | `dashboard.functions.ts:396-436` | **deliberately all statuses** |
| Book of Business | `get_book_of_business` (DB fn) | **no period window, no status filter** |
| Finances commission cards | `dashboard.functions.ts:304-330`, `finances.functions.ts:167-187` | different metric family (`commission_schedule.payment_date`) — not production |

## Measured disagreements (live database)

Month to date, 2026-09-01 → 2026-09-10:

| Variant | Policies | Total ALP |
|---|--:|--:|
| Canonical (`production_date`, 3 statuses excluded) | 26 | $48,597.96 |
| `coalesce(production_date, posted_at)`, no status filter | 27 | $49,911.96 |
| Legacy `posted_at`, no status filter | 30 | $51,912.84 |
| Leaderboard "written" (`production_date`, all statuses) | 27 | $49,911.96 |
| Book of Business as it actually behaves (no window) | 436 | $588,576.84 |

2026-08-24 → 2026-08-30:

| Variant | Policies | Total ALP |
|---|--:|--:|
| Canonical | 27 | $46,763.52 |
| Any no-status-filter variant | 29 | $50,424.72 |
| Windowed on `effective_date` | 15 | $22,556.28 |

So the same week reads $46,763.52, $50,424.72 or $22,556.28 depending on which screen's rule you
use — a 7.8% gap between the dashboard and any all-status view, and a 52% gap against an
`effective_date` window.

## Findings

| ID | Finding | Severity |
|---|---|---|
| C-1 | Leaderboard totals include `withdrawn`/`not_taken`/`carrier_na` (intentional, `dashboard.functions.ts:415-419`) while the KPI row above it on the same page excludes them. Nothing labels the difference. Fix: either match the canon or label the column "written". | High |
| C-2 | Book of Business returns the whole book with every status. That is right for a book, but consumers filter and total it client-side on a field aliased `posted_at` that actually holds `coalesce(production_date, posted_at)` — so any month filter there disagrees with Dashboard for forward-dated sales. Fix: return an explicit `production_date` field and filter/total through the shared helper. | High |
| C-3 | `selectProduction` silently falls back to `posted_at` with no status filter when `production_date` is absent, so an environment missing 20260814250000 reverts to the old wrong numbers with no error. Fix: fail loudly instead. | Medium |
| C-4 | Trophy Case reads policy rows directly (`records.functions.ts:66-86`) rather than through `selectProduction`, so it loses that guard. | Medium |
| C-5 | Two agent sources: `profiles` (18) and `pending_agents` (35), stitched by email match (`book-of-business.functions.ts:57-86`). A changed or duplicate email silently misattributes production. Fix: a real link column populated on signup. | High |
| C-6 | Three hierarchy sources: `profiles.upline_id` (15/18 set), `agency_relationships` (2 rows, org-level), `carrier_hierarchy_records` (0 rows, wired into contracting). Scope computed one way can disagree with the other for multi-org IMOs. | High |
| C-7 | Two contract tables both live and independently written: `contract_requests` (34 rows, read by `dashboard.functions.ts:118`) and `contracting_requests` (38 rows, the contracting-ops workflow table). "Active contracts" counts can legitimately disagree. Needs a documented mapping and one authority. | High |
| C-8 | Comp resolution spans `commission_grids` (366), `agent_commission_levels` (18), `agency_level_carrier_mappings` (28) and empty `carrier_comp_levels` (0). Confirm `carrier_comp_levels` is dead and delete its read paths; keep one "effective rate" resolver (`src/lib/compensation/resolve.ts`). | Medium-High |
| C-9 | `commission_schedule` (13,338 rows) is the ledger every screen reads — consistent between screens, but stale if a premium or level changes without a recompute. Confirm one recompute trigger rather than several. | Medium |
