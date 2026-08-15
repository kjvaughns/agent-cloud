# Agent Cloud — Full Audit, Then Staged Repair

Agent Cloud currently has 173 route files, ~60 settings/admin pages, and dozens of overlapping features. A single pass that audits everything and fixes everything at once would be unreviewable and risky for live financial data. So this runs as an audit first, then repairs in severity order, with your approval between stages.

## Stage 0 — Product map and written audit (no app changes)

Produce two documents in the repo:

- `docs/audit/route-matrix.md` — every route with: page name, allowed roles, purpose, primary action, data source, current state, problems, and a verdict of Keep / Repair / Merge / Redirect / Hide / Remove.
- `docs/audit/findings.md` — numbered findings grouped by severity (Blocker, Critical, Major, Minor, Polish), each with role affected, route, repro steps, expected vs actual, root cause, recommended fix, files involved, and an acceptance test.

How the audit is gathered (real behavior, not code reading alone):

- Route inventory from `src/routes/**`, cross-checked against every navigation item in `src/components/app-sidebar.tsx` — flags orphan routes and nav links to incomplete pages.
- Live browser runs of the two core journeys (agency owner setup, agent daily workflow) against the running app using seeded test accounts, capturing screenshots, console errors, and failed requests.
- Role trace: for each protected server function and RLS policy, confirm agency owner / manager / staff / supervising agent / regular agent get the intended access and nothing more.
- Number reconciliation: query the database directly and compare Dashboard, Pipeline, Book of Business, Leaderboard, Reports, Finances, Retention, and Team production for the same agent and date range; every disagreement becomes a finding naming the differing date field or status filter.
- Design system sweep: catalog duplicate components solving the same problem (page headers, tables, empty states, status badges, KPI cards, dialogs) and list the shared components to standardize on.
- Mobile sweep at phone, tablet, laptop, desktop widths on the critical screens: overflow, touch targets, table behavior, modal scrolling, mobile nav.

Stage 0 ends with the top ten fixes, the consolidation list, the nav plan, and the data-source disagreements — and no code changes beyond the two documents.

## Stage 1 — Blockers and Criticals

Security and organization isolation, data loss or duplicate creation, and compensation accuracy only. Includes: one shared production source used by Dashboard, Leaderboard, Reports, Team, and Discord; duplicate-post prevention on Post a Deal; "Compensation Review Needed" instead of silent commission failure, with the exact missing configuration named; hierarchy loop prevention; note visibility leaks between agent and staff views.

## Stage 2 — Core workflows

Invitation and account creation, agency owner setup flow, carrier configuration and activation gating, contract requests and statuses, Pipeline and Post a Deal, Book of Business, Calendar sync without duplicate events, Retention import matching and review queue.

## Stage 3 — Navigation and settings simplification

Main nav for Settings reduced to Agency Settings, Security, Billing, Nova Pro, Support Desk; detailed tabs live inside Agency Settings (General, Roles and Permissions, Levels and Positions, Carriers, Contracting, Notification Settings, Automations, Integrations). White Label, Emails, and the standalone Comp Grids page leave active navigation. Every retired route becomes a permanent redirect so saved links keep working. Nav is organized around agent work, and each page gains a clear title, description, single primary action, and an explicit next step.

## Stage 4 — Mobile, accessibility, visual consistency

Shared page shell, table, empty state, loading, error, and dialog components applied across pages; contrast and focus states; status conveyed by more than color; keyboard-usable critical flows; error messages that say what happened, whether data saved, and what to do next — no raw database errors surfaced to users.

## Stage 5 — Tests

Playwright and unit coverage for role permissions, org isolation, invitations, hierarchy rules, carrier activation, contract requests, deal posting, duplicate prevention, compensation resolution (age bands, advances, overrides), leaderboard date ranges, calendar sync, retention import, Discord privacy, settings persistence, and mobile critical journeys. Typecheck, lint, tests, and production build run before and after each stage.

## Technical notes

- Migrations stay forward-only and idempotent; no destructive changes to production data. Any data correction is a separate reviewed migration.
- Permissions are never loosened to make a test pass; if a test fails on access, the test or the role model is wrong, not the policy.
- Legacy role names (including `admin`) remain in every role list — they are append-only.
- Commission math stays single-source in `src/lib/commission-calculator.ts`; no database triggers insert commission rows.
- Existing gold brand identity and `src/styles.css` tokens are reused; working screens are not redesigned for novelty.

## What I need from you

Approve this to start Stage 0. I will come back with the audit report and the top ten fixes before touching application code, and each later stage starts only after you approve the one before it.
