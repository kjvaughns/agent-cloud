# Agent Cloud — Phase Delivery Status

Companion to `PHASE1-AUDIT.md`. The audit records the platform as found; this
records what was built in response, and what is still open.

**All SQL is delivered as migration files only.** The Supabase connector for
this project returns *"You do not have permission to perform this action"* for
every call including `select 1`, so **no migration in this repo has been
applied or verified against a database.** Lovable manages the backend — the
files must be run there, in filename order.

---

## Migrations to run, in order

| # | File | What it does |
|---|---|---|
| 1 | `20260715120000_dashboard-real-data.sql` | Dashboard accuracy (pre-existing) |
| 2 | `20260715130000_nova-automations.sql` | Nova automations (pre-existing) |
| 3 | `20260716100000_carrier-book-sync.sql` | Carrier CSV sync (pre-existing) |
| 4 | `20260716120000_monetization.sql` | Stripe/billing schema (pre-existing) |
| 5 | `20260717100000_role-permissions.sql` | Roles + permissions (pre-existing) |
| 6 | ~~`20260717120000_contracts-restructure.sql`~~ | **Do not run — aborts.** Superseded by #7. |
| 7 | `20260719100000_contracts-restructure-repair.sql` | Phase 2 — the above, done with ALTER |
| 8 | `20260718100000_org-isolation.sql` | **Phase 1 — run before 7 and everything after** |
| 9 | `20260719110000_phase2-stabilization.sql` | Phase 2 — org settings, support routing, SECURITY DEFINER sweep, rate limits |
| 10 | `20260720100000_phase3-tasks-search.sql` | Phase 3 — tasks, search indexes, setup state |
| 11 | `20260721100000_phase4-retention-reconciliation.sql` | Phase 4 — retention cases, commission statements |
| 12 | `20260722100000_phase5-reporting-notifications.sql` | Phase 5 — notification prefs, export log |
| 13 | `20260723100000_phase6-automation-runs.sql` | Phase 6 — automation execution ledger |
| 14 | `20260724100000_phase7-cleanup-plans.sql` | Phase 7 — plans table, FAQ seed, duplicate cleanup, audit triggers, carrier_sync_logs re-scope |

> **Note on `20260719131150_46a23f9e-….sql`.** That migration was generated
> outside this sequence and re-created the carrier sync tables, reintroducing
> the global `has_role(auth.uid(),'admin')` bypass on `carrier_sync_logs` — the
> pattern Phase 1 removed everywhere else. Its later timestamp means its policy
> wins wherever migrations run in filename order. Section 5 of migration #14
> restores org scoping on that table. Worth watching: any future generated
> migration that recreates a table can silently reinstate the old policy shape.

**Order matters.** `20260718100000_org-isolation.sql` creates `my_org_ids()`,
`is_org_owner()` and `stamp_organization_id()`, which every later migration
depends on. Despite its earlier timestamp it must run before #7 and all of
#9–14.

After running them, regenerate `src/integrations/supabase/types.ts`. Several
modules currently cast the client to `any` because the generated types predate
these migrations.

---

## What each phase delivered

### Phase 1 — Audit and multi-tenant isolation
Audit deliverables A–F. `organization_memberships`, org helpers,
`organization_id` across 23 tables with insert-stamping, RLS rewritten to
require an org match, and the global `admin` data bypass removed.
`is_in_downline` made cycle-safe, depth-capped and org-constrained. Legacy
permissive `profiles` policies dropped. RLS enabled on
`commission_backfill_queue`. `user_roles` moved to `UNIQUE(user_id, role)`.
Missing indexes added. Pricing corrected (Agency $399 + $25/seat, Solo $50)
and Nova decoupled from Solo.

### Phase 2 — Critical stabilization
Contracts-restructure repaired. Admin settings persist for real
(`organization_settings`), with automated notifications defaulting **off**.
Support tickets routable (`assigned_to`) with an agency queue; duplicate
`help.functions.ts` deleted. `get_book_of_business` and `get_downline_agents`
rewritten — the former returned every policy of every agency to any admin.
Rate limiting on the seven unauthenticated public endpoints. MFA at
`/settings/security`.

### Phase 3 — Tasks, search, setup
`tasks` table and `/tasks`. Global search over clients, policies, agents and
prospects, replacing the static nav jumper, with real deep links into the
existing client drawer and policy sheet. Agency setup checklist derived from
live data.

### Phase 4 — Retention and reconciliation
`retention_cases` with risk scoring, assignment and explicit outcomes, so save
rate is measurable. `commission_statements` / `_lines` with CSV import and
policy-number matching against expected commission. Reporting layer only —
it never writes to `commission_schedule`.

### Phase 5 — Reporting, export, notification preferences
Production and commission reports. Server-side CSV export for five datasets,
each logged to `export_log`. Per-user notification preferences beneath the
org-level switches; `may_notify` requires both to agree.

### Phase 6 — White-label and automations
Accent colour drives the design tokens (white-label plan only — every other
workspace keeps the stock palette untouched). `custom_domain` resolves branding
on the pre-auth pages. Nova automation worker with consent gating, idempotent
runs, and SMS explicitly blocked rather than silently dropped.

### Phase 7 — Cleanup and configurable pricing
`plans` table with the code constants as fallback. FAQ content moved into
`faq_items`. Fixtures and dead modules removed. Duplicate `nova_*` tables
dropped (guarded on being empty). Audit log extended to role grants, status
transitions and commission level changes.

---

## Still open

**Blocking launch:**
- **Run the migrations.** Nothing above is live until they execute, and none
  of it has been verified against a real database.
- **Isolation proof.** Section F.2 of the audit: two org members, cross-org
  read returns zero rows, cross-org upline raises `check_violation`.
- **Stripe configuration.** 7 price IDs, secret key, webhook secret,
  `APP_ORIGIN`, and a webhook pointed at `/api/stripe/webhook`.

**Business decisions, not engineering ones:**
- **Nova Pro sells a phone number that cannot be provisioned.** No telephony
  provider is connected. `sendSms` writes a row and returns. Either connect a
  provider or remove the number from the $49 offer.
- **White-label is now applied** (branding, domain, accent) — but the SMS and
  voice parts of the platform it fronts still depend on the same missing
  telephony provider.

**Deferred, with reasons:**
- **Recruiting ATS** (scheduling, scorecards, offers) — a product in its own
  right, not a gap in an existing one.
- **Per-permission enforcement in RLS.** `role_permissions` binds at module
  entry points, not in policy expressions. Closing this means making the
  permission keys reachable from SQL.
- **`beneficiary_checkin` automations** — the schema records no review cadence
  to trigger on. Running nothing beats inventing one.
- **Mobile app shell** — the UI is responsive but not app-shell optimized.
- **Duplicate migration cleanup** (`email_infra` ×2, `organizations_and_roles`
  ×3). Harmless where they sit; rewriting applied migration history is riskier
  than the tidiness is worth.
