## Contracting Section — Build Plan

All 6 route files already exist as stubs; this plan replaces them with full implementations and adds the missing backend pieces.

### 1. Database migrations

Additions to existing tables:
- `carriers`: add `is_annuity_carrier bool default false`, `active bool default true`, `advance_cap_amount numeric`, `advance_cap_months int`. Keep existing `advance_cap` text for display fallback.
- `contract_requests`: add `submitted_at timestamptz`, `issue_description text`.
- `agent_commission_levels`: add `assigned_by uuid`, `assigned_at timestamptz default now()`, unique `(agent_id, carrier_id)`.

New table:
- `producer_documents` (`agent_id`, `doc_type`, `file_url`, `start_date`, `expiration_date`) with owner RLS.

Storage:
- Create private bucket `producer-docs` with RLS so an agent can read/write only objects under their own `{agent_id}/...` prefix; uplines/admins can read downline objects.

Seed:
- Insert/upsert the 15 carriers from the spec with phone, hours, speed, pay frequency, `is_annuity_carrier=true` for Athene / F&G / Prudential, `agent_portal_url`, `training_url`, placeholder `about_text`, `ideal_client`.

### 2. Server functions (`src/lib/contracting.functions.ts`)

All use `requireSupabaseAuth`:
- `listMyContracts()` — current agent's `contract_requests` joined with carrier.
- `createContractRequest({ carrier_id, notes })` — validates annuity gate (block if carrier `is_annuity_carrier` and no `aml_certificate` row).
- `listDownlineContractMatrix()` — agents in `is_in_downline(auth.uid(), agent_id)` × all carriers; returns latest status per cell.
- `assignDownlineContract({ agent_id, carrier_id, level_id })` — upsert `agent_commission_levels` (level must be ≤ uploader's level for that carrier) + insert `contract_requests`.
- `updateContractStatus({ id, status, writing_number?, issue_description? })` — owner or upline only; state-machine guard.
- `listWorkInbox()` — pending downline contracts, transfer_requests awaiting approval, missing commission-level assignments.
- `listTransferRequests()`, `respondTransferRequest({ id, decision })`.
- `listInvitationLinks()`, `createInvitationLink({ name, assignments })`, `deleteInvitationLink({ id })`. Token = `crypto.randomUUID()`.
- `getCommissionGridForCarrier({ carrier_id })` — returns rows where `level_pct <= agent's assigned level_pct` for that carrier; rows above are filtered server-side.
- `uploadAnnuityCertSignedUrl()` — returns signed upload URL into `producer-docs/{uid}/aml_certificate.pdf`; companion `recordAnnuityCert({ file_url })` writes `producer_documents`.
- `getMyAnnuityCert()`.
- `listCarriers({ search?, filter? })`.

### 3. Pages

`/contracting/requests` (`contracting/index.tsx`)
- Tabs: My Contracts | Downline Contracts | Work Inbox.
- My Contracts: status-chip filter row with counts, single-open shadcn `Accordion` of carrier cards, status badges (Requested/Submitted/Processing/Issue/Active/Rejected with spec colors), expanded view shows writing number + agent portal link + activated date + orange alert if Issue.
- "+ Create Request" `Dialog`: searchable carrier `Command` combobox + notes; annuity gate error with link to `/contracting/annuity-training`.
- Downline Contracts: sticky-header matrix (`<table>`), colored dot per cell, "+" for empty cell opens assign modal (level dropdown restricted to ≤ upline's level), click filled cell opens status-update modal.
- Work Inbox: list of pending action items with Review/Fix buttons routing to the right tab.

`/contracting/invite`
- Form: link name + dynamic assignments rows (carrier + level), level options restricted to ≤ current agent's level. Validation banner when empty. Submit creates row.
- "My Invitation Links" table: name, carrier count, created date, copy URL (`${origin}/join/${token}`) with toast, delete confirm dialog.

`/contracting/transfers`
- Empty state per spec; otherwise cards with carrier, from/to upline names, status badge, Accept/Decline buttons.

`/contracting/commission-grids`
- Single-open accordion of carriers the agent is contracted with. Sub-sections per age group, table with gold-highlighted row for the agent's own level. Rows above level never come back from the server.

`/contracting/annuity-training`
- Training info card + WebCE link.
- Conditional: yellow alert + dropzone (PDF, ≤10MB) when no cert; green banner + filename/date/preview + Replace button when present. Upload via signed URL into `producer-docs`.

`/contracting/carriers`
- Search input + filter tabs (All / Weekly Pay / Monthly Pay / Fast <5 days).
- 2-col grid of carrier cards with phone/hours/speed/pay/cap/ideal client, Agent Portal + Training buttons, full-width About button opening a shadcn `Sheet` drawer with `about_text`. Annuity carriers get an "Annuity" badge.

### 4. Shared bits
- `src/components/contracting/status-badge.tsx` — single source of truth for status color mapping (reused on chips, cards, matrix).
- All currency via `Intl.NumberFormat`, all dates via `date-fns`.
- Skeleton loaders on every list; empty states per spec.
- Sidebar already lists these 6 routes — no nav changes needed.

### 5. Out of scope (call out, don't build)
- Public `/join/[token]` onboarding page — flagged for a follow-up; invitation links will be generated and copyable now.
- Admin tools to seed `commission_grids` rows — seeding a representative GTL/Mutual of Omaha grid only; full grids belong to a separate import flow.
