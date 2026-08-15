# Import that understands a whole migration workbook

## What the file is

I read the workbook you attached. Four sheets, and each one is a different record type:

| Sheet | Rows | Columns as they actually appear |
| --- | --- | --- |
| Team Roster | 41 | Agent Name, Email, Location, Status, Depth, Contracts, Date Joined, Last Active |
| All Clients | 532 | First/Last Name, Phone, Email, Date of Birth, Street/City/State/ZIP, Born In, Stage, Smoker, Monthly Income, Employment, Pitch Carrier, Face Amount, Policy #, Medical Notes, Reminder Notes, Callback Date, Agent |
| Book of Business | 352 | Client Name, Carrier, Product, Policy #, Status, Monthly Premium, Annual Premium, Effective Date, Agent |
| Client Notes | 182 | Client Name, Note Content, Note Type, Author, Date |

## Where today's import falls short

Confirmed by reading the code, not assumed:

- **A workbook gets one verdict, not one per sheet.** `allHeaderRows` pools the headers from every tab and `resolveKind` picks a single kind for the file. With those four tabs pooled, the strongest vocabulary wins and the other three sheets are read with the wrong reader — or the tabs disagree and the whole file is sent to the model and then to you as "not recognised".
- **Notes have no kind at all.** `IMPORT_KINDS` has no client-notes member, so a Client Notes tab can only ever be misfiled.
- **Sheets can't reference each other.** `clientsFromBlock` reads one row into one client with at most one policy inline. Book of Business is a separate sheet joined by `Client Name`, and nothing in the extractor can join across tabs, so those 352 policies would be dropped or turned into 352 more client records.
- **The Agent column is ignored.** `applyProposals` saves every client through `saveClientFullRecord(supabase, userId, …)` — the importer owns everything, so 40 producers' books would all land on your account.
- **Nothing is backdated.** The policy insert in `import-helpers.ts` writes `effective_date` and `posted_at: now()` and never sets `production_date`, so imported history counts as production in the month you imported it. No commission schedule is built for an imported policy either.
- **Most of these columns have no home.** `CLIENT_FIELDS` covers name, phone, email, DOB and address. Born In, Stage, Smoker, Monthly Income, Employment, Pitch Carrier, Face Amount, Medical Notes, Reminder Notes and Callback Date are all read past.

## What I'll build

### 1. One workbook, one verdict per sheet

Each tab is classified on its own headers and its own tab name, and each becomes its own reviewable item under the file. You'll see the file with four lines under it — "Team Roster → 41 agents", "All Clients → 532 clients", "Book of Business → 352 policies", "Client Notes → 182 notes" — each with its own row count, its own problems, and its own approve. A tab we can't place says so without spoiling the other three.

### 2. Two new record types the app can read

- **Client notes**, joined to a client by name, landing as timeline entries with the original author and the original date.
- **Team roster**, from a name/email/location/status/join-date sheet, landing as pending agents under you. Nothing is emailed — they sit ready for you to invite.

### 3. Sheets that join to each other

Rows are read in tab order and held together before anything is written, so a policy on Book of Business attaches to its client from All Clients on the exact `Client Name` string, and a note attaches the same way. A policy or note whose client isn't in the workbook and isn't already in your book is reported by name rather than quietly inventing a blank client.

### 4. The Agent column decides the owner

Each distinct name in the Agent and Author columns is resolved once — against real accounts on your team first, then against the roster rows in the same workbook — and the client, policy or note is written as that producer's. You'll see the resolution as a list before you approve: "Marquay Vaughns → account", "Daniel Gonzalez → new pending agent", "Someone Else → not matched, will be yours". Unmatched rows fall back to you rather than being lost.

### 5. Backdating that reaches production, leaderboards and finances

An imported policy's production month becomes its Effective Date, not the import date, and its commission schedule is rebuilt anchored on that historical date — the same path a hand-backdated deal already uses. So a policy written in March shows in March's production, March's leaderboard, and pays its advance and trails on the March calendar.

### 6. Every column lands somewhere

Stage maps to the pipeline column; Smoker to tobacco use; Medical Notes to the health record; Born In, Monthly Income, Employment, Face Amount, Pitch Carrier, Reminder Notes and Callback Date each to their existing field. Anything genuinely unmatched is listed by column name in the review so you know what was left on the floor.

### 7. Review before anything is written

The existing "nothing saves until you say so" promise is kept and extended: a per-sheet count, the owner resolution list, the cross-sheet orphans, the columns we ignored, and duplicate handling against your existing book — then one approve. Undo still rolls the batch back.

## Technical notes

- Per-sheet routing: `resolveKind` gains a per-`SheetBlock` entry point (headers plus tab label); `import.tsx` walks `readDocument(doc.text)` and creates one `document_intake` child row per sheet instead of one per file. `allHeaderRows` stays for single-sheet CSVs.
- `IMPORT_KINDS`/`KIND_LABEL`/`KIND_TARGET`/`VOCAB` gain `client_notes` (→ `contact_history`, own scope) and reuse `agent_roster` (→ `pending_agents`) with a roster vocabulary that matches Agent Name/Depth/Date Joined/Last Active.
- Cross-sheet assembly is a new pure module (`src/lib/import-workbook.ts`) turning `SheetBlock[]` into `{ clients, policiesByClientName, notesByClientName, roster, ownersByName, unmatched }`, unit-tested by a new `scripts/workbook-import-check.ts` fixture built from this file's shapes.
- Owner resolution: name → `profiles` within the org (exact, then fuzzy on last name + first initial), then roster rows, then importer. Resolved owner id rides on the proposal payload; `applyProposals` passes it as the effective `agent_id` to `saveClientFullRecord` instead of always `userId`, with a server-side check that the resolved id is in the caller's downline or org.
- Backdating: `saveClientFullRecord`'s policy insert sets `production_date` from `effective_date` via the existing `toSaleTimestamp` helper in `src/lib/sale-date.ts`, and calls `calculateAndInsertAllCommissions` per inserted policy (batched, failures recorded as setup issues rather than aborting the row).
- New client columns extend `CLIENT_FIELDS`/`FullClientRecord` only where a column already exists (`stage`, `tobacco_use`, `medical_notes`, `born_country_state`, `face_amount` on the policy, callback/reminder onto the existing reminder fields). No schema change is expected; if a column turns out to be missing I'll flag it before adding one.
- Nothing in this plan imports your file. You upload it when you're ready.
