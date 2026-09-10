# Agent Cloud — product audit, 2026-09-10

Four passes, each verified by hand afterwards. Claims the automated passes over-reported are
recorded as "not a finding" so nobody re-chases them.

- `security.md` — server functions, service-role paths, RLS, public endpoints, roles, secrets
- `inventory.md` — routes, areas, dead controls, silent failures, background jobs, gates
- `data-consistency.md` — production and commission numbers across screens, measured live
- `promise-and-navigation.md` — promise vs reality, navigation per role, route/role matrix

Supersedes `docs/audit/findings.md` and `docs/audit/route-matrix.md` (2026-08-15, taken against an
empty database).

## Executive summary

Completeness: **high**. Every primary area resolves to real server functions and real tables; no
mock data, no fake buttons, no `TODO` markers in routes or components. The landing page is
guarded against overclaiming by its own build-time check.

Simplicity: **good and improving**. 52 route stubs are deliberate redirects from an earlier
consolidation; Settings is one personal area plus one tabbed agency area.

Production readiness: **blocked on four things**, in order:

1. **Anyone can run our scheduled jobs.** Three cron endpoints authenticate with the publishable
   key, which ships in the browser. `run-automations` also accepts any `orgId`, so an outsider can
   force automation jobs — including outbound email and SMS — for any agency (S-1).
2. **The same week reads three different totals.** Dashboard says $46,763.52 for 8/24–8/30,
   an all-status view says $50,424.72, an effective-date view says $22,556.28. The rules are
   documented and one canonical module exists — not every screen uses it (C-1, C-2).
3. **Duplicate sources of truth for people, hierarchy and contracts.** 18 profiles vs 35
   `pending_agents` joined by email; three hierarchy tables; two live contract tables with
   different row counts (C-5, C-6, C-7).
4. **Money work that fails quietly.** Import can skip commission calculation with only a server
   log; contracting syncs and audit writes do the same (inventory §silent failures, S-3).

Strongest areas: Nova capability labelling, the v1 API's key/scope model, the Stripe webhook,
role lists (legacy `admin` intact everywhere), and the agency-settings consolidation.

Biggest user confusion: two definitions of "production" on one page, and three names for Nova.

## Feature scorecard

| Area | Verdict |
|---|---|
| Dashboard, Pipeline, Post a Deal, Book of Business, Calendar, Retention, Team, My Contracts, Contracting Ops, Finances, Reports, Agency Settings, Levels, Carriers, Billing | Complete, with the accuracy issues in `data-consistency.md` |
| Leaderboard | Complete but uses a second production definition (C-1) |
| Nova AI | Complete for shipped capabilities; unshipped ones correctly fenced |
| SureLC submission | Broken in effect — no credentials configured, the action is a no-op (D-5) |
| Lead marketplace (`/tools/leads`), admin analytics, back-office analysis tab | Coming Soon, correctly labelled |
| `admin.*` console (14 routes) | Outside the audited nav and gate system — needs its own pass (N-1) |
| Public profit share | Removed |

## Issue register (ordered as we should fix them)

| ID | Area | Roles | Where | Problem | Severity |
|---|---|---|---|---|---|
| S-1 | Background jobs | anyone, unauthenticated | `api/public/hooks/run-automations.ts:16`, `process-imports.ts:21`, `demo-reset.ts:37` | Auth secret is the public key; arbitrary `orgId` accepted | Critical |
| S-3 | Contracting audit | all | `contracting-ops/audit.ts:98,127` | Audit trail can go missing silently | Major |
| I-1 | Import | owner, staff | `admin-import.functions.ts:745` | Commission calculation failure reports success | Major |
| I-2 | Contracting | owner, staff | `contracting-ops.functions.ts:1599,1675,1733` | Level/contract/history syncs fail silently | Major |
| C-1 | Leaderboard | all | `dashboard.functions.ts:396-436` | All-status totals beside canonical totals, unlabelled | High |
| C-2 | Book of Business | all | `get_book_of_business` + consumers | Aliased date field; client-side filters disagree with Dashboard | High |
| C-5 | Agents | all | `book-of-business.functions.ts:57-86` | `profiles` vs `pending_agents` joined by email | High |
| C-6 | Hierarchy | owner, manager | `profiles.upline_id` vs `agency_relationships` vs `carrier_hierarchy_records` | Three graphs, unreconciled | High |
| C-7 | Contracts | owner, staff | `contract_requests` (34) vs `contracting_requests` (38) | Two live tables, no mapping | High |
| N-1 | Platform admin | super_admin | `admin.*` | 14 routes outside the audited gate system | High |
| S-2 | Team | manager | `team.functions.ts:690-829` | Admin-client write with no RLS backstop | Major |
| D-5 | Contracting | agent | `surelc.functions.ts:97` | "Submit to SureLC" is a no-op without credentials | Major |
| N-2 | Navigation | all | `/analytics`, `/back-office`, `/carrier-sync`, `/finances_.reconciliation`, `/white-label` | Live routes unreachable from nav | Major |
| N-3 | Permissions | staff | `navigation.ts:438-440` | `admin_staff` has no path to Roles and permissions | Major |
| C-8 | Compensation | owner | four comp tables, one empty | Ambiguous effective-rate resolution | Medium-High |
| C-3 | Production | all | `production/source.server.ts` | Silent fallback to old rules when a migration is missing | Medium |
| C-4 | Trophy case | all | `records.functions.ts:66-86` | Bypasses `selectProduction` guard | Medium |
| C-9 | Commissions | all | `commission_schedule` | Ledger staleness after premium/level edits | Medium |
| D-1 | Nova | all | `ai-assistant.tsx:311` | Disabled mic with no explanation | Minor |
| N-4/N-5 | Naming | all | `navigation.ts`, `contracting.comp-grids-manage.tsx` | Nova/Nova AI/Nova Pro; leftover file | Minor |

## Fix roadmap

1. **Foundation / security** — S-1 (real `CRON_SECRET` plus a migration updating the pg_cron job
   headers), S-2, S-3, N-1.
2. **Data integrity** — one production reader everywhere (C-1, C-2, C-3, C-4); then the duplicate
   sources: agents (C-5), hierarchy (C-6), contracts (C-7), compensation (C-8, C-9).
3. **Money that fails quietly** — I-1, I-2: surface failures and show "compensation review needed"
   rather than a silent success.
4. **Core journeys** — SureLC credentials or an honest label (D-5); the end-to-end fixture agency
   run (owner, staff, manager, writing agent, downline; two carriers, one grid, one fallback).
5. **Navigation and permissions** — N-2, N-3, N-4, N-5.
6. **Design and mobile pass**, then automated coverage for role permissions, org isolation,
   invitations, comp resolution, leaderboard ranges and the mobile critical journeys.

## Done in this pass
- Profit share removed from every public surface, plus the dead `profit_share_viewed` event key.
- Pricing verified end to end: Solo $49, Agency $399 unlimited with no seat charges, Nova $49,
  sponsored Nova $39. No "15 included users" or "$25 seat" copy remains.
