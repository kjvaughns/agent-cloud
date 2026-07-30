# Contracting & Licensing Operations — implementation plan

## What already exists

Inspected before designing anything. The following are load-bearing and are
**reused, not rebuilt**:

| Concern | Existing asset |
| --- | --- |
| Tenancy | `organizations`, `organization_memberships`, `profiles.organization_id` |
| RLS helpers | `my_org_ids()`, `is_org_owner(uuid)`, `same_org(uuid)`, `is_platform_admin()`, `is_in_downline(uuid,uuid)`, `has_role(uuid,app_role)` |
| Service-role guards | `src/lib/org-guard.ts` — `assertOrgAccess`, `assertOrgOwner`, `assertSameOrg`, `assertMemberOfOrg` |
| Roles & permissions | `user_roles`, `role_permissions` (38 flags), `src/lib/permissions.functions.ts` |
| Carrier catalog | `carriers` (global, 18 cols, **no** `organization_id`) |
| Agent↔carrier state | `contract_requests`, `agent_current_contracts`, `agent_commission_levels` |
| Licensing | `state_licenses`, `pdb_uploads` |
| Producer records | `profiles` (50 cols), `producer_documents`, `producer_banking`, `producer_agreements`, `background_questions` |
| Change workflows | `change_requests`, `commission_level_requests`, `transfer_requests` |
| Ops plumbing | `tasks`, `notifications`, `notification_preferences`, `audit_log`, `export_log`, `ssn_audit_log` |
| Storage | `producer-docs` and `agent-documents` buckets, both private, folder-per-user policies |
| External stubs | `surelc.service.ts`, `agentsync.service.ts`, `carrier-sync.functions.ts` |

## Two architectural decisions

### 1. Carriers stay a shared catalog with a per-org overlay

`carriers` is global today and is referenced by `contract_requests`,
`agent_commission_levels`, `commission_grids` and more. Copying it per
organization would fork every one of those foreign keys and create exactly the
duplicate source of truth the brief warns against.

Instead:

- `carriers` remains the shared catalog of real carriers.
- `org_carriers` is the per-organization overlay: which catalog carriers this
  agency uses, plus every agency-specific field (contracting method, portal
  URL, SureLC link, turnaround, instructions, staff notes, status).
- An agency can also create a **private carrier** — a `carriers` row flagged
  `is_private` and owned by that org — for carriers not in the catalog.

Every downstream table (`requirements`, `comp levels`, `hierarchies`,
`writing numbers`, `templates`) hangs off `org_carriers`, so it is
organization-isolated by construction.

### 2. `contract_requests` and `contracting_requests` are different things

`contract_requests` currently means *"this agent has (or is getting) this
carrier"* — it carries `activated_at`, `writing_number`, `status='active'`, and
feeds the agent-facing carrier list. Its `contract_status` enum has six values
and cannot express the seventeen-status operations workflow.

So:

- `contract_requests` stays the **appointment record** — the fact that feeds
  Ready to Sell.
- `contracting_requests` (new) is the **unit of operational work** — the rich
  status workflow, assignment, readiness, packet and submission tracking. When
  one reaches `approved` / `writing_number_issued` it writes through to the
  appointment record rather than becoming a second answer to the same question.

## Phases

| Phase | Contents | State |
| --- | --- | --- |
| 1 | Data foundation: all migrations, RLS, grants, indexes, audit + integration columns | this session |
| 2 | Server layer: permission keys, readiness engine, packet/template/export services, audit helper | this session |
| 3 | UI: Contracting Operations shell, Overview, Requests, Carrier Directory, Packet | this session |
| 4 | UI: Writing Numbers, Comp Levels, Hierarchies, Licensing, Ready to Sell, Staff Queue, Settings | follow-up |
| 5 | CSV import, bulk actions, notifications wiring, hierarchy-change approvals | follow-up |

## Integration posture

No fake integrations. Every externally-sourced table carries
`external_provider`, `external_record_id`, `external_status`, `last_synced_at`,
`sync_source`, `sync_error`, `manual_override`, `verification_source` so a real
SureLC / NIPR / AgentSync adapter can be added later without a schema rewrite.
Licensing data is labelled **manually verified** in the UI and never described
as live or synced.

## What cannot be verified from this environment

The Supabase MCP in this session is bound to a different project and the Agent
Cloud database host is blocked by the network policy. Migrations are written
and committed; they are applied on the Lovable side. Runtime behaviour against
real tables is therefore unverified here — typecheck and production build are.
