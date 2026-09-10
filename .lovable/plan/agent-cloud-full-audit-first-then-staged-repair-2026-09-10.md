# Agent Cloud — Full Audit First, Then Staged Repair

An earlier audit ran on 2026-08-15, when the workspace had one account and zero policies — so the money and role findings in it were never testable. Today there is real production: hundreds of clients, policies, commission rows and roster members. This audit is redone against that data, plus a clearly marked test agency for the flows that can't be checked on live records.

No application code changes in this pass except two things you asked for outright: the pricing wording, and removing every public mention of profit share.

## What gets produced

Written to `docs/audit/` and summarized in chat:

- **Executive summary** — completeness, simplicity and production-readiness scores, strongest areas, most dangerous failures, biggest sources of confusion, biggest data-integrity risks.
- **Feature scorecard** — every product area marked Complete / Partially complete / Broken / Misleading / Coming soon / Should be removed.
- **Issue register** — ID, area, role affected, route, exact problem, expected vs actual, root cause with file and line, severity, evidence, fix, dependencies, acceptance test.
- **Route and role matrix** — all ~156 pages × 5 roles × view / create / edit / delete / export / manage settings, with the server check and database policy that actually enforces it.
- **Promise vs reality** — every claim on the landing page, pricing, onboarding, upgrade screens, Nova copy, help text and empty states, against what the app really does.
- **Consolidation report** — duplicate pages, competing sources of truth, obsolete routes, dead buttons.
- **Fix roadmap** — phased, in the fixing order you set out.

## How the audit is actually gathered

Not by reading code alone. Four passes:

1. **Inventory** — every route, nav item, tab, form, dialog, button, table, filter, export, server function, scheduled job, email path, billing gate and permission check, joined against the navigation registry. Anything whose button leads nowhere, whose action can't succeed, or whose page implies something the code can't do gets flagged.
2. **Live clicking, per role** — the app is driven in a real browser as Super Admin, Agency Owner, Manager, Staff, Agent and Downline Agent through the full day: dashboard, pipeline, post a deal, book of business, leaderboard, team, contracts, finances, calendar, retention, settings. Screenshots, console errors and failed requests are captured as evidence. Desktop and phone widths.
3. **Number reconciliation against the database** — for the same agent and the same date range, the totals on Dashboard, Pipeline, Book of Business, Leaderboard, Finances, Reports, Team production, Retention and Discord are compared to a direct query. Every disagreement becomes an issue naming the exact date field or status filter responsible. Commission math is recomputed by hand for a policy of each advance type — as earned, 3, 6, 9, 12 month — and each of the four payout parts (advance, override, trail, renewal), including age bands and the position-percentage fallback.
4. **Authorization probing, not button hiding** — protected server functions and endpoints are called directly with the wrong role and with another agency's record ids. Anything reachable is Critical. Public leaderboard and public agent pages are checked for leaked client or agent detail.

## Test agency

A script-created, clearly labelled sample agency inside the live workspace, deletable in one step: one owner, one staff, one manager, one writing agent, one downline agent; three levels; two carriers — one with a full compensation grid, one on the position fallback; Nova on for one agent, off for the other. It exists so the flows that can't be run against real records get run for real: invite acceptance and expiry and reuse, contract request through active with a writing number, deal posting fan-out, hierarchy change with historical overrides, billing gates.

The full journey — create agency, configure, invite, request contracts, staff sets status and writing number, add client, work pipeline, post deal, see it once in book of business, dashboard, leaderboard, calendar, finances, retention, team — passes only if it needs no developer or database intervention.

## The two changes made in this pass

- **Pricing corrected everywhere it appears**: Solo $49/mo, Agency $399/mo with unlimited agents and no seat charges, Nova $49/mo per agent, agency-sponsored Nova $39/mo per active agent. Every "15 included users" and "$25 additional seat" reference removed — landing, pricing, upgrade screens, billing pages, plan tables, emails, seed data.
- **Profit share removed from all public surfaces**: no mention on the landing page, pricing, marketing copy, onboarding or upgrade screens. Any internal tracking stays untouched but stops being advertised.

## Severity and order

Critical (security, privacy, billing, corrupted money) → Blocker (a core journey is impossible) → Major (works wrongly or needs a workaround) → Minor → Polish. Repairs, once you approve the report, run in your stated order: security and privacy, duplicate/corrupt records, billing, agency setup, invitations and permissions, pipeline and deal posting, book of business, production and leaderboard agreement, contracts and writing numbers, commissions, calendar and retention, Nova, reports, naming and navigation, visual polish. Nothing gets polished before its data and permissions are proven.

## Technical notes

- Migrations stay forward-only and idempotent; no destructive change to production rows. Any data correction is its own reviewed migration.
- Permissions are never loosened to make a check pass.
- Legacy role names, `admin` included, stay in every role list — append-only.
- Commission math stays single-source in `src/lib/commission-calculator.ts` and `src/lib/compensation/resolve.ts`; no database trigger writes commission rows.
- Production totals must come from the one canonical production source, not per-page queries.
- Existing gold brand tokens in `src/styles.css` are reused; working screens are not redesigned for novelty.

## What happens next

Approve this and I start the audit. I come back with the report, the scorecard, the issue register and the proposed repair sequence before touching anything beyond the pricing and profit-share wording. Each repair phase after that starts only when you approve the previous one.
