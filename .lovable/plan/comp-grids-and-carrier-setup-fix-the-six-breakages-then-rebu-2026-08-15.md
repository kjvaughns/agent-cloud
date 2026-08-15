# Comp grids and carrier setup: fix the six breakages, then rebuild the flow

## What I confirmed by reading the code

- **Edit grid opens an empty grid.** The Carriers row passes the right carrier id into the grid editor, but the editor only loads a carrier's existing rows inside `selectCarrier` — the path taken when you pick from the dropdown. Arriving with the carrier already chosen sets the id and leaves the table empty. Worse, the save mode is `replace`, so saving that empty screen would wipe rows that were never shown.
- **Deleting a carrier leaves its grid.** Removal deletes the `org_carriers` row only. Grid rows are keyed on `carrier_id` + organization, so they survive, as do the carrier's comp levels and position mappings.
- **Photo uploads fail with "Load failed".** That message is the browser's, not ours — the request never completed. Image files are sent as-is: a phone photo becomes roughly 5–8 MB of base64 each, and several pages in one request blow past what the request can carry. Nothing in the path resizes an image or reports a size problem.
- **No drag and drop on the grid uploader**, though four other uploaders in the app already have it.
- **No way to set your own level.** Level assignment happens in the downline matrix, and that matrix explicitly removes your own id from its agent list. An owner has no row, so their own carrier levels stay empty — which is why their commissions resolve to nothing.
- **The setup checklist can't be collapsed or dismissed.** It always renders at the top of Agency Settings.
- Multi-select is already on the file input; I'll verify it on a phone-sized viewport and fix whatever actually blocks it (the file picker is triggered from a wrapping label, which is the usual cause).

## The fixes

1. **Uploads that work from a phone.** Resize and re-encode every image to a readable-but-sendable size before it leaves the browser (same ceiling the PDF rasterizer already uses), send pages in batches that stay inside the request budget, and replace generic failures with a sentence that names the cause — file too large, too many pages, unreadable format.
2. **Drag and drop**, with the drop zone highlighting on hover, accepting several files at once, and rejecting unsupported types by name rather than silently.
3. **Edit grid loads that carrier's grid.** The load path becomes the same one the dropdown uses, so opening from a carrier row shows exactly the rows that carrier has, and there is no way to save an empty screen over a populated grid.
4. **Removing a carrier removes what belonged to it.** When removal is a true delete (nothing references the carrier), its grid rows, comp levels, position mappings and submission methods go with it, in one transaction, and the confirmation says so before you click. When history exists it still archives, and archiving keeps everything.
5. **Your own level, configurable.** Your row appears in the level matrix, and you can set your own carrier levels up to the ceiling your upline gave you — no higher. An agency owner with nobody above them sets their own freely. The Carriers tab and the setup checklist both gain a "your levels" line, because a grid with no level assigned to you is the other reason commissions read zero.
6. **A collapsible, dismissable checklist.** Collapsed to a single progress line with a chevron, dismissable once complete, and the choice is remembered per person. Beside it, a "How to add a carrier" button opening short plain-language instructions for the whole process.

## Rebuilding carrier creation

You asked for the creation process itself to change, so the guided flow becomes the only way a carrier is added, and it gets rebuilt around what actually blocks people:

- **One screen at a time with a visible spine** — Carrier, Details, Grid, Levels, Advance, Submission, Review — showing what is done, what is current, and what is left. Every step saves before moving on, so leaving and coming back resumes on the first unfinished step.
- **Grid step first-class:** drop the files, watch them read, review the flagged cells, fix them in place. It refuses to move on while something blocking is unresolved and says which cell and why.
- **The Levels step maps the carrier's own level names onto your agency positions** and offers your position percentage as an explicit fallback, so a carrier can be finished without inventing levels it doesn't have.
- **Review step is a verdict, not a summary:** either "this carrier can price a deal today", or the exact list of what is missing, each line opening the step that fixes it.
- **After activation the flow stays available as "Finish setup"** on any carrier that can't yet pay a deal, and the single-form editor remains for changing one field on a live carrier.

## Technical notes

- Image downsizing lands in `src/lib/document-extract.ts` so every uploader in the app benefits, not just grids; batching and error messages in `manage-grids.tsx` and `comp-grid.functions.ts`.
- Cascading removal is a SQL function called from `removeOrgCarrier`, so the grid, levels, mappings and methods cannot be half-deleted; `getCarrierUsage` already returns the counts the confirmation needs.
- Self-assignment relaxes the matrix's agent list and keeps the existing server-side ceiling check, which already refuses a level above your own.
- Checklist collapse state is stored per user; no schema change.
- Extends the existing checks: `carrier-wizard-check`, `carrier-status-check`, `grid-review-check`, plus new cases for cascade removal, self-assignment, and loading a carrier's grid by id.
