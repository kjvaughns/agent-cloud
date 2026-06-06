# Move Imported Notes into the Notes Tab

Right now the AgentLink importer writes notes in two places, and **neither shows up in the Notes tab**:

1. Fields like Medical Notes / Reminder Notes / Smoker / Monthly income / Employment / Pitch carrier / Face amount / Policy # / Callback are concatenated and dumped into `clients.notes` (a single inline blob on the client row).
2. The `Client Notes` sheet rows are inserted into `contact_history` with `contact_type = "imported_note"`.

The Notes tab in the client drawer only renders entries where `contact_type` is `"note"` or `"medical_note"`, so imported entries are invisible there.

## Changes

### 1. Notes tab includes imported notes
In `src/components/pipeline/client-detail-drawer.tsx` (two filter sites, lines ~115 and ~260), include `"imported_note"` alongside `"note"` / `"medical_note"` when building the `entries` array passed to `<NotesTab>`.

### 2. Render imported notes with an "Imported" tag
In `src/components/pipeline/notes-tab.tsx`, update `categoriesOf` / `SavedNote` so a `contact_type === "imported_note"` entry shows a neutral **Imported** chip. Medical-looking imports (the ones that came from the `Medical:` prefix) keep the medical styling.

### 3. Importer stops dumping into `clients.notes`
In `src/lib/admin-import.functions.ts` (around lines 559–587), instead of joining the field bits into `clients.notes`:
- Leave `clients.notes` `null` on insert.
- After the client insert, insert one `contact_history` row per non-empty field with `contact_type = "imported_note"` and a body like `Medical: <value>` / `Reminder: <value>` / `Smoker: <value>` / etc. Medical and Reminder become their own rows so they get the right chip; the others get bundled into one "Imported details" entry to avoid noise.
- Bump the `notes_imported` counter accordingly so the import summary toast stays accurate.

### 4. One-time backfill migration
A migration that, for every existing `clients` row with a non-empty `notes` column whose content matches the importer's prefix pattern (`Medical:` / `Reminder:` / `Smoker:` / `Monthly income:` / `Employment:` / `Pitch carrier:` / `Face amount:` / `Policy #:` / `Callback:`):
- Splits the blob on newlines.
- Inserts each line into `contact_history` as `contact_type = 'imported_note'` for the same `agent_id` / `assigned_to_email`.
- Clears `clients.notes` (sets to NULL) after the rows are inserted.

Hand-typed notes that don't match the prefix pattern are left in `clients.notes` untouched.

## Out of scope
- The free-form `clients.notes` text field stays in the DB for now (used by other surfaces); we just stop the importer from writing to it.
- No change to the `Client Notes` sheet path — it already lands in `contact_history` and will simply start appearing in the Notes tab once step 1 ships.
