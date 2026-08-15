# Agent Cloud — Audit Findings (Stage 0)

Date: 2026-08-15. Branch: main. Evidence: live browser runs against the running app signed in as `kjvaughns13@gmail.com` (super_admin + agency_owner, Vantage Financial), a route/navigation join over `src/routes/**` and `src/lib/navigation.ts`, and direct database queries.

## What could and could not be verified

Verified: every main page loads (27 routes walked at 1280px and at 390px), navigation gating for the account under test, route/nav consistency, redirect coverage for retired URLs, mobile overflow, production-date source of truth.

**Not verifiable in the current environment, and this is itself the top finding:** the database is empty. `policies = 0`, `clients = 0`, `commission_schedule = 0`, `calendar_events = 0`, `profiles = 1`. There is exactly one user account and no manager, staff, supervising-agent, or plain-agent account. So the number-reconciliation audit (Dashboard vs Pipeline vs Book of Business vs Leaderboard vs Reports vs Finances vs Retention) and the per-role permission journeys could not be run against real rows — every one of those screens is legitimately empty right now. Any claim that they agree or disagree would be invented. Fixing this is prerequisite F1 below.

---

## Blocker

### F1 — No test agency, so financial agreement and role permissions cannot be audited
- Severity: Blocker (blocks the rest of this audit, not a user-facing bug)
- Roles affected: all
- Evidence: `select count(*) from policies` → 0; `profiles` → 1; `agency_levels` → 1; `org_carriers` → 16; `commission_grids` → 299.
- Impact: items 8–17 of the audit request (dashboard numbers, pipeline, post-a-deal fan-out, book of business, leaderboard date ranges, commissions and finances) are untestable, and so are all five role journeys.
- Recommended fix: a seeded, clearly-labelled fixture agency created by a script (not a migration, and never on page load) with one owner, one manager, one staff member, one supervising agent with a downline, two plain agents, ~20 clients across every pipeline stage, ~15 policies spanning today / this week / this month / last month / earlier this year, at least one policy per advance option, and one policy that intentionally has no resolvable comp so the "Compensation Review Needed" path can be exercised. Rows flagged as sample data so they can be removed in one statement.
- Files: `scripts/seed-demo.ts`, `src/lib/demo-seed.server.ts` (both already exist and are the right home).
- Acceptance test: after seeding, the same agent and date range returns an identical annual-premium total from Dashboard, Leaderboard, Reports, Book of Business, and Team production.

---

## Critical

### F2 — Empty state paints before data can load, so a populated page reads as "you have nothing"
- Severity: Critical (users conclude their data is gone)
- Role affected: every agent; reproduced as owner
- Route: `/contracting`; the same pattern exists on every page whose query is gated on the scope toggle
- Repro: hard-load `/contracting`. First paint shows `Assigned: 0 … Active: 0 — Showing 0 of 0 contracts`. Reloads two and three of the same run show the real contract (`Writing #7841102 — Foresters — Agent 80 — Submitted 6d ago`).
- Expected: a skeleton until the answer is known.
- Actual: a confident zero.
- Root cause: `src/routes/_authenticated/contracting/index.tsx:262` — `useQuery({ ...myContractsQuery(scope), enabled: scopeReady })`. While `scopeReady` is false the query is disabled, so `isLoading` is `false`, and the `isLoading ? skeleton : table` branch at line 410 falls to the table with an empty array.
- Fix: treat "not started yet" as loading — gate on `isPending || !scopeReady`, or better, give the shared scope hook a suspense-ready resolved value so no page has to know about the race. Audit every `enabled:` query for the same inverted state.
- Acceptance test: with a throttled connection, `/contracting`, `/book-of-business`, `/finances`, and `/leaderboard` never render a zero total or an empty-state illustration before their first response arrives.

### F3 — Agency identity and admin entry points appear, disappear, and change between pages
- Severity: Critical (trust: the product looks like it is switching accounts)
- Roles affected: agency owner, anyone in an agency
- Routes: all
- Repro: walk `/dashboard` → `/retention` → `/contracting` → `/settings/agency`. The sidebar brand reads `Agent Cloud` on some pages and `Vantage Financial` on others within the same session; the `Admin Portal` link is absent on `/dashboard`, `/clients`, `/pipeline`, `/calendar`, `/book-of-business`, `/contracting`, and present on `/retention`, `/reports`, `/team`, `/leaderboard`, `/settings/*`.
- Expected: organization name and admin entry are stable for the whole session.
- Actual: both flicker per navigation depending on whether the organization/role query has resolved for that page.
- Root cause: organization and role are resolved per-page from client queries with no shared resolved gate, so the sidebar renders its fallback identity on pages where the query has not yet returned.
- Fix: resolve organization and access once above the sidebar and hold the previous value rather than falling back to the default brand; render the admin link's slot as a placeholder until access is known instead of omitting it.
- Files: `src/components/app-sidebar.tsx`, `src/hooks/use-organization.ts`, `src/hooks/use-role.ts`.
- Acceptance test: navigating all 27 main routes in one session never changes the sidebar title and never adds or removes the admin link.

---

## Major

### F4 — Two core pages have no page heading
- Severity: Major (orientation, accessibility, SEO)
- Routes: `/dashboard`, `/licensing`
- Repro: `document.querySelector('h1')` returns null on both; every other audited page returns one.
- Root cause: both compose `PageShell` without passing a title, so the greeting block is the only heading.
- Fix: give `PageShell` a required title and make the greeting a subtitle; `/licensing` gets "State Licenses".
- Files: `src/components/page-shell.tsx`, `src/routes/_authenticated/dashboard.tsx`, `src/routes/_authenticated/licensing.tsx`.

### F5 — `/account/producer-profile` overflows horizontally on a phone
- Severity: Major on mobile
- Repro: 390×844, `/account/producer-profile` → `document.documentElement.scrollWidth > clientWidth`. It is the only one of the 27 audited routes that overflows at phone width.
- Fix: make the widest block (the licences/appointments table) a stacked card list below `sm`, matching the pattern the Book of Business already uses.

### F6 — Transient 500 from a server function during a fast page walk
- Severity: Major (intermittent, not reproducible on demand)
- Route: `/contracting`
- Evidence: one `HTTP 500 /_serverFn/…contracting.functions.ts?tss-serverfn-split` during the sweep; server log shows `TypeError: Cannot read properties of undefined (reading 'method')` in `@tanstack/start-server-core/server-functions-handler.ts`. Three deliberate reloads afterwards were clean, and the surrounding log lines show Vite was hot-reloading `post-deal.functions.ts` at that moment.
- Assessment: most likely a development hot-reload artefact rather than a production bug, so it is recorded rather than fixed. The standing risk behind it is real: `src/lib/contracting.functions.ts` is 1,438 lines and holds module-scope runtime values (`StatusEnum` at 426, `AssignmentSchema` at 869) beside its 28 server-function declarations, and server-function splitting is only safe when those files are thin wrappers.
- Fix: move schemas and helpers out of every `*.functions.ts` into plain sibling modules. This pattern is project-wide (30+ files), so it is a scheduled cleanup, not an emergency.
- Acceptance test: a production build plus a page walk with no 5xx from `/_serverFn/*`.

### F7 — Two console fetch failures during navigation
- Severity: Major (silent; nothing is shown to the user)
- Routes: `/clients`, `/calendar`, `/pipeline` (mobile run)
- Evidence: `TypeError: Failed to fetch` from the Supabase client, no visible error state on the page.
- Root cause: requests aborted by navigation are being logged as errors rather than ignored; a genuine failure on these pages would look identical and equally invisible.
- Fix: ignore abort errors explicitly, and surface any non-abort failure as a retryable inline error instead of a console line.

---

## Minor

### F8 — 112 routes sit outside the navigation registry
Mostly intentional (public pages, `$param` detail routes, palette-only entries), but three groups deserve a decision rather than inheriting one: `/analytics` (overlaps `/reports`), `/carrier-sync` and `/intake` (both overlap `/import`), and `/nova`, `/nova/activity`, `/nova/settings` (overlap `/ai-assistant` and `/settings/nova-pro`). Recommended: merge or redirect each into the surviving page so there is one answer per question. Full listing in `route-matrix.md`.

### F9 — Redirect stubs are correct but undocumented
56 redirect-only route files keep retired URLs alive. They work; there is no index of them, so the next consolidation risks re-creating a page that is already a redirect. `route-matrix.md` is now that index.

### F10 — Settings surface matches the target shape; two verifications outstanding
Main-nav Settings is already reduced to Agency Settings, Security, Billing, Nova Pro, Support Desk, with the eight detailed tabs inside `/settings/agency`, and White Label, Emails, and standalone Comp Grids are redirect stubs. What is not yet verified is persistence: each of the eight tabs saving, surviving a refresh, and taking effect for a second account. That needs F1's fixture agency.

---

## Ten highest-priority fixes, in order

1. F1 — seed a fixture agency with all five roles and dated policies.
2. F2 — never show an empty state while an answer is still unknown.
3. F3 — stable organization identity and admin entry across the session.
4. Re-run the number reconciliation across all seven surfaces once F1 exists, and fix any disagreement at the shared production source rather than per page.
5. Post-a-deal fan-out verification: one deal appears exactly once in each of the eight downstream surfaces, and duplicate submission is refused.
6. Compensation review path: a policy with no resolvable rate saves and reports exactly what configuration is missing, instead of failing silently.
7. F7 — visible, retryable errors in place of console-only failures.
8. F4 and F5 — page headings, and the one mobile overflow.
9. F8 — merge or redirect the overlapping analytics / import / Nova routes.
10. F6 — thin out `*.functions.ts` modules so splitting is safe by construction.

## Consolidation, permissions, and risk notes

- Duplicated surfaces to fold: `/analytics` into `/reports`; `/carrier-sync` and `/intake` into `/import`; `/nova*` into `/ai-assistant` plus `/settings/nova-pro`.
- Shared components already exist and should be the only implementations used going forward: `PageShell`/`Panel`, `EmptyState`, `StatusBadge`, `KpiCard`, `ScopeToggle`. The audit found no competing second implementation of these — the design-system problem here is missing usage (F4), not duplication.
- Permissions: no over-permissive surface was found for the account under test, but with one account and no manager/staff/agent logins this cannot be called clean. Treat the role matrix as unverified until F1 lands.
- Production source: `src/lib/production/source.ts` already defines one rule (`production_date`, falling back to `posted_at`) with a documented server-side fallback. Every surface should read through it; confirming that is part of priority 4.
