# Product inventory and dead controls — audit 2026-09-10

## Route counts
- Route files: **178**
- Pure redirect stubs (page only throws `redirect`): **52**
- API / webhook / cron / email routes: **27**
- Real interactive pages: **~99**

The 52 stubs are deliberate URL-migration shims, each with a one-line reason in source
(e.g. `settings.white-label.tsx:2`). They keep old bookmarks working; they are not abandoned
features. Full list in the raw report from the inventory pass.

Notable consolidation already in place: everything under `settings.roles|carriers|comp-grids|
levels|templates|automations|emails|integrations|usage` now redirects to `/settings/agency`, and
most `contracting-ops/*` subpages redirect into `/contracting-ops/queue|requests|licensing`.

## Area → route → server function → tables
See the table in the inventory pass output; the mapping is unchanged for Dashboard, Pipeline,
Post a Deal, Book of Business, Leaderboard, Team, Invite, My Contracts, Contracting Ops,
Finances, Calendar, Retention, Agency Settings, Levels/Positions, Carriers/Comp, Reports, Nova,
Billing. Every primary area resolves to a real server function and real tables — no area is
backed by mock data.

## Dead or soft controls

| ID | Where | Problem | Severity |
|---|---|---|---|
| D-1 | `src/routes/_authenticated/ai-assistant.tsx:311` | Mic button permanently `disabled` with no tooltip or explanation, against the project's own convention (cf. `notifications-panel.tsx:76`, which explains why SMS is off) | Minor |
| D-2 | `src/routes/_authenticated/tools/leads.tsx:1-26` | Whole route is `<ComingSoonPage>` yet reachable from Tools nav | Minor (labelled) |
| D-3 | `src/routes/admin.analytics.tsx:8-21` | Static "coming soon" page, no data or controls | Minor (labelled) |
| D-4 | `src/routes/_authenticated/back-office/advanced-desk.tsx:212` | One tab of a working page is inert | Minor (labelled) |
| D-5 | `src/lib/surelc.functions.ts:97` | "Submit to SureLC" silently becomes a no-op returning "coming soon" when `SURELC_*` env is unset — confirm production config | Major if unset |

No `href="#"`, empty `onClick`, `alert()` placeholders, or `TODO`/`FIXME` markers exist in
`src/routes` or `src/components`.

### Silent failures (action looks successful, nothing happened)
- `src/components/pipeline/notes-tab.tsx:167-168` — health-score upsert failure invisible.
- `src/lib/admin-import.functions.ts:745-746` — commission calculation failure during import only
  warns; the import reports success. **Major** (financial data).
- `src/lib/contracting-ops.functions.ts:1599-1600,1675-1676,1733-1734` — commission-level sync,
  contract-record sync and field-history writes can fail with only a server log. **Major**.
- `src/lib/analytics.functions.ts:336-337` — AI insight failure shows an empty dashboard card.
- `src/lib/contracting-ops/audit.ts:98-99,127-128` — audit writes (see security S-3).
- Deliberate and documented, acceptable: `document-intake.functions.ts:118-121`,
  `email/send.server.ts:79-80,351-353`, `discord-notify.server.ts:47-48`.

## Background jobs
`dispatch-announcements`, `run-automations`, `process-imports`, `demo-reset`, `fetch-news` are all
implemented and delegate to real modules; Stripe webhook and the `lovable/email/*` queue routes
exist. Auth model on three of them is broken — see security S-1.

## Gates and flags
No flag service. Access is (a) `role_permissions`/`user_roles` booleans
(`src/lib/permissions.functions.ts`), (b) `profiles.nova_pro_status` via
`src/lib/nova-gate.functions.ts` + `src/lib/nova-features.ts`, (c) plan checks in
`src/lib/billing.functions.ts:615`, (d) `Audience` in `src/lib/navigation.ts` driving sidebar and
command palette. `src/components/require-agency-admin.tsx` is explicitly a rendering guard only.
