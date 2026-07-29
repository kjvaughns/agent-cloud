# Agent Cloud — Phase 1 Platform Audit

**Date:** 2026-07-29
**Scope:** Full platform audit and stabilization, per §34 deliverables A–F of the Complete Platform Audit, Build, and Launch prompt.
**Codebase:** 79 route files, 35 server-function modules, 332 `createServerFn` handlers, 83 migrations, 84 public tables.

This document is the audit record. Everything below is read from source and cited by file path. Nothing was executed against the production database — the Supabase connector for this project returns *"You do not have permission to perform this action"* for every call including `select 1`, so **no migration in this repo has been verified as applied**, and remote schema state is inferred from `src/integrations/supabase/types.ts` plus the migration history.

**Phase 1 gate:** *"Do not move to the next phase while critical security or data-isolation issues remain unresolved."* Section C.1 lists the blockers. The isolation fix is written (`supabase/migrations/20260718100000_org-isolation.sql`) but **is not applied** — the gate stays closed until it runs and the section F verification passes.

---

## A. Product Matrix

Status vocabulary: **Complete** (works end-to-end) · **Mostly** (works, gaps at the edges) · **Partial** (core path only) · **UI-only** (renders, does not persist) · **Broken** · **Missing** · **Duplicated**.

### Core CRM & production

| Module | Status | Notes |
|---|---|---|
| Dashboard | Complete | Real data; 13 accuracy defects fixed this cycle (team production double-counting self, cross-agency leaderboard leak, hardcoded $80k goal, range-ignoring status grid and donut). |
| Pipeline | Complete | Kanban, stages, drag-and-drop, persisted. |
| Post a Deal | Complete | Feeds `commission_calculator.ts`. Single source of truth — untouched. |
| Book of Business | Complete | `get_book_of_business` RPC. See C.3 — it is `SECURITY DEFINER` and takes a caller-supplied `_agent_id`. |
| Clients / contacts | Complete | |
| Policies | Complete | |
| Commissions (calculation) | Complete | JS engine. DB trigger `trg_generate_commission_schedule` stays disabled to prevent double calculation. |
| Commissions (reconciliation) | Missing | No carrier-statement matching, no variance report, no dispute flow. |
| Finances / wallet | Mostly | Ledger and payouts render; no export. |
| Analytics | Mostly | Agent + team analytics via RPC. |
| Leaderboard | Complete | Redesigned; solo agents get a personal-production view instead of rankings. |

### Agency operations

| Module | Status | Notes |
|---|---|---|
| Team roster | Complete | Crash fixed — `getTeamDownline`/`getTeamKpis`/`getTeamAlerts` returned unhandled RPC errors into `useSuspenseQuery` with no error boundary; they now log and return empty defaults. |
| Team & Permissions | Complete | Six roles, configurable manager/staff permissions, presets, audit logging. |
| Invitations / onboarding | Mostly | Token invite → account → personal info → carriers → agreement → SureLC SSO. |
| Licensing | Partial | `state_licenses` and PDB upload exist; no renewal reminders, no appointment tracking. |
| Contracting | Complete | 4-tab hub: Requests, Downline Matrix, Comp Grids, Transfer Requests. |
| Carriers | Mostly | Cleaned up; carrier CSV book sync added (`carrier-sync.functions.ts`). |
| Recruiting | Partial | `recruiting_prospects` + stages + notes exist. No ATS: no scheduling, no scorecards, no offer flow. |
| Agency setup checklist | Missing | Nothing guides a new agency to a working configuration. |
| Retention | Partial | `getAtRiskPolicies` only. No retention module, no work queues, no outcomes tracking. |

### Platform & growth

| Module | Status | Notes |
|---|---|---|
| Billing (Stripe) | Complete | Checkout, portal, webhooks, seat math, Nova Partner credit. Honest "not configured" states when keys are absent. Requires env keys + webhook endpoint — see F.3. |
| Nova AI | Mostly | Hub, persisted automations, usage metering, gating (`requireNovaPro`, `trackNovaUsage`). Send worker not built; telephony not connected (`sendSms` is a DB-only stub). |
| White-Label | UI-only | Settings persist, but `accent_color` is never applied, `custom_domain` is dead, `logo_url` is read in exactly one place (`app-sidebar.tsx`). Sold but not delivered. |
| Support / help | Duplicated | `help.functions.ts` and `support.functions.ts` overlap. `support_tickets` has no `assigned_to` column, so tickets cannot be routed. `help.tsx` TOPICS and `faq.tsx` FAQS are still hardcoded arrays. |
| Notifications | Mostly | In-app works. Email via pgmq + pg_cron. No user preferences UI. |
| Reporting / export | Partial | Two client-side CSV buttons. No reporting module, no scheduled or server-side export. |
| Documents | Mostly | Storage + signed URLs. |
| Global search | UI-only | The palette jumps to static nav destinations; it does not search clients, policies, or agents. |
| Tasks | Missing | No `tasks` table, no module. Referenced by the spec, absent from the product. |
| Audit logs | Partial | `audit_log` written by permission changes only. |
| MFA | Missing | |
| Admin settings | Broken | `admin.settings.tsx` shows a success toast and persists nothing. |
| Mobile | Partial | Responsive; not app-shell optimized. |

### Duplication and dead code

| Item | Detail |
|---|---|
| `nova_settings`/`nova_activity` vs `sophai_settings`/`sophai_activity` | `20260713030222` renamed the tables; `20260715130000` re-created the old names. **All four now exist**; app code writes `sophai_*`. |
| `help.functions.ts` / `support.functions.ts` | Overlapping ticket logic. |
| `producer-profile.functions.ts` | Zero importers. |
| `client-detail-drawer.tsx` | Orphaned. |
| `requestCommissionLevel` | Two implementations. |
| `mock-data.ts` | Leftover fixtures still shipping. |
| `20260611022601_email_infra.sql` / `20260611022622_email_infra.sql` | Byte-identical duplicate (11,730 bytes each). |
| `organizations_and_roles` | Three near-identical copies (`20260609010000`, `20260610035617`, `20260610090000`). |

---

## B. Architecture Map

```
Browser (React 19 · TanStack Start · Tailwind v4)
  │  file-based routes (79) · TanStack Query · RLS-bound Supabase JS client
  ▼
TanStack server functions (35 modules · 332 handlers)
  │  requireSupabaseAuth middleware → { supabase (RLS-bound), userId }
  │  some handlers escalate to supabaseAdmin (service role, bypasses RLS)
  ▼
Supabase — Postgres (84 tables) · Auth · Storage · RLS · RPCs
          pgmq email queue + pg_cron
  ▼
External: Stripe (checkout/portal/webhooks) · Lovable AI gateway (all AI calls)
          SureLC SSO · AgentLink scrape · telephony (NOT CONNECTED)
```

**Two database clients, and the distinction is the whole security model:**

- `context.supabase` — carries the caller's JWT, RLS applies. **Default. Safe.**
- `supabaseAdmin` — service role, **RLS does not apply**. Every use re-opens the tenant boundary in application code.

Service-role usage by module:

| Module | Calls |
|---|---|
| `billing.functions.ts` | 27 |
| `onboarding.functions.ts` | 24 |
| `permissions.functions.ts` | 21 |
| `transfer-requests.functions.ts` | 15 |
| `api/stripe/webhook.ts` | 12 |
| `api/public/*` (7 unauthenticated endpoints) | 39 |
| `admin.functions.ts` | 3 |

The seven `api/public/*` routes are unauthenticated by design (landing pages, lead capture, waitlist) and correctly use the service role, but they are the platform's only unauthenticated write surface and warrant rate limiting — see F.

**AI routing:** all AI calls go through the Lovable gateway. No direct Anthropic calls exist in the codebase. Confirmed.

**Known integration gap:** telephony has no provider. `sendSms` writes a row and returns; Nova phone numbers are never provisioned. Nova Pro is sold at $49/mo with "dedicated business number" in the copy. **This is a revenue-recognition problem, not just a feature gap** — see F.2.

---

## C. Database Review

### C.1 Blockers — isolation

**Only 5 of 84 tables carry `organization_id`:** `profiles`, `invitation_links`, `role_permissions`, `audit_log`, `nova_partner_commissions`. **63 tenant-owned tables have no tenant column at all** — including `clients`, `policies`, `contract_requests`, `commission_schedule`, `producer_banking`, `ssn_audit_log`, `wallet`.

Isolation instead rests on one generated policy loop (`20260522213134_acda8e2a-….sql:377-413`) covering **23 tables × 2 policies = 46 policies**:

```sql
USING (agent_id = auth.uid()
   OR public.is_in_downline(auth.uid(), agent_id)
   OR public.has_role(auth.uid(),'admin'))
```

Three defects, each independently sufficient to leak data across agencies:

1. **No organization boundary exists.** Isolation depends on `profiles.upline_id` chains never crossing agencies. Nothing enforces that — no constraint, no trigger, and the transfer workflows exist specifically to rewrite `upline_id` across agencies. If agency B's owner ever sits under agency A's in the chain, A reads every one of B's clients, policies, commissions and banking rows through the normal policy path, no admin role required. The org tree (`organizations.parent_org_id`) and the agent tree (`profiles.upline_id`) are independent, and **only the agent tree is enforced**.

2. **`has_role(auth.uid(),'admin')` is a global bypass.** `has_role` (`20260522213134:31-34`) is a flat `user_roles` lookup with no org scoping. **118 policy objects grant it.** One `admin` row = read/write on every row of ~30 tables for every tenant. The spec's requirement that super admins cannot casually reach customer data is currently inverted.

3. **`is_in_downline` is an availability risk.** `UNION ALL`, no depth counter, no cycle guard, and `upline_id` has no constraint against self-reference. It is invoked **per candidate row** from ~30 SELECT policies. A single cyclic `upline_id` write stalls reads on `clients`, `policies`, `profiles` and everything else at once. Self-inflicted DoS reachable by anyone who can set an upline.

**Additional findings:**

| # | Finding | Severity |
|---|---|---|
| 4 | `commission_backfill_queue` (`20260610070000`) has **no RLS, no policies, no REVOKE**. Under Supabase's default grants it is readable and writable by every authenticated user, leaking the platform-wide set of policy IDs. | High |
| 5 | `profiles_self_or_related_read` grants **any user holding `manager`** read of every profile on the platform — `ssn_last4`, `date_of_birth`, `drivers_license_number`, `street_address`, `npn_number`. Same blanket manager grant on `agent_current_contracts`, `support_tickets`, `support_ticket_messages`. | High |
| 6 | `user_roles_admin_all` is `FOR ALL USING (has_role('admin'))` — any admin can write `user_roles`, including self-escalation, with no audit trail. | High |
| 7 | `user_roles` has `UNIQUE(user_id)` (`20260604200000:91`) → **one role per user**. The later `super_admin` grants collided and hit `ON CONFLICT DO NOTHING`, so **nobody holds `super_admin`** and every `super_admin` policy is dead code. It also breaks live app paths: `setMemberRole` inserts a role alongside existing rows, and `billing.functions.ts:437` upserts with `onConflict: "user_id,role"` against a constraint that does not exist. | High |
| 8 | `announcements_read` is `USING (true)` — every agency's announcements are readable platform-wide. Same for `carriers`, `commission_grids`, `scripts`, `news_articles`, `handbook`, `academy_*`, `faq`. Defensible for reference data; not for `announcements`. | Medium |
| 9 | **`20260717120000_contracts-restructure.sql` never applied.** It opens `create table if not exists public.transfer_requests (…)` but the table has existed since `20260522213134:145`, so the guard silently skipped it and the new columns were never created. The following statements reference `organization_id`/`from_agency_id`/`to_agency_id`/`submitted_by` → error → migration aborted. Confirmed by `types.ts:3760-3806` (columns absent) and by `comp_grid_history` + `transfer_request_activity` being absent from `types.ts` entirely. | High |
| 10 | ~52 `SECURITY DEFINER` functions (61 declarations) reimplement the same `auth.uid() = X OR is_in_downline(…) OR has_role(…,'admin')` shape, inheriting every weakness above **while bypassing RLS**. `get_book_of_business(_scope text, _agent_id uuid)` (`20260523170641:2`) takes a caller-supplied `_agent_id` and needs a dedicated re-read. | High |

### C.2 Missing indexes

`profiles.upline_id` — **unindexed**, while `is_in_downline` recursively joins on it once per candidate row from ~30 policies. Every RLS evaluation is a sequential scan of `profiles`. This is the single highest-impact index on the platform.

`policies.agent_id` and `clients.agent_id` have only partial/composite unique indexes (`policies_agent_policy_number_uniq`, `clients_agent_phone_unique`) that the planner cannot use for a plain `agent_id` lookup — the exact predicate every policy filters on. `contract_requests` has **no index at all**.

Also missing: `contact_history.agent_id`, `wallet_transactions.agent_id`, `sms_conversations.agent_id`, `call_logs.agent_id`, `dial_lists.agent_id`, `state_licenses.agent_id`, `notifications.user_id`, `agent_commission_levels.agent_id`, and the five parent-derived join keys (`beneficiaries.client_id`, `client_financials.client_id`, `life_events.client_id`, `sms_messages.conversation_id`, `dial_list_entries.list_id`).

### C.3 Membership model

A user belongs to exactly one org, via one nullable column: `profiles.organization_id`. There is **no membership table**. `role_permissions` has `UNIQUE(profile_id, organization_id)`, implying a many-orgs design nothing else supports. `profiles.staff_for_user_id` exists and is referenced by **zero policies** — a dangling concept. There is no active-org / session-tenant concept anywhere, so even with two memberships nothing would know which applies to a request.

### C.4 Remediation — what `20260718100000_org-isolation.sql` does

Written, **not applied**. Covers findings 1–8 and C.2:

1. `organization_memberships` (multi-org capable), backfilled from `profiles.organization_id` and from `organizations.owner_id`.
2. Helpers `my_org_ids()`, `is_org_owner()`, `same_org()`, `is_platform_admin()` — the last deliberately **not** used to grant any data read.
3. `organization_id` added, backfilled and insert-stamped (trigger) across 23 org-owned tables, each indexed.
4. All 46 generated policies rewritten to require an org match; the blanket `admin` data bypass removed. Rows that could not be backfilled keep a personal-scope fallback so no existing user is locked out.
5. `is_in_downline` rewritten: `UNION`, depth cap of 50, self-reference guard, and constrained to the upline's organization. Signature unchanged, so all ~30 policies inherit the fix.
6. Trigger rejecting an `upline_id` that crosses an org boundary.
7. Legacy permissive `profiles` policies dropped (they OR with the new one, so the new policy did nothing while they stood).
8. RLS enabled on `commission_backfill_queue`; `announcements` org-scoped; `user_roles` moved to `UNIQUE(user_id, role)` with `super_admin` granted to existing operators and role administration restricted to platform staff.

**Not covered, deferred:** finding 9 (the aborted contracts-restructure migration needs its own repair — `alter table … add column if not exists` instead of `create table if not exists`), finding 10 (the `SECURITY DEFINER` function sweep), and the duplicate-migration cleanup.

### C.5 Service-role scoping

RLS cannot protect service-role paths. `src/lib/org-guard.ts` adds `assertOrgAccess`, `assertOrgOwner`, `assertSameOrg`, `assertMemberOfOrg`, `getMyOrgIds`, `filterToMyOrg`.

Applied to the concrete gap found: `assertCanManagePermissions(userId, orgId)` bounded the **caller** but never the **target**, so an owner of org A could pass a `member_id` from org B to `updateMemberPermissions`, `applyStaffPreset` or `setMemberRole` — the last of which deletes the target's existing roles and inserts a new one. All three now call `assertMemberOfOrg`.

`billing.functions.ts` already checks `agent.organization_id !== org.id` on the Nova seat paths. The onboarding functions that take a caller-supplied `agent_id` (`listOnboardingDocs`, `recordOnboardingDoc`, `getActiveContractsForAgent`, …) use the **RLS-bound** client, so the migration covers them.

---

## D. Permission Matrix

Six roles. `view` = read, `edit` = create/update, `del` = delete, `cfg` = configure, `—` = no access.

| Module | Super Admin | Agency Owner | Manager | Staff | Agent | Solo |
|---|---|---|---|---|---|---|
| Own clients / policies | — | view/edit (org) | per-permission | per-permission | view/edit/del | view/edit/del |
| Other agents' records | — | view/edit (org) | `mgr_view_client_records` / `mgr_edit_client_records` | `staff_view_clients` / `staff_edit_clients` / `staff_delete_clients` | downline only | — |
| Post a deal | — | yes | `mgr_post_deals_for_agents` | `staff_post_policies` | own | own |
| Commissions | — | view (org) | `mgr_view_agent_commissions` | `staff_view_commissions` | own | own |
| Team roster | — | full | `mgr_view_all_agents` | — | downline | — (upsell) |
| Permissions & roles | — | full | — | `admin_manage_staff_configs` + `staff_is_admin` | — | — |
| Recruiting | — | full | `mgr_access_recruiting` | `staff_view_recruiting` / `staff_edit_recruiting` / `staff_move_recruiting_stages` | own prospects | — |
| Contracting | — | full | `mgr_submit_carrier_requests` | `staff_view_contracts` / `staff_submit_carrier_requests` / `staff_edit_contracts` | own | own |
| Onboarding | — | full | `mgr_manage_onboarding` | — | — | — |
| Analytics | — | org-wide | `mgr_view_team_analytics` | `staff_view_analytics` | own | own |
| Leaderboard | — | org-wide | org-wide | — | org-wide | personal only |
| Billing | view (all orgs) | full | — | `admin_view_billing_readonly` | own Nova | own |
| Nova Pro | — | assign seats | use | `staff_nova_pro_enabled` | use | use |
| Support tickets | all | agency | — | `staff_view_all_tickets` / `staff_respond_tickets` | own | own |
| Agency settings | — | full | — | — | — | — |
| White-label | cfg | cfg (if purchased) | — | — | — | — |
| Orgs & subscriptions | full | — | — | — | — | — |
| Audit log | all | own org | — | — | — | — |

**Enforcement status.** Nav visibility is driven by `canSeeNavItem(url, access)` in `src/hooks/use-my-access.ts` — items are **hidden, never locked**. Server enforcement lives in `permissions.functions.ts` (`getMyAccess`, `assertCanManagePermissions`) plus the guards in C.5. Client-sent roles are never trusted; role resolution is always a server-side `user_roles` read.

**Gap:** the per-permission cells above are enforced at the module entry points, but RLS does not know about `role_permissions` at all. A manager whose `mgr_view_client_records` is off is stopped by the server function, not by the database. Closing that requires the permission keys to be reachable from policy expressions — Phase 2.

**Super Admin row is `—` on all customer data by design**, and `is_platform_admin()` is deliberately never used to grant a data read. Today's reality is the opposite (finding 2); the migration is what makes this row true.

---

## E. Workflow Maps

**Agency signup** → `/signup` → Supabase auth → `initSoloWorkspace`-equivalent org creation → Stripe Checkout (`agency_plan`, $399) → webhook `handleOrgEvent` sets `plan_type: agency`, `subscription_status: active` → owner lands on dashboard.
*Gap: no setup checklist. A new agency reaches an empty workspace with no guided path to a working configuration.*

**Solo signup** → `/signup/agent` → auth → `initSoloWorkspace` creates a `plan_type: solo` org and grants `agency_owner` → Stripe Checkout (`solo_agent`, $50) → webhook `handleSoloEvent` activates the org. **Nova is not included** — it is a separate $49 purchase.

**Invitation** → owner/manager creates `invitation_links` (token, carriers, levels) → email → `/onboarding/accept?token=` → `acceptInviteCreateAccount` → profile + `user_roles` + org membership → onboarding.

**Onboarding** → personal info → carrier selection → agreement signature → SureLC SSO → `surelc_progress` polling → `status` advances `invited → pending → onboarding → licensing → contracting → ready_to_sell → active`.
*Billing coupling: everything from `pending` onward is a billable seat (`BILLABLE_PROFILE_STATUSES`). Access = billable. The owner is excluded.*

**Licensing** → `state_licenses` + PDB upload. *No renewal reminders, no appointment tracking.*

**Contracting** → request → `contract_requests` → carrier level assignment (`agent_commission_levels`) → activation. Comp grids read from `commission_grids`. Transfers via `transfer_requests` with a timeline.
*Gap: the transfer restructure migration never applied (finding 9), so the org-scoped transfer columns and the activity table do not exist.*

**Retention** → `getAtRiskPolicies` surfaces lapse risk on the dashboard. *That is the entire workflow. No queue, no assignment, no outcome tracking.*

**Commission reconciliation** → **does not exist.** Commissions are calculated from posted deals and never compared against carrier statements.

**Support** → ticket → `support_tickets` → agency admin responds. *No `assigned_to` column, so tickets cannot be routed. Duplicated across two modules.*

**Nova subscription** → two paths: agent buys personally ($49, `nova_pro_source: personal`), or the agency buys seats and assigns them (`nova_pro_source: agency`). Personal takes precedence; on personal cancellation the webhook falls back to a free agency seat if one exists, otherwise a 48h grace period. The agency earns a 20% credit per active subscriber, applied as a negative Stripe balance transaction.

**Seat overage** → `countBillableSeats(orgId, ownerId)` → seats beyond 15 bill at $25 each.

---

## F. Launch-Readiness Checklist

### Blocker — cannot onboard a second agency

1. **Apply `20260718100000_org-isolation.sql`** and pass the verification below. Until then any agency-level admin can read every other agency's customer data, and a single cross-agency upline link leaks everything without any admin role.
2. **Verification, run as two different org members:**
   - Agency A member: `select count(*) from clients` returns only A's rows. Repeat for `policies`, `contract_requests`, `commission_schedule`.
   - A user holding `admin` in agency A gets **zero** rows from agency B.
   - `update policies set organization_id = '<other org>'` is rejected.
   - Setting a `profiles.upline_id` that points into another org raises `check_violation`.
   - A normal owner and agent can still use dashboard, pipeline, book of business, contracts and team.

### Critical — before charging anyone

3. **Stripe configuration.** 7 price IDs, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_ORIGIN`; webhook endpoint pointed at `/api/stripe/webhook`. Until then every billing surface correctly shows "not configured" and no money moves.
4. **Six other pending migrations** have not been applied: `20260715120000_dashboard-real-data`, `20260715130000_nova-automations`, `20260716100000_carrier-book-sync`, `20260716120000_monetization`, `20260717100000_role-permissions`, `20260717120000_contracts-restructure`. The last one **will abort as written** (finding 9) and needs repair before it is run.
5. **Nova Pro sells a phone number that cannot be provisioned.** Either connect a telephony provider or remove the number from the $49 offer. Selling it as-is is a refund liability.
6. **White-Label sells $999 + $499/mo for settings that are stored and not applied.** Same call: implement or withdraw.

### High

7. Repair finding 9 (`add column if not exists`, then create `comp_grid_history` and `transfer_request_activity`).
8. Sweep the ~52 `SECURITY DEFINER` functions; start with `get_book_of_business(_scope, _agent_id)`.
9. Fix `admin.settings.tsx` — it toasts success and saves nothing.
10. Add `assigned_to` to `support_tickets`; merge `help.functions.ts` into `support.functions.ts`.
11. Rate-limit the seven unauthenticated `api/public/*` write endpoints.
12. MFA for owner and admin accounts.

### Medium

13. Global search over clients, policies and agents — the palette currently only jumps to nav destinations.
14. Tasks module (table + UI). Referenced throughout the spec, absent entirely.
15. Agency setup checklist.
16. Retention module: queues, assignment, outcomes.
17. Server-side data export.
18. Drop the duplicate `sophai_*`/`nova_*` table pair; settle on one name.
19. Remove `mock-data.ts`, `producer-profile.functions.ts`, `client-detail-drawer.tsx`, the duplicate `requestCommissionLevel`, and the hardcoded `help.tsx`/`faq.tsx` arrays.
20. Notification preferences UI. **No automated message may send until an org configures and enables it** — currently enforced by the send worker not existing, which is not enforcement.

### Low

21. Move pricing from code constants to a `plans` table so §5's "configurable through the billing system" is literally true. `src/lib/billing/pricing.ts` is the single source today.
22. Consolidate the three `organizations_and_roles` migration copies and the duplicated `email_infra` pair.
23. `audit_log` coverage beyond permission changes.

### Future

24. Commission reconciliation against carrier statements.
25. Recruiting ATS (scheduling, scorecards, offers).
26. Mobile app shell.
27. Per-permission enforcement in RLS, so `role_permissions` binds at the database layer and not only at module entry points.

---

## Standing constraints

Carried forward from the product prompts; these hold across all future phases.

- All AI calls route through the Lovable gateway. Never call Anthropic directly.
- `commission_calculator.ts` and `saveClientFullRecord` are single sources of truth. Do not modify.
- DB trigger `trg_generate_commission_schedule` must remain **disabled** — re-enabling it double-calculates against the JS engine.
- Never trust a role sent from the client. Enforce on the server and in the database.
- SSN and banking data must be masked and permission-restricted.
- Super Admin must not casually access private customer data without an operational reason.
- No automated messages send until the organization configures and enables them.
