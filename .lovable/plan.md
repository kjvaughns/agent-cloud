## Goal

Upload one multi-sheet AgentLink export (Summary, Team Roster, Book of Business, All Clients, Client Notes) and route every row to the right downline agent — even when that downline hasn't created an Agent Cloud account yet. When they later sign up with the matching email, their pre-imported pipeline activates automatically.

## Data flow

```text
XLS upload (admin picks target agent = upline)
       │
       ▼
 AI extraction (one job per sheet, structured JSON)
       │
       ▼
 ┌─────────────────────────────────────────────────┐
 │ Team Roster  → pending_agents (status=inactive) │
 │ All Clients  → clients  (assigned_to_email = X) │
 │ Book of Biz  → policies (assigned_to_email = X) │
 │ Client Notes → contact_history                  │
 └─────────────────────────────────────────────────┘
       │
       ▼
 Owner today = upline (target agent) — visible in their book
       │
       ▼ (later)  Downline signs up with matching email
       │
       ▼
 handle_new_user trigger →
   merge pending_agents row into new profile
   reassign clients/policies where assigned_to_email = signup email
```

## Schema changes

1. **New table `pending_agents`** (one row per Team Roster entry):
   - `email` (unique key), `first_name`, `last_name`, `location`, `status_label`, `depth`, `contracts_label`, `upline_id` (→ profiles), `joined_date`, `last_active_label`, `source` ('agentlink_import'), `created_by`, `created_at`.
   - RLS: upline + admins can read/manage; service_role full.

2. **Add `assigned_to_email text` to `clients`, `policies`, `contact_history`** (nullable). Indexed. Filled when the import knows which downline a row belongs to but that downline has no profile yet.

3. **`handle_new_user` trigger** (run on `auth.users` insert): if a `pending_agents` row exists with `lower(email) = lower(new.email)`, copy first/last/upline_id/location into the new profile, set `status = 'active'`, then `UPDATE clients/policies/contact_history SET agent_id = new.id, assigned_to_email = NULL WHERE lower(assigned_to_email) = lower(new.email)`. Delete the pending row.

4. **Duplicate-detection helper** updated: dedupe key is `last-7-digits-of-phone + lower(first+last)` scoped across the entire upline's team (target agent's clients **plus** all clients with `assigned_to_email` belonging to one of their pending_agents/downlines). So re-importing or a downline importing later won't create dupes.

## Import logic

In `src/lib/admin-import.functions.ts`, rewrite `createAdminImportJob` / `confirmAdminImport`:

1. **Detect file shape**: if the upload is the multi-sheet XLS, parse all 5 sheets server-side with `xlsx` (the lib is already installed). Otherwise fall back to the existing single-sheet AI flow.
2. **Resolve owner per row**:
   - Build a name→email map from the Team Roster sheet.
   - For each client/policy row, take its "Agent" column → look up email via the roster → store `assigned_to_email`.
   - `agent_id` is set to the **target agent** (the upline) so the row is queryable today via RLS.
   - Rows with no Agent column fall through to target agent only.
3. **Team Roster** rows are upserted into `pending_agents` by lowercased email, `upline_id = target agent`.
4. **Client Notes**: matched to clients by `Client Name` (case-insensitive last+first); each note becomes a single `contact_history` row with `contact_type = 'imported_note'` and the raw `Note Content` in `note`.
5. **Stage mapping**: `New / Cold → new`, `Callback → callback`, `Almost There → almost_there`, `Sold → sold`.
6. **Carrier mapping**: best-effort match of carrier name against `carriers.name`; unmatched → null `carrier_id` with carrier name preserved in `product`.
7. **Duplicate skip counter** returned to the UI alongside the existing `clients_imported/policies_imported/notes_imported`.

## UI changes

`src/components/admin/ai-import-dialog.tsx` review screen gets:

- Four stat tiles instead of three: **Pending Agents**, **Clients**, **Policies**, **Notes**.
- A small grouped preview: "X clients will go to *Daniel Gonzalez* (pending signup)", "Y to *Xaviar Watts* (pending signup)", "Z stay with you" — derived from the per-row `assigned_to_email`.
- Confirm button text unchanged.

`src/routes/admin.import-requests.tsx` adds a small "Pending Agents" link/badge so the upline can see who's been pre-seeded.

## Files touched

| File | Change |
|---|---|
| `supabase/migrations/<new>.sql` | `pending_agents` table + RLS + grants, `assigned_to_email` columns + indexes, updated `handle_new_user` trigger |
| `src/lib/admin-import.functions.ts` | Multi-sheet branch, owner resolution, pending_agents upsert, scoped dedupe |
| `src/components/admin/ai-import-dialog.tsx` | 4-tile stats, per-agent grouped preview |
| `src/routes/admin.import-requests.tsx` | Optional "Pending Agents" link |
| `package.json` | `xlsx` (only if not already installed) |

## Out of scope

- Sending invitations to pending agents (Team Roster answer was "show as inactive only").
- Splitting SSN/medical out of notes (you chose single contact_history row).
- Editing the Path A AgentLink API flow.

## Verification

1. Upload `AGENTC~1.XLS` → confirm review shows 24 pending agents, 258 clients, 165 policies, 144 notes; per-agent grouped preview lists Daniel Gonzalez, Xaviar Watts, etc.
2. Confirm import → query `pending_agents` (24 rows), `clients` (258 with `assigned_to_email` filled where applicable, `agent_id` = upline).
3. Re-upload same file → duplicates_skipped ≈ 258.
4. Manually create an auth.users row matching one pending email → that profile activates with name/upline/location filled, and their previously-imported clients/policies move to `agent_id = new user`, `assigned_to_email = NULL`.
