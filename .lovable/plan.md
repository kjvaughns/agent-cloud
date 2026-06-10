## Goal

Two-part change to AgentLink + Client Drawer:
1. **UI** — Redesign the Contact tab into 6 clearly labeled sections and clean up imported-note formatting.
2. **Import plumbing** — Make every import path (basic API, full XLS, admin AI upload) write to the same set of tables via a shared helper, so health, banking, beneficiaries, policies (with resolved carrier) and notes all land in the right place.

---

## Part 1 — Client Drawer UI

**File:** `src/components/pipeline/client-detail-drawer.tsx`

1. Rewrite `ContactTab` to render 6 `SectionCard`s in this order:
   - Contact Information (names, phone, phone type, email, DOB, temperature selector inline at bottom)
   - Address (street, city, state, ZIP, born country/state)
   - Health Information → `HealthFields`
   - Banking Information → `BankingFields`
   - Policy Information → `PolicyFields`
   - Beneficiaries → new `BeneficiariesInline`
2. Add `Users` to the `lucide-react` import list.
3. **HealthFields** — prepend an SSN Last-4 input (4-digit masked, saves via `updateClient` patch on blur) alongside the existing Tobacco toggle; keep the rest of the existing fields.
4. **PolicyFields** — remove the `client.stage !== "sold"` lock so policy entry is always available; verify the auto-calculated annual premium display (monthly × 12) is present in `AddPolicyInlineForm`.
5. **BeneficiariesInline** — new inline component (no drawer/route nav) showing existing beneficiaries (name, relationship, DOB, %, delete) plus an inline add form with First/Last/Relationship select/Phone/DOB/Percentage; show total % with green when 100, amber otherwise. Uses existing `saveBeneficiary` / `deleteBeneficiary` server fns.

**File:** `src/components/pipeline/notes-tab.tsx`

6. Update note rendering so notes whose body starts with `[Imported from AgentLink]` show a small blue "AgentLink Import" badge and display the stripped body; `contact_type === "medical_note"` shows a red "Medical Note" badge; format `created_at` as `Mon D, YYYY, h:MM AM/PM`.

---

## Part 2 — Unified Import Pipeline

**File:** `src/lib/import-helpers.ts`

7. Add `saveClientFullRecord(supabase, agentId, c)` that:
   - Runs `detectDuplicate`; on hit, merges only missing fields on the existing client. On miss, inserts new client (incl. `born_country_state`, `ssn_last4`).
   - Upserts `client_health` (on `client_id`) when any health field is present.
   - Upserts `client_banking` (on `client_id`) when any banking field is present; account number stored masked (`****` + last 4 only).
   - For each policy: skip duplicates by `(agent_id, policy_number)`, resolve `carrier_id` by `ilike` match on first word of carrier name against active carriers, auto-fill `annual_premium = monthly × 12` when missing, insert into `policies`.
   - Upsert beneficiaries on `(client_id, first_name)`.
   - Insert each note into `contact_history` with `contact_type` of `medical_note` when `note_type` mentions medical/health, else `note`, preserving the `[Imported from AgentLink]` prefix (the NotesTab strips it for display).
   - Returns `{ clientId, isNew }`.

**File:** `src/lib/agentlink.functions.ts`

8. Refactor `importFromAgentLink` per-record loop to assemble a full client object from `allClients` + matching rows from `bookOfBusiness` and `clientNotes`, parse height (`5'10"`), parse SSN-last-4 from medical/reminder notes, then call `saveClientFullRecord`.
9. Refactor `basicImportFromAgentLink` insert loop to call `saveClientFullRecord` with all available API fields (health, banking, policies, notes) instead of writing only to `clients`.
10. After client loop: for each `teamRoster` entry without a matching `profiles.email`, insert a `notifications` row for the importing user prompting them to invite the agent (best-effort, no account auto-creation).

**File:** `src/lib/admin-import.functions.ts`

11. Update the AI extraction system prompt in `extractDataFromFile` to request the full superset of fields (born_country_state, ssn_last4, tobacco/height/weight/physician/conditions/medications/medical_notes, banking fields, policies[], beneficiaries[], notes[] with date+note_type).
12. Refactor `confirmAdminImport` client loop to delegate to `saveClientFullRecord(supabase, data.target_agent_id, …)`, normalizing string-vs-object notes.

---

## Notes / Risks

- `saveClientFullRecord` is called from server-fn handlers that already have an RLS-scoped `supabase` client, so it stays plain TypeScript (no `createServerFn` wrapper).
- `detectDuplicate` currently returns `{type,confidence,existing_client_id}` only — the merge step will re-`select` the existing row to know which fields are missing before patching (avoids overwriting populated data).
- Carrier resolution is best-effort: unknown names leave `carrier_id = null` rather than skipping the policy.
- Notes keep the `[Imported from AgentLink]` prefix in the DB so the NotesTab badge logic stays purely presentational and re-imports stay idempotent in spirit.
- No DB migrations required — all target tables/columns already exist.
- No changes to `src/integrations/supabase/*` autogen files.

## QA after build

- Open any client → Contact tab shows 6 sections in the specified order; policy section editable regardless of stage; beneficiaries inline with % total color.
- Notes tab: imported notes render with blue badge and stripped body.
- Run an AgentLink XLS import on a fixture with health + banking + policies + notes → verify rows appear in `client_health`, `client_banking`, `policies` (with non-null `carrier_id` for known carriers), `beneficiaries`, `contact_history`.
