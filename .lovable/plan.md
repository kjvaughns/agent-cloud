# Business Analytics — `/analytics`

A 10-tab analytics suite with AI insights (Lovable AI / Gemini), sales challenges with auto-update triggers, trophy cabinet, and AI coaching.

## Database migration

New tables:
- `ai_insights` — `agent_id`, `insight_type` (needs_attention | learn_from | risk_alert | coaching), `title`, `body`, `action_text`, `action_url`, `dollar_impact numeric`, `agent_name text`, `tab text` (overview | coach), `generated_at`, `dismissed bool`. RLS: owner + downline + admin (same pattern as other tables).
- `analytics_insight_cache` — `agent_id`, `cache_key text` (`overview` | `coach`), `payload jsonb`, `generated_at`. Used for 4h TTL.

Extend `challenges` (already exists with `agent_id`, `period`, `type`, `target_value`, `current_value`, `description`, `created_at`): add `start_date date`, `end_date date`, `completed bool default false`. Existing `trophies` table is fine (`agent_id`, `challenge_id`, `period`, `earned_at`).

Functions / triggers:
- `seed_agent_challenges(_agent uuid)` — RPC that ensures one active row per period (daily/weekly/monthly/quarterly) for the current window. Defaults: 10 calls/day, 3 deals/week, $5000 premium/month, 3 recruits/quarter.
- `bump_challenge_progress()` trigger on `call_logs` (calls), `policies` (deals + premium), `profiles` insert (recruiting for upline). Updates matching active challenge row, marks `completed=true` and inserts trophy when hit.
- `get_analytics_overview(_start, _end)` — KPIs, deltas vs prior period, conversion, monthly growth, top carriers, status grid, persistency approximations.
- `get_daily_report()` — today's activity counts, active agents, lapse-pending list, upcoming effective dates.
- `get_agent_analytics(_agent, _start, _end)` — individual tab data.
- `get_team_leaderboard(_start, _end)` — ranked downline w/ trend arrow vs prior period.
- `get_carrier_breakdown(_start, _end, _agent uuid default null)` — carrier cards + table.
- `get_trends_12mo()` — 12-month series, MoM growth, YTD vs LY, best/worst months.
- `get_policy_analytics()` — status distribution, stacked-area series, at-risk list.
- `get_quality_metrics()` — 13-month persistency (approximation: effective_date <= now - 13mo and status = 'active' / total such policies), 12-month lapse rate, by carrier, by agent.
- `get_recruiting_funnel()` — counts by `recruiting_prospects.stage`, conversion, avg days, monthly onboarded.

## Server functions (`src/lib/analytics.functions.ts`)

Thin wrappers over RPCs + the two AI endpoints:
- `getAnalyticsOverview`, `getDailyReport`, `getAgentAnalytics`, `getTeamLeaderboard`, `getCarrierBreakdown`, `getTrends`, `getPolicyAnalytics`, `getQualityMetrics`, `getRecruitingFunnel`, `getChallenges`, `getTrophies`, `seedChallenges`.
- `getAIInsights({ tab: 'overview' | 'coach', force?: boolean })` — checks `analytics_insight_cache` (4h TTL); if stale or `force`, gathers summary stats, calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with a tool-calling schema returning structured cards, writes cache + rows in `ai_insights`, returns cards. All protected with `requireSupabaseAuth`.

## Frontend (`src/routes/_authenticated/analytics.tsx` + `src/components/analytics/`)

Components:
- `AnalyticsHeader` — title, subtitle, date-range dropdown (state: 7/30/90/YTD/All/custom), `AI Insights` + `Refresh AI` buttons.
- `ChallengeCards` — 4 cards (Daily blue, Weekly green, Monthly purple, Quarterly orange) with animated progress fills; gold border + confetti when 100%.
- `TrophyCabinet` — summary row + dot breakdown + "View All" modal (3-col grid, sorted newest).
- Tabs (shadcn `Tabs`, default `overview`, lazy-mount each panel):
  - `OverviewPanel` — AI insight cards (3 colored variants), 4 KPI cards w/ deltas, conversion + growth large cards w/ small charts, top carriers bar chart + table.
  - `DailyReportPanel` — 4 sections + Generate button (calls `getAIInsights({tab:'daily'})` variant — reuse coach prompt with daily context).
  - `IndividualPanel` — agent dropdown (downline via existing `get_downline_agents`), KPI row, 6-month BarChart, status pie, top-carrier bar, activity timeline.
  - `TeamPanel` — KPI row + leaderboard table (self row highlighted) + stacked bar chart per agent/month.
  - `CarriersPanel` — agent filter + date filter + cards grid + table.
  - `TrendsPanel` — area chart w/ $/# toggle, MoM growth bars, YTD vs LY, best/worst.
  - `PolicyPanel` — status pie + breakdown table + stacked area + at-risk table w/ Follow Up → opens SMS route.
  - `QualityPanel` — persistency/lapse/duration metrics, lapse trend line w/ 15% ref line, carrier + agent quality tables.
  - `RecruitingPanel` — funnel visualization + conversion + monthly bar chart.
  - `AICoachPanel` — `Refresh Coaching` button + 4-6 coaching cards from `getAIInsights({tab:'coach'})` (always last 30d).
- Skeleton loaders during AI fetches; `Export CSV` buttons on Team/Carriers/Quality/Policy tables (client-side CSV).

Charts: Recharts `ResponsiveContainer` everywhere, tooltips on all series.

Confetti: add `canvas-confetti` dep; fire from `ChallengeCard` when newly completed (track via `useRef` of last `completed` per challenge id).

## Sidebar

`src/components/app-sidebar.tsx`: under "My Business", add `Business Analytics` → `/analytics` (BarChart3 icon).

## Out of scope

- No real-time challenge updates beyond DB triggers (page refetches on focus via TanStack Query).
- No sound effects.
- Trophy "earned" modal is a card + confetti, not full-screen takeover.
- Custom date range UI uses two date inputs (no fancy calendar popover beyond shadcn `Calendar`).
- Recruiting funnel pageview/application metrics — schema doesn't track them, so that table is omitted (only the stage funnel + monthly bars).
- AI Daily Tip reuses the coach endpoint with a "daily tip" subtype rather than a third prompt.

## Files

Create:
- `supabase/migrations/<ts>_business_analytics.sql`
- `src/lib/analytics.functions.ts`
- `src/components/analytics/{AnalyticsHeader,ChallengeCards,TrophyCabinet,OverviewPanel,DailyReportPanel,IndividualPanel,TeamPanel,CarriersPanel,TrendsPanel,PolicyPanel,QualityPanel,RecruitingPanel,AICoachPanel,AIInsightCard,KpiCard}.tsx`
- `src/lib/csv.ts` (tiny helper)

Edit:
- `src/components/app-sidebar.tsx` (add nav item)
- `src/routes/_authenticated/analytics.tsx` (rewrite to host new layout)
- `package.json` (add `canvas-confetti` + types)
