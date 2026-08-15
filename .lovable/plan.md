# Agency Settings + Carrier System: consolidate into one place

## What the audit found

Most of what the brief asks for already exists — it is just scattered across separate pages and half-connected. Confirmed by reading the code and querying the live database:

- Settings navigation currently lists 19 entries, including separate items for Carriers, Comp Grids, Levels & Positions, "How contracting works", Submission templates, Roles, Notification settings, Emails, Automations, Integrations and White Label.
- `/settings/agency` already has tabs (General, Emails, Automations, Integrations, Sample data) and its own permission gate via `canEditAgencySettings`.
- The data model largely supports the brief already: `carriers` (global library, with `is_private` / `owner_organization_id` for agency-specific ones), `org_carriers` (per-agency config, contracting URLs, `default_advance_option`, agent-visibility flags), `carrier_comp_levels`, `commission_grids` (already has `age_group_min` / `age_group_max`, year 1 / 2-5 / 6+ rates, `confidence`, `source_file`), `agency_levels` (base pct, rank, `can_invite`, active), `agency_level_carrier_mappings` (position → carrier level + pct + advance), `agent_commission_levels` (per-agent level, writing number, advance), `contract_requests`, `org_carrier_methods` (contracting methods), `discord_integrations` (already named, per-event toggles, failure backoff).
- A shared compensation resolver already exists (`src/lib/compensation/resolve.ts` + `lookup.server.ts`) and the grid editor already treats age bands as first-class rows.

So this is mostly consolidation, wiring and gap-filling — not a new system. No new parallel tables.

## Scope note

This is a large build. It will be delivered in five phases, in this order, each one working and testable on its own. Nothing existing gets deleted where data is involved — pages are folded into tabs and old URLs redirect.

## Phase 1 — Settings navigation collapse

- Main Settings navigation reduced to: Agency Settings, Security, Billing, Nova Pro, Support Desk.
- Agency Settings gets the eight tabs in order: General, Roles and Permissions, Levels and Positions, Carriers, Contracting, Notification Settings, Automations, Integrations.
- Existing pages become tab panels (their components are already standalone: carrier setup, levels panel, contracting settings panel, roles, notifications, automations/Discord).
- Old routes kept as one-hop redirects into the right tab: `/settings/comp-grids` and `/settings/carriers` → Agency Settings with the Carriers tab, `/settings/levels`, `/settings/contracting`, `/settings/roles`, `/settings/notifications`, `/settings/integrations`, `/settings/templates`. Emails page and White Label removed from the product surface (data untouched).
- Setup progress strip at the top of Agency Settings: agency profile, levels created, one carrier configured, contracting method ready, ready for agents — each linking to the tab that fixes it.

## Phase 2 — Levels and Positions ↔ carrier levels

- Position editor shows every active carrier and lets the owner pick the matching carrier level per carrier, with a suggested match by closest base percentage that must be confirmed.
- "Use position percentage as fallback" option when a carrier has no matching level.
- Agents only ever see their own position and positions below them.

## Phase 3 — Carriers tab and the Add Carrier flow

- Carriers tab: search, status filter, active/needs-setup counts, Add Carrier, and per-carrier rows showing logo, toggle, configuration status, products, levels, advance, contracting method and open requests.
- Configuration status computed from real data: Draft, Needs Levels, Needs Grid Review, Needs Advance, Needs Contracting Method, Ready to Activate, Active, Inactive, Archived. The active toggle refuses to flip until minimum setup resolves, and says exactly what is missing.
- Guided Add Carrier flow saving after each step: pick from the global library or add a custom carrier → basic settings → upload one or many grid files (PDF, image, screenshot, spreadsheet) with AI extraction into a review screen that flags low-confidence cells, missing/overlapping age bands and unclear levels → review carrier levels → advance (carrier maximum + agency default, capped) → contracting methods with a default → review and activate.
- Activation allowed on fallbacks alone, with a plain warning that product/age-specific rates are not available yet.
- Delete only when a carrier has no contracts, policies, requests or commissions; otherwise Archive, with the difference explained before confirming. Archived carriers keep their history and can be restored.

## Phase 4 — Downstream: agents, deals, contracts

- Only active carriers appear in carrier selection, contract requests, Pipeline and Post a Deal; product lists come from the carrier's configured products.
- Post a Deal asks insured age (or DOB) and any state/risk input the matching grid needs, then resolves through the shared resolver in the brief's precedence order, returning the rule, level, band, fallback and advance used.
- A deal that cannot resolve saves with a visible "Compensation Review Needed" state and notifies the owner — never a silent zero.
- Agent contract activation requires carrier, agent, level or fallback, advance, writing number, effective date when known and status; level and advance are locked to agents; the compensation source is shown.
- Contract request workflow on the brief's nine statuses, with Agent Action Needed requiring an agent-visible note, in-app notification on every status or action change, and a full timestamped history of status, note, writing number, level and advance changes with the responsible staff member.

## Phase 5 — Automations, Integrations, permissions, tests

- Automations tab owns Discord: Add Discord Bot form (name, purpose, channel, webhook, events, enabled), events limited to Sales, Announcements, New Agents, one or many per bot, several bots per agency. Cards show last success, last error, test send, edit, disable, remove. Webhook stored server-side and only ever shown masked.
- Discord privacy filter enforced server-side: no client or insured names, contacts, policy numbers, DOBs, addresses, beneficiaries or private notes. Delivery ledger keyed on a stable event id so a retry cannot double-post.
- Integrations tab becomes a catalogue: Google Calendar, Zapier, Make, Calendly, Slack, Discord (Available → Configure in Automations), SureLC, NIPR, Email Provider, API Access. Anything unimplemented says Coming Soon with no fake connect flow.
- Granular permissions (manage agency profile, roles, levels, carriers, grids, agent contracts, automations, integrations) enforced in UI, server functions and row-level policies. Regular agents cannot reach Agency Settings at all.
- Audit event on every important change with organization, user, action, record, old value, new value, timestamp.

## Technical notes

- Migrations are additive and forward-only: constraints for valid percentages and advance values, age band min ≤ max, no overlapping duplicate rules for the same carrier level + product unless distinguished by state or risk, no cross-agency rows, no duplicate active agent contract per carrier, no duplicate Discord delivery. Plus any missing columns for archival, carrier configuration status and the extraction review queue. `carriers.is_private` / `owner_organization_id` already give us global-vs-agency records; global rows stay read-only for agencies and per-agency edits land on `org_carriers`.
- Types regenerated after each migration; PostgREST schema reloaded.
- Baseline typecheck, lint, tests and production build recorded before the first edit; the existing `scripts/*-check.ts` suite (including `settings-ia-check.ts`, which currently asserts the old separate-page structure) is updated to assert the new information architecture, and new checks are added for the twenty listed behaviours.
- Carrier library seed data uses only information already in Agent Cloud or reliably sourced; nothing is invented, and unavailable fields are left blank for the owner.

## Known limitation

Grid extraction accuracy varies with file quality, so the review step stays mandatory — nothing extracted is ever published unreviewed.
