# Promise vs reality, navigation and role matrix — audit 2026-09-10

## A. Promise vs reality

Pricing has one source, `PRICING` in `src/lib/billing/pricing.ts:11-43`, imported by both the
landing page and Stripe checkout, so copy and billing cannot drift.

| Claim | Advertised | Reality | Status |
|---|---|---|---|
| Solo $49/mo | `pricing.tsx:44` | `soloAgent: 49` | Complete |
| Agency $399/mo, unlimited agents, no seat charges | `pricing.tsx:66-83`, `product-stories.tsx:214-221` | `agencyBase: 399`; checkout is a flat `quantity: 1`; `included_seats`/`seat_overage_price` deliberately never applied (`pricing.ts:99-102`) | Complete |
| Nova $49/agent | `pricing.tsx:88`, `nova-section.tsx:96` | `novaPro: 49` | Complete |
| Sponsored Nova $39/active agent | `pricing.tsx:176-179` | `novaSponsored: 39`, own Stripe price | Complete |
| "We take no override, we are not an IMO" | `hero.tsx:97`, `story.tsx:163`, `support.tsx:50` | True — SaaS, outside the comp chain | Complete |
| Nova capability labels | `nova-section.tsx`, `lib/landing/nova-capabilities.ts` | "Pipeline autopilot" fenced as `soon` via `UNSHIPPED_GROUPS:102`, enforced by `scripts/landing-check.ts` | Complete — best-guarded area of the product |

Profit share: removed from every public surface this turn
(`nova-section.tsx` section deleted, `pricing.tsx:80,179`, `product-stories.tsx:230`,
`support.tsx` FAQ, `routes/index.tsx`). Remaining hits are internal only:
`nova_partner_commission_rate` on `organizations`, `billing.functions.ts:138`,
`webhook.ts:87,99`, `pricing.ts:42`. The mechanism is live but unadvertised — confirm that is the
intent. Dead residue removed: the unused `profit_share_viewed` analytics key.

Open items: `PRICE_IDS.seat_overage` is declared and never read (`billing/stripe.ts:26`) — delete
so nobody rewires a charge we do not make. The FAQ claims CSV export as an owner right
(`support.tsx:59`); server-side enforcement of export was not confirmed.

## B. Navigation

One registry, `src/lib/navigation.ts` (`PAGES`), drives the sidebar (`navFor`) and the command
palette (`reachableFor`), with two audiences, `core` and `staff` (`:362-388`). Personal
`/settings` is open to everyone; `/settings/agency` is one tabbed page gated `agency-admin`
throughout — a genuine consolidation of 19 former pages (`:312-321`). That separation is clean.

### N-1 A second, unaudited navigation system (High)
The 14 `admin.*` routes (`admin.agents`, `admin.carriers`, `admin.roles`, `admin.subscriptions`,
`admin.support`, `admin.migrations`, …) have **no `PAGES` entries at all**. They are reachable only
by URL or hardcoded link, and their per-role access is governed solely by `admin.tsx`'s own guard,
not by the audited gate system. Needs its own review.

### N-2 Routes unreachable from nav or palette (Major)
`/analytics`, `/back-office` root, `/carrier-sync`, `/finances_.reconciliation`, top-level
`/white-label` (legacy duplicate of `settings.white-label`). Either register them or redirect them
into the page that replaced them.

### N-3 `admin_staff` cannot reach Roles and permissions (Major)
`agency-roles` is gated `agency-admin` with no `staffPermission`, and `allowed()` (`:438-440`)
refuses any staff-audience page without one. The backend explicitly models this combination
(`permissions.functions.ts:167-171`, `staff_is_admin && admin_manage_staff_configs`), so a
permission the server grants has no path in the UI.

### N-4 Naming (Minor)
Three names for adjacent things: nav "Nova" → `/ai-assistant`, marketing "Nova AI", settings
"Nova Pro". "Document Intake" kept as an alias of "Import" (`:212-216`). Deliberate duplicate
registry rows exist for Contracting Ops (admin vs staff, `:218-232`), document review (`:272-273`),
and three carrier/level entries pointing at the same `/settings/agency` tabs (`:288-290`) — all
documented, all intentional; worth confirming they are still wanted.

### N-5 Leftover file (Polish)
`contracting.comp-grids-manage.tsx` still exists; confirm it is only the redirect and not a second
live comp-grid UI.

## C. Route and role matrix (server-enforced unless marked)

| Area | super_admin | agency_owner | manager | agent | staff |
|---|---|---|---|---|---|
| Dashboard | view | view | view | view | view |
| Clients / Pipeline / Post a Deal | all | all | downline scope | own | `staff_view_clients` / `staff_post_policies` (server) |
| Book of Business | all | all | scoped | own | `staff_view_policies` (server) |
| Finances | all | all | scoped | own | `staff_view_commissions` (server) |
| Reports | all | all | all | own | `staff_view_analytics` (server) |
| Team | manage | manage (owner) | view via `leads-people`; manage owner/role-checked | hidden | hidden |
| Carriers, comp grids, levels, contracting policy | manage | manage (`isOwner \|\| canManageCarriers`, `contracting-ops.functions.ts:143`) | only if granted | none | none |
| Contract requests (approve) | yes | yes | admin-flagged only | none | `staff_view_contracts` + `staff_is_admin` (server) |
| Invite an agent | yes | yes | `canInvite` by ladder (`permissions.functions.ts:471-482`) | if ladder allows | none |
| Billing / Nova Pro purchase | yes | yes (owner) | blocked server-side (`getOwnedOrg`) | blocked server-side | spend flag only |
| Comp grids manage | yes | yes | blocked by RLS `commission_grids_write` (owner only) | blocked | blocked |
| White label, sub-agencies | yes | yes (owner tier) | none | none | none |
| Roles and permissions | yes | yes | none | none | see N-3 |
| Writing numbers, document review | yes | yes | permission-gated | none | `staff_is_admin` / `staff_view_contracts` (server) |
| Admin console (`admin.*`) | only role with a route | none | none | none | none |

### N-6 Nav-hidden items — checked, not a finding
Both flagged cases are enforced below the UI. Billing mutations all run through
`getOwnedOrg` (`billing.functions.ts:19-29`, used at `:59,131,194,208,268,389,454`), which throws
for anyone who does not own an organization; the super-admin path additionally checks a role row
(`:559`). Comp-grid writes are owner-only at the database: `commission_grids_write`
(USING/WITH CHECK `is_org_owner(organization_id)`), with read scoped to `my_org_ids()`.
Nav hiding is decoration in both cases, not the boundary.
