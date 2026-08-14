# Nothing is locked behind the producer profile

Three changes: open the locked pages, turn the "you're not active yet" notice into a suggestion, and make document uploads fill in their own details.

## 1. Clients, Pipeline, Book, Finances, Reports, Calendar, Retention, Nova open for everyone

Today the sidebar hides those nine entries for anyone whose profile status is still `pending` (invited, never activated, no first sale). That's the lock the user is hitting — it isn't literally profile completeness, but it's the same experience: a new agent opens a workspace with half the app missing until someone activates them.

Change: drop the `activated` unlock from every page in `src/lib/navigation.ts`. All pages become visible to every agent from day one. Nothing else about roles, staff permissions, or agency gates changes.

Pages will simply be empty for a brand-new agent (no clients, no policies, no commissions) — the existing empty states already say what to do.

## 2. The pending notice becomes a suggestion, not an explanation of a lock

`src/components/pending-agent-notice.tsx` currently reads "Selling opens once you're active" and explains why things are missing. Since nothing is missing anymore, it becomes a short, dismissible "finish setting up" nudge: producer profile, contracting, academy — same three links, framed as useful next steps, with a completeness percentage. It stays visible only while the profile is incomplete and can be dismissed for the session.

The producer profile page itself keeps its completeness ring, but the wording moves from obligation ("required before you can…") to value ("carriers ask for this — keeping it here means you never re-type it").

## 3. Uploading a document fills in its own fields

Right now the E&O and AML cards ask the agent to type carrier, policy number, coverage, dates, provider and certificate number *before* uploading — the file already contains all of it.

New behaviour, for every document card on the producer profile: after the file uploads, the file is read in the browser (the project already has `src/lib/document-extract.ts` doing text-first PDF extraction) and sent to the AI gateway with a per-doc-type schema. Whatever it reads is written back through the existing `upsertProducerDocument` and pre-fills the fields on the card.

- E&O certificate: carrier, policy number, coverage amount, effective and expiry dates
- AML certificate: provider, certificate number, completion date
- PDB report / government ID / W-9 / voided check: name, NPN, dates where present
- Anything the model isn't confident about is left blank, never guessed. Fields stay editable, and a small "read from your upload — check these" line appears so the agent knows where the values came from.
- Extraction failing is not an upload failure: the document is saved either way.

## Technical notes

- `src/lib/navigation.ts`: remove `unlock: "activated"` from the nine pages; keep the `activated` gate type and `isPending` in `NavContext` (other code reads it) or remove cleanly if unused.
- New `src/lib/document-intake.functions.ts` server fn: takes extracted text/images plus `doc_type`, calls the Lovable AI gateway with a Zod-shaped response per type, returns a partial metadata object. No new tables — writes go through `upsertProducerDocument`, whose columns already cover every field.
- `DocUploadButton` in `src/routes/_authenticated/account/producer-profile.tsx` gains an `onExtracted` callback; `EoCard` / `AmlCard` and the remaining cards use it to set their local state.
- No database migration; no change to `agent_completion()` — the score stays, it just stops gating anything.
