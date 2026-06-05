
## Goal

Two-part fix for AgentLink migration:
- **Path A (fix):** Stop the "Import from AgentLink" dialog getting stuck on "checking connection…" and surface real errors.
- **Path B (build):** Give admins a way to upload an AgentLink export file (XLS/CSV/PDF/image) on behalf of an agent, run it through Lovable AI, preview, and commit it to the target agent's account.

No changes to the dialog's two-option layout, `scrape_requests` schema, or `import-helpers.ts`.

---

## Part A — Fix stuck "checking connection" state

**`src/lib/agentlink.functions.ts`**
- `getAgentLinkKeyStatus`: wrap the entire handler in `try/catch`. On any error or missing row, return `{ connected: false }`. Never throw. Log the underlying error server-side via `console.error` so it shows in server-function logs.
- `testAgentLinkKey` / `alCall`: log response `status` and `content-type` before parsing, so AgentLink auth/HTML responses are debuggable.

**`src/components/pipeline/agentlink-import-dialog.tsx`**
- Add a 5s timeout fallback: if `phase === "loading"` for >5s, force `setPhase("no_key")` and `console.error` a timeout message.
- When `statusError` is truthy, surface the error message inline (small destructive-styled text) instead of leaving the UI blank, and transition out of `loading`.
- Keep `retry: false`; add `retryOnMount: false` on the status `useQuery`.

**RLS sanity check (no schema change expected)**
- Verify `agent_integrations` has `GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated` and an RLS policy `auth.uid() = agent_id`. If missing, add via migration. (Existing migration appears correct — verify only.)

---

## Part B — Admin AI-assisted file import

### New DB objects (one migration)

`public.admin_import_jobs` table per the brief:
- Columns: `id`, `admin_id`, `target_agent_id`, `scrape_request_id` (nullable FK), `file_name`, `file_type`, `status` (`pending|extracting|ready_for_review|importing|completed|error`), `extracted_json jsonb`, `clients_imported`, `policies_imported`, `notes_imported`, `ai_error`, `created_at`, `completed_at`.
- Grants: `authenticated` + `service_role`.
- RLS: enabled; policy restricting to users with role `admin` or `manager` (via existing `has_role`).

Storage bucket `agentlink-imports` (private) for uploaded raw files, admin-only RLS.

### New server functions — `src/lib/admin-import.functions.ts`

All `requireSupabaseAuth` + admin role check at top of each handler.

1. `createAdminImportJob({ target_agent_id, scrape_request_id?, file_name, file_type, file_base64 })`
   - Uploads file to `agentlink-imports/{job_id}/{file_name}` via `supabaseAdmin`.
   - Inserts row with status `extracting`.
   - Calls Lovable AI gateway (`google/gemini-3-flash-preview`) with the extraction system prompt + file as `image_url` (data URL) for images/PDFs; for XLS/CSV, parse to text first (use `xlsx` for spreadsheets, raw text for CSV) and send as user text content.
   - Stores returned JSON in `extracted_json`, sets status `ready_for_review`. On failure, status `error` + `ai_error`.
   - Returns `{ job_id, extracted_json }`.

2. `getAdminImportJob({ job_id })` — returns job row for preview UI.

3. `confirmAdminImport({ job_id })`
   - Loads job, validates admin + status `ready_for_review`.
   - For each client in `extracted_json.clients`:
     - Run `detectDuplicate` by phone (last 7) against the **target agent's** existing clients; skip duplicates.
     - Insert into `clients` with `agent_id = job.target_agent_id`.
     - Insert each policy into `policies` with that client + target agent.
     - Insert each note into `contact_history` with `contact_type = "note"`, `agent_id = target_agent_id`.
   - Update counts on the job, set status `completed`, `completed_at = now()`.
   - If `scrape_request_id` present, update that row's status to `completed`.
   - Insert a `notifications` row for the target agent: title "AgentLink import complete", linking to `/pipeline`.

4. `discardAdminImport({ job_id })` — sets status `error` / removes pending state (no data inserted).

### Extraction system prompt

Instruct the model to return strict JSON exactly matching the shape in the brief (clients with nested policies + notes, stages limited to `new|callback|almost_there|sold`, temperatures `hot|warm|cold`). Include "respond with JSON only, no prose".

### Admin UI

Extend `src/routes/admin.import-requests.tsx`:
- Add an "Upload File" button on each pending `scrape_request` row.
- Button opens a new dialog `src/components/admin/ai-import-dialog.tsx`:
  1. Step 1 — File picker (accepts `.xls,.xlsx,.csv,.pdf,.png,.jpg,.jpeg`). Target agent pre-filled from the request.
  2. On submit → call `createAdminImportJob`, show spinner "Extracting with AI…".
  3. Step 2 — Preview table: clients count, policies count, notes count, expandable client list with key fields. "Confirm Import" + "Discard" buttons.
  4. Confirm → `confirmAdminImport` → success toast with imported counts, dialog closes, request list refetches.

Also expose a standalone entry under Admin sidebar later if needed, but per the brief it lives on the Import Requests page.

---

## Technical notes

- All AI calls use `process.env.LOVABLE_API_KEY` server-side, never client.
- File size cap on upload: 20MB (client-side guard + server check).
- For XLS/XLSX, install `xlsx` (`bun add xlsx`) and convert sheets to CSV text before sending to AI (keeps prompt small + reliable).
- PDF and images go to AI as data-URL `image_url` content blocks (Gemini multimodal).
- Idempotency: `confirmAdminImport` is gated on `status === 'ready_for_review'` to prevent double-imports.
- Duplicate skip count surfaced in the success toast.
- No changes to: `agentlink-import-dialog.tsx` layout, `scrape_requests` schema, `import-helpers.ts`.

---

## Files touched

- Edit: `src/lib/agentlink.functions.ts`, `src/components/pipeline/agentlink-import-dialog.tsx`, `src/routes/admin.import-requests.tsx`
- New: `src/lib/admin-import.functions.ts`, `src/components/admin/ai-import-dialog.tsx`, one migration for `admin_import_jobs` + storage bucket
- Dep: `bun add xlsx`

## Verification

1. Open pipeline → Import from AgentLink → confirm dialog resolves to `no_key` within 5s (or shows real error).
2. Save a bogus key → "Test Connection" surfaces specific error from `alCall` logs.
3. As admin, on Import Requests, upload a sample AgentLink XLS → preview shows extracted clients → Confirm → target agent's pipeline shows new clients + policies + notes; duplicate phones skipped; agent gets a notification.
