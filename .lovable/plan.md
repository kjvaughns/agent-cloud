# Contracting Command Center

Rebuild Contract Requests as an agent-grouped operations workspace, then layer on permissions, two-way Google Sheets sync (each agency owner signs in with their own Google account), and Discord contracting notifications. Delivered in stages, core first.

## What exists today (verified)

- `contracting_requests` is the operational work item (55 columns) and already carries `writing_number`, `granted_comp_level_id`, `granted_level_name`, `granted_pct`, `granted_advance_option`, `invite_method`, `invite_sent_at`, `activated_at`, plus external-sync columns (`external_provider`, `external_record_id`, `last_synced_at`, `sync_source`, `sync_error`, `integration_metadata`).
- `contract_requests` (different table) is the appointment record that feeds My Contracts and Ready to Sell. Two tables, deliberately separate, documented in `docs/CONTRACTING-OPS-PLAN.md`. No third table will be created.
- `contracting_status_history` already stores from/to status, agent-visible message, internal note, who changed it, and `change_kind / field / old_value / new_value`.
- Status vocabulary lives in `src/lib/contracting-ops/types.ts`: 19 legal values, already folded onto the nine display statuses via `PRIMARY_REQUEST_STATUSES` and `REQUEST_STATUS_META`.
- `role_permissions` already has `contracting_submit`, `contracting_approve`, `contracting_assign_staff`, `contracting_view_audit`, `contracting_view_sensitive_docs`, `contracting_manage_*`, `contracting_export`.
- The current list page (`contracting-ops/requests/index.tsx`) renders one row per carrier request, loads all rows into the browser, and filters client-side.
- Discord automations support three events only (`sales`, `announcements`, `new_agents`) in `src/lib/discord/message.ts`, with `discord_integrations.post_*` boolean columns.
- No Google Sheets code exists in the app.

## Stage 1 — Data model and reads (no UI change)

- Migration: add `contracting_requests.decline_reason` usage check (column exists), plus indexes for the new access patterns (`organization_id, agent_id`, `organization_id, updated_at`, `writing_number`).
- Migration: `contracting_sheet_links` (one row per organization: sheet id, tab name, connected-by, created-at, last successful sync, health) and `contracting_sheet_rows` (request_id, sheet row version/hash, last pushed values, sync status `synced | pending | error | conflict`, error text). Both service-role only; RLS on, no anon.
- Migration: `app_user_connections` (encrypted per-user Google connection key, service-role only).
- No existing row is rewritten; every migration is additive.
- New server function `listAgentContractingSummaries` — server-side grouping by agent with pagination, search (agent name, NPN, email, phone, upline name, carrier name, writing number), sort, and filter. Returns per agent: name, NPN, upline, carrier count, active count, needs-attention count, most urgent status, last updated.

## Stage 2 — Agent-grouped main page

Replace the body of `contracting-ops/requests/index.tsx` (keeping the existing Requests / Writing numbers / Hierarchy / Change requests tabs):

- Compact table, one row per agent: avatar/initials + name, NPN, direct upline, carriers requested, progress (`2 of 5 Active`), needs attention, most urgent status, last updated, chevron. 52–60px rows.
- Compact summary strip: agents needing attention, new requests, waiting on agent, waiting on carrier, fully contracted.
- Filter chips for the nine statuses plus Needs Attention, New Requests, Fully Contracted. Search box. Sort menu.
- Server-side pagination (50 per page). Filters, search, sort, and page live in the route search params, so returning from a workspace restores them exactly.
- Skeletons match the final row layout; empty state names the next action.

## Stage 3 — Agent Contracting Workspace

New route `contracting-ops/requests/agent/$agentId.tsx` (full page; the existing `$requestId` page stays reachable and becomes the deep-link/history view).

- Header: Back to Agents (preserving search params), name, progress, needs-attention indicator, last updated.
- Agent Information: legal name, NPN, email, phone, agency position, headline comp % + Copy Agent Information.
- Hierarchy: upline name/NPN, agency owner name/NPN, path when useful + Copy Hierarchy and Copy Contracting Information (exact seven fields specified).
- Carrier request table, inline editable: carrier + logo, resolved comp level (with source label from `COMP_SOURCE_LABELS`), advance, status dropdown (nine values), writing number input, note action, last updated, history.
- Inline saves are optimistic with rollback and a per-row saved/saving/error indicator. Bulk action limited to Requested → Invite Sent on selected rows. Never bulk writing numbers.
- Mobile: agent rows become list items; carrier rows become expandable cards keeping every action.

## Stage 4 — Validation, notes, audit

Server-side in `contracting-ops.functions.ts` (UI mirrors, server enforces):

- Agent Action Needed requires an agent-visible note; Active requires a writing number; Declined requires a reason.
- Every change writes a `contracting_status_history` row with change kind, field, old value, new value, actor, source (`app` or `google_sheets`), timestamp.
- Status/writing-number changes are idempotent and write through to the `contract_requests` appointment record — no duplicate contracts or numbers.
- Compact timeline component shows status changes, notes, writing-number changes, sync events, and errors.
- In-app notification to the agent on status change or new agent-visible note.

## Stage 5 — My Contracts and permissions

- My Contracts reads the same `contracting_requests` records: carrier, status, agent-facing note, writing number, comp level, advance, last updated. Agent Action Needed rendered prominently. Internal notes, staff assignment, sync state, and audit detail are excluded server-side, not merely hidden.
- Add granular permission flags for: view requests, update status, add writing numbers, add agent notes, add internal notes, request information, view audit, manage sheet sync. Wire them into `getContractingAccess`, the staff preset editor, and every mutation. Contracting staff gain no client, policy, commission, billing, or unrelated settings access.

## Stage 6 — Google Sheets two-way sync

Each agency owner connects their own Google account (App User Connector, `google_sheets`).

- Workspace OAuth client must be configured first via the App User Connector card — this is the one manual setup step, and I will surface it when the stage starts.
- Connect Google Sheet action for agency owners: create a new contracting sheet or connect an existing one; sheet id stored per agency; the user's connection key stored encrypted server-side.
- Sheet layout: one row per agent+carrier request with the 16 specified columns, Request ID first and immutable. Status column gets validated dropdown values.
- Push: create/update the row when a request changes. Pull (Sync Now, plus scheduled recheck): only Status, Writing Number, Agent Note, Internal Note are accepted; every other column is restored to the authoritative value.
- Rejections flagged in Sync Status with a readable reason: Active without writing number, Agent Action Needed without agent note, Declined without reason, unknown status, duplicate Request ID.
- Matching is by Request ID only, so reordering is safe; deleted sheet rows never delete records; stale edits (older than the record's `updated_at`) become Conflict instead of overwriting.
- Sheet-originated changes appear in the audit trail with source `google_sheets` and the connected editor's identity. Connection health, last successful sync, Sync Now, and Recheck Errors surface in Agent Cloud.

## Stage 7 — Discord contracting notifications

- Add a `contracting` event category to `DISCORD_EVENTS` plus a `post_contracting` column and a per-integration contracting event selection (new request, agent action needed, approved, activated, declined, sheet sync error). Default: new request only.
- Payload allow-list stays field-enumerated in `src/lib/discord/message.ts`: agent name, carrier, status, request time, link. No NPN, phone, email, client data, policy data, notes, or credentials.

## Technical notes

- Files changed: `src/lib/contracting-ops/types.ts`, `src/lib/contracting-ops.functions.ts`, new `src/lib/contracting-agents.functions.ts`, new `src/lib/contracting-sheets.functions.ts` + `*.server.ts`, `src/lib/contracting.functions.ts` (My Contracts projection), `src/lib/permissions.functions.ts`, `src/lib/discord/message.ts`, `src/lib/discord.functions.ts`, `src/routes/_authenticated/contracting-ops/requests/index.tsx`, new agent workspace route, `src/components/contracting/*` (agent table, carrier table, timeline, copy actions), plus a public API route for the scheduled sheet pull under `src/routes/api/public/`.
- Every read and mutation goes through `requireSupabaseAuth` with organization isolation asserted server-side via the existing `src/lib/org-guard.ts` helpers; RLS policies stay the second boundary.
- Verification: extend the existing `scripts/*-check.ts` pattern with a contracting command-center check covering the 22 acceptance tests that can be asserted server-side, plus Playwright passes for desktop/tablet/mobile.

## Risks

- Grouping by agent changes the query shape; without the new indexes the list page slows on large agencies. Indexes ship in Stage 1, before the page.
- Two-way sheet sync is the highest-risk piece. Writing-number and status writes are validated server-side and conflict-checked against `updated_at` before any record is touched; a rejected sheet edit never mutates Agent Cloud.
- The Google OAuth client for per-user Google sign-in is external setup; Stage 6 cannot complete until it exists, and I will not fake a connected state.
