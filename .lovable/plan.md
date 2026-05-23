## Scope

Three surfaces:
1. `/contracting/invite` — 2-step upline invite form + "My Sent Invites" table
2. `/join/$token` — public 5-step agent onboarding (account → personal → carriers → agreement → SureLC)
3. `/contracting/onboarding` — upline dashboard with 4 tabs (Invite Manager, Document Manager, Change Requests, SuranceBay Progress)

SureLC integration is **stubbed**: "Open SuranceBay" returns a mock URL and seeds fake progress rows that randomly advance on the manual Refresh. No email sending — success modal shows copyable invite link; agents already on Agent Cloud get an in-app notification.

## Database migration

Extend existing `invitation_links` (already has token, name, carrier_assignments, created_by) with:
- `sent_on_behalf_of`, `existing_agent_id`, `linked_agent_id` (uuid → profiles)
- `new_agent_first_name`, `new_agent_last_name`, `new_agent_email` (text)
- `invite_signature_html` (text)
- `status` (text default 'pending'), `onboarding_step` (int default 0)
- `agent_started_at`, `agent_completed_at`, `expires_at` (default now()+30d)
- `surelc_agent_id` (text)

New tables (all with RLS as specified):
- `surelc_progress` (agent_id, invitation_id, section_name, completed, last_synced_at; UNIQUE(agent_id, section_name))
- `change_requests` (submitted_by, agent_id, carrier_id, contract_request_id, request_type, other_description, new_upline_id, new_level_name, new_level_pct, status default 'deferred', submitted_at, resolved_at)
- `onboarding_documents` (agent_id, invitation_id, uploaded_by, doc_type, file_url, file_name, uploaded_at)

Extend `profiles` with `invite_signature_html` (text). Extend `carriers` with `surelc_carrier_code` (text), `datalink_enabled` (bool default false).

RLS: invites/progress/change-requests/docs all scoped to owner + downline-select + admin, mirroring existing pattern (`is_in_downline`, `has_role`). Public token lookup handled via a SECURITY DEFINER function `get_invite_by_token(token)` returning only safe fields (no PII of upline beyond name).

Storage: reuse existing private `agent-documents` bucket for onboarding docs (path prefix `onboarding/{agent_id}/`).

## Server functions (`src/lib/contracting.functions.ts`)

Auth-protected (requireSupabaseAuth):
- `getMyContractedCarriers` — returns carriers where current user has agent_commission_levels, with their level_pct (used to gate carrier/level options on invite form)
- `searchDownlineAgents(query)` — typeahead for existing-agent + new-upline pickers
- `createInvite(payload)` — validates levels ≤ upline's, inserts invitation_links, returns `{ id, token, url }`
- `listMyInvites({ scope: 'mine' | 'downline' })`
- `addCarriersToInvite`, `updateInviteCarrierLevel`, `deleteInvite`, `resendInvite` (no-op email; bumps a timestamp)
- `saveInviteSignature(html)` → profiles.invite_signature_html
- `listOnboardingDocsForAgent(agentId)`, `uploadOnboardingDoc(agentId, docType, fileMeta)`, `getDocSignedUrl(id)`
- `submitChangeRequest(payload)` — validates contract active 90+ days
- `listChangeRequests`, `updateChangeRequest` (admin only), `deleteChangeRequest`
- `listSurelcProgress({ scope })`, `refreshSurelcProgress(agentId)` — stub: random advance of incomplete sections

Public (no middleware, used by `/join/$token`):
- `getInviteByToken(token)` — calls SECURITY DEFINER function; returns upline name + carriers + status. Returns 404-ish if expired.
- `acceptInviteCreateAccount(payload)` — signs up new user via supabaseAdmin, links invitation_links.linked_agent_id, sets agent_started_at, sets profiles upline_id = invite.created_by
- `acceptInviteLinkExisting(token)` — called after login; links existing user to invite
- `saveOnboardingPersonalInfo(token, fields)` — updates profiles + SSN via existing `ssn_set`; bumps onboarding_step=1
- `saveOnboardingCarrierChoices(token, choices)` — creates contract_requests rows (status='requested'); bumps step=2
- `signOnboardingAgreement(token, name)` — inserts producer_agreements row; bumps step=3, sets agent_completed_at; notifies upline
- `startSurelcSso(token)` — stub: returns `https://example.com/surelc-stub/{surelc_agent_id}`; seeds 8 surelc_progress rows (all incomplete); bumps step=4, sets invitation_links.status='in_surelc'

## Routes & components

**Authenticated routes** (under `_authenticated/contracting/`):
- `invite.tsx` — 2-step wizard (Stepper, AgentInfoStep, CarrierLevelsStep, SuccessPanel) + SentInvitesTable below
- `onboarding.tsx` — tab layout (Tabs from shadcn) with 4 tab components:
  - `InviteManagerTab` — toggle direct/all-downline, search, filter, expandable rows w/ per-carrier status, Add Carriers modal, Edit Level modal
  - `DocumentManagerTab` — agent selector, doc cards (E&O, AML, Banking, Driver's License, Agreement) with upload/replace/view
  - `ChangeRequestsTab` — submit modal + table; admin sees edit/delete-status controls
  - `SurelcProgressTab` — per-agent progress cards, manual Refresh button calling `refreshSurelcProgress`

**Public routes** (top-level, not under `_authenticated`):
- `join.$token.tsx` — single page with internal `step` state driven by `invitation_links.onboarding_step`. Renders Step0Account / Step1Personal / Step2Carriers / Step3Agreement / Step4Surelc. Loaders use public server fns; mutations call useServerFn.

**Components** (`src/components/contracting/`):
- `CarrierLevelPicker` — checkbox card + product-group rows with locked-level logic
- `LevelDropdown` — capped at upline pct
- `MaskedSsnInput` — reuses existing pattern from Producer Profile
- `InviteStatusBadge`, `ContractStatusBadge`, `SurelcSectionRow`
- `DocumentCard` — used in both onboarding dashboard and (later) agent self-service

Add sidebar nav links: "Invite Agent" → `/contracting/invite`, "Onboarding Dashboard" → `/contracting/onboarding`.

## Validation rules

- Invite: ≥1 carrier, every selected carrier has a level. Levels checked server-side against `agent_commission_levels` for `created_by`.
- Onboarding personal: zod for SSN (9 digits), DOB, ZIP (5), phone (10).
- Carrier selection: ≥1 carrier set to "Yes".
- Change request: server-side check that referenced `contract_requests.activated_at < now() - 90 days`.
- Token resolution: expired or used tokens return a friendly "expired" state.

## Out of scope (v1)

- Real SureLC / NIPR API calls — stubbed
- Real email sending — copy-link only, in-app notifications
- Draw-to-sign signature pad — type-to-sign only
- Carrier-added in-app email — replaced with notification row
- Realtime auto-refresh (Supabase Realtime) — explicit Refresh button + 60s polling on dashboard
- Photo cropping, fax integration, NIPR lookup button

## Verification

1. Migration applies cleanly; `supabase--linter` passes.
2. As upline: open `/contracting/invite`, select 2 carriers + levels, send → success modal with copyable URL.
3. Open URL in incognito → step 0 → create new account → walk through 4 steps → reach SureLC stub button.
4. Click stub button → opens example.com URL; back in dashboard, SuranceBay Progress tab shows new agent with 8 incomplete sections; Refresh advances some.
5. Onboarding dashboard: Invite Manager shows the invite as "In SureLC"; Document Manager allows upload; Change Requests submission blocked unless a 90-day-active contract exists.
