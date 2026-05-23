# Pipeline (CRM) — Implementation Plan

Rebuild `/pipeline` from mock data into a fully Supabase-backed CRM with a 3-column kanban, Sold list, Add/Import flows, and a rich slide-out client detail panel with 9 tabs. Realtime + optimistic drag-and-drop.

## Database

All tables already exist (`clients`, `beneficiaries`, `client_financials`, `contact_history`, `life_events`, `needs_analysis`, `calendar_events`, `policies`) with proper RLS.

Single migration needed:
- Enable Supabase Realtime on `clients` and `contact_history` (ALTER PUBLICATION supabase_realtime ADD TABLE …).
- The current `clients.stage` is a `pipeline_stage` enum. Confirm enum values include `new`, `callback`, `almost_there`, `sold`. If not, ALTER TYPE to add missing values (additive only).

## Server functions (`src/lib/pipeline.functions.ts`)

All use `requireSupabaseAuth`; RLS handles agent/downline scoping.

- `listPipelineClients()` → all clients for current agent grouped/returned flat; includes `is_beneficiary_of` derived field via join on `beneficiaries`.
- `createClient(input)` — zod-validated insert.
- `updateClient({id, patch})` — partial update (used by inline edits + drag/drop stage change).
- `importClients({rows})` — bulk insert from CSV (server-side zod validation, max 1000 rows).
- `markClientSold(id)`.
- Detail panel:
  - `getClientDetail(id)` → client + financials + beneficiaries + contact_history + life_events + needs_analysis + policies + upcoming calendar_events.
  - `upsertFinancials`, `addBeneficiary` / `updateBeneficiary` / `deleteBeneficiary` (with 100% sum check),
  - `addLifeEvent` / `deleteLifeEvent`,
  - `logContact({type, note})` (writes contact_history, also bumps `last_opened_at`),
  - `saveNeedsAnswer({question_key, response})`,
  - `scheduleEvent({title, start_at, end_at, notes})` (writes calendar_events),
  - `touchLastOpened(id)` called when drawer opens.

## Frontend

### Route
`src/routes/_authenticated/pipeline.tsx` — rewrite.

### Page chrome
- Header: title "Pipeline" / "Track your sales leads", right actions `Import Clients` + `Add Client` (primary).
- Search input (debounced, filters by name/phone client-side over loaded list).
- Tabs: `Pipeline (N)` / `Sold (N)` — counts from query data.

### Kanban (Pipeline tab)
- 3 columns: New / Cold (`new`), Callback (`callback`), Almost There (`almost_there`).
- Column tints via semantic tokens.
- `@dnd-kit/core` for drag and drop. On drop: optimistic `setQueryData` then `updateClient` mutation; rollback on error.
- Lead card: avatar initials, name, phone, last_opened_at, temperature badge (hot/warm/cold with red/orange/slate), score pill (color band), "Beneficiary of …" line when applicable.
- Empty column placeholder text.

### Sold tab
- Flat card grid of clients where `stage='sold'`; each card shows latest policy fields (carrier/product/policy_number/effective_date/monthly_premium) via join.

### Add Client modal
- shadcn Dialog + react-hook-form + zod. Fields per spec. Temperature + Stage selectors. On success: invalidate `pipeline` query.

### Import Clients modal
- CSV parsed client-side (papaparse). Validate headers, show first 5 rows preview, then call `importClients` with parsed rows.

### Client Detail Drawer (`src/components/pipeline/client-detail-drawer.tsx`)
- shadcn Sheet, ~50vw on desktop, full-width on mobile. Replaces existing generic drawer for pipeline use.
- Header: avatar, name, temperature badge, phone; right `Call` / `SMS` actions (call → `tel:`, SMS → existing /phone with prefill).
- Stage progress bar: 4 clickable steps; click moves stage via `updateClient`.
- Right buttons: `Submit Case for Design` (links to /post-deal prefilled), `Mark Sold` (green).
- Two-column body: Left = inline-editable contact info (click cell → input, blur/Enter saves, debounced mutation). Right = tabs.

### Tabs (right column components under `src/components/pipeline/tabs/`)
1. **Needs Analysis** — scripted 5-step flow with Sophai tip per question; progress bar; persists each answer via `saveNeedsAnswer`. Conditional branches per spec.
2. **Notes** — Tiptap editor (`@tiptap/react`, `@tiptap/starter-kit`) with Bold/Italic/Lists/Clear toolbar. `Add Note` + `Medical Note` (flag). Renders saved notes (newest first) using `contact_history` rows of type `note` (medical flagged via `note` prefix tag).
3. **Schedule** — `Schedule on Calendar` opens dialog with shadcn Calendar + time picker + event_type select → `scheduleEvent`. Lists upcoming events (start_at > now).
4. **Beneficiaries** — table + add/edit dialog; percentage-sum warning when ≠ 100%.
5. **Referrals** — simple list backed by `contact_history` entries of type `referral` (no new table — store name/phone/relationship in `note` JSON string). Add via dialog.
6. **Financials** — fields bound to `client_financials` (upsert on blur); total monthly income computed live; info banner.
7. **Client Care** — communication prefs (write to `clients.preferred_contact`/`best_time_to_call`/`communication_notes`), contact history timeline with filter chips, `Log Contact` dialog, Life Events section with add/delete.
8. **Policies** — locked card with `Mark Sold` when stage ≠ sold; otherwise table of policies + `Add Policy` link to /post-deal?client_id=…
9. **Email** — yellow banner when no email; otherwise 3 hardcoded templates (We Just Spoke / Quote / Check In) → compose view with `{{firstName}}` substituted; `Send` opens `mailto:` link (server-side email out of scope here).

### Realtime
- Subscribe to `clients` table changes in the page component → invalidate `pipeline` query.
- Subscribe to `contact_history` for the open client_id in drawer → invalidate detail query.

### Dependencies to add
- `@dnd-kit/core`, `@dnd-kit/sortable`
- `papaparse` + `@types/papaparse`
- `@tiptap/react`, `@tiptap/starter-kit`

## Out of scope (call out for follow-up)
- Sending real email (mailto: only for now).
- Score % auto-recalc engine — score is read-only display from existing `score_pct` column.
- Bulk drag of multiple cards.
- Mobile-stack accordion polish (basic responsive only).

## Technical notes
- Query keys: `['pipeline','list']`, `['pipeline','detail', clientId]`.
- All mutations: optimistic where safe (stage move, inline edits), then invalidate on settle.
- Sanitize Tiptap HTML on read with DOMPurify before render.
- CSV import capped at 1000 rows; row-level zod validation with error report back to UI.
- Keep all colors via design tokens; temperature badge variants in `tailwind`-style cva.
