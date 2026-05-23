## My Team — Team Command Center

Replace the mock `src/routes/_authenticated/team.tsx` with a full database-backed implementation across three tabs (Overview, Roster, Organization).

### 1. Database migration

New columns / tables:
- `profiles.status` (text, default `'pending'`) — values: `active | pending | inactive | terminated`.
- `profiles.last_active_at` (timestamptz, nullable).
- `reminder_log` table: `id, agent_id, sent_by, sent_at` — enforces 1 reminder per agent per 24h. RLS: sender can read/insert own rows; downline visibility for managers.

Trigger:
- `bump_last_active()` AFTER INSERT on `policies`, `call_logs`, `sms_messages` (via conversation join) — sets `profiles.last_active_at = now()` for the acting agent.

RPC functions (SECURITY DEFINER, search_path=public):
- `get_team_downline()` → recursive CTE returning `id, first_name, last_name, email, phone, upline_id, status, last_active_at, created_at, depth_level, contracts_count, policies_count, premium_total, completion_pct`.
- `get_team_kpis()` → `{ total, active, active_writers (sold last 30d), pending, contracts_total, contracts_active_pct, depth_distribution: [{level, count}], max_depth }`.
- `get_team_alerts()` → returns 3 alert kinds: stale_login (last_active_at < now()-14d), lapse_pending agents, stuck contract_requests (status='issue', 7d+).
- `get_activation_queue()` → downline agents with `completion_pct < 100`, plus `missing: text[]` derived from producer_documents (eo_certificate, banking, drivers_license, aml_certificate) + profile fields.
- `send_reminder(target_agent uuid)` → checks reminder_log throttle; inserts notification + reminder_log row; returns `{ok, reason}`.

Completion % weights match spec (NPN 10 / DOB 5 / address 10 / E&O 20 / banking 15 / DL 10 / AML 20 / signed agreement 10). NPN + signed agreement aren't on schema yet — treat as 0 for now (max achievable 85%) and note in code; alternative is to add `profiles.npn` later.

### 2. Server functions (`src/lib/team.functions.ts`)

Auth-protected via `requireSupabaseAuth`, each wraps an RPC call:
- `getTeamOverview` → kpis + alerts + activation queue + new agents (7d) + recently active (top 10 by last_active_at).
- `getTeamRoster({ search, status, depthLevel })` → filtered downline.
- `getTeamOrg` → downline as nested tree (built from flat CTE result client-side or server-side).
- `getAgentDetail(agentId)` → profile + contracts list + production breakdown + last 5 activity items.
- `sendAgentReminder(agentId)` → calls RPC, returns throttle status.
- `deactivateAgent(agentId)` → sets status='terminated' (manager/admin only; enforced by `has_role` check inside fn).

### 3. Frontend (`src/routes/_authenticated/team.tsx` + components)

Route file owns header + Tabs. Extract subviews into `src/components/team/`:
- `team/kpi-row.tsx` — 5 KpiCards.
- `team/depth-chart.tsx` — horizontal bar chart (plain divs, no extra dep).
- `team/activation-queue.tsx` — agent cards with missing-items list, Send Reminder + View Profile buttons.
- `team/new-agents.tsx`, `team/recently-active.tsx`, `team/team-alerts.tsx`.
- `team/roster-table.tsx` — search + filters + sortable paginated table (25/page, client-side pagination over fetched downline).
- `team/agent-detail-drawer.tsx` — right-side Sheet, 400px, sections: profile completion, contracts, production, recent activity, actions.
- `team/org-chart.tsx` — custom recursive tree:
  - Root = current user, recursive child render of downline tree.
  - Container with `transform: scale(zoom) translate(x,y)`; `+ / - / Reset` controls; pointer drag-to-pan handler.
  - Node card: avatar initials, name, status dot, contracts count; left border color by status.
  - Click node toggles subtree expand/collapse (local Map<id, bool>).
  - Hover → Tooltip with email, production, policies, last active, View button → opens detail drawer.
  - Default state for >50 agents: only L1 expanded.

Page header:
- Title "Team Command Center", subtitle "{total} agents · {maxDepth} depth level".
- `[+ Invite]` button → `navigate({to: "/contracting/invite"})` (route already exists in contracting/).

UX details:
- Default tab = `overview`.
- Skeleton loaders on each section while queries load.
- Empty state for zero downline: CTA card → invite link.
- Sidebar badge: read activation queue count via shared TanStack Query key so `app-sidebar` can show `My Team (X)` — add a small `useActivationQueueCount` hook, wire into the existing sidebar item.
- Toasts via `sonner` for Send Reminder (success / "already sent today" / error).
- Mobile: tabs become a `Select`; roster table degrades to card list.

### 4. Files to create / edit

Create:
- `supabase/migrations/<timestamp>_team_command_center.sql`
- `src/lib/team.functions.ts`
- `src/components/team/*.tsx` (kpi-row, depth-chart, activation-queue, new-agents, recently-active, team-alerts, roster-table, agent-detail-drawer, org-chart, index re-exports)

Edit:
- `src/routes/_authenticated/team.tsx` — full rewrite.
- `src/components/app-sidebar.tsx` — wire activation-queue badge count.

### Out of scope (per prior decisions)
- No email sending (notifications only).
- No edge functions / cron.
- No wallet interaction.

### Technical notes
- All downline data flows through `is_in_downline` / new RPCs — RLS unchanged on base tables.
- Org chart uses pure CSS/flex + transform; no new npm dependency.
- `last_active_at` trigger uses `SECURITY DEFINER` to update profiles regardless of caller's RLS.
- Reminder throttle: `WHERE sent_at > now() - interval '24 hours'` inside RPC, returns `{ok:false, reason:'throttled'}` instead of raising.
