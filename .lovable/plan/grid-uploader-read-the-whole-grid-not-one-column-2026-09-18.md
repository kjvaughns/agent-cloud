# Grid uploader: read the whole grid, not one column

## What your PDF actually contains

Your file is a clean digital table: 11 products down the side and 15 level columns across the top (105, 100, 95 … 40, LOA) — 165 rates in total. I extracted it outside the app and every cell came out perfectly, so the document is fine. The uploader is what's losing it.

## Why only one column comes back

Three things, all confirmed in the code:

1. **The reader throws away the table and sends a photo instead.** The grid uploader forces every PDF to be rasterized into a picture (`prefer: "image"`), even when the PDF has a real text layer like yours. So a table that could be read exactly is instead read off an image.
2. **The answer is cut off before it finishes.** Each rate becomes its own JSON record, so your grid needs about 165 of them. The reply is capped at 8,000 tokens and the model spends part of that budget thinking, so it runs out partway through — and because the shape asks for level-by-level records, what survives is the first level column. That is exactly the "only one column" you're seeing.
3. **Nothing notices the truncation.** When the reply is cut short the code either fails to parse it or keeps whatever prefix parsed, and reports success. There is no check that every level column in the document came back.

## The fix

- **Read digital PDFs as a table.** Pull the text layer with its positions so column headers and cells stay aligned, send that alongside the page image, and only fall back to image-only for scans and photos. Exact numbers, a fraction of the work.
- **Compact the answer shape.** One record per product carrying a rates map keyed by level (`{"Senior Choice (FE)": {"105": 105, "100": 100, …}}`) instead of one record per cell. That is roughly a tenth of the output for the same grid, so a 15-column card fits comfortably. It is expanded back into the existing per-level rows before anything is saved, so storage, the editor and the calculator are unchanged.
- **Split wide grids across calls.** When a document has more level columns than fit in one answer, read them in groups and merge, the same way multi-page batching already works.
- **Refuse to call a half-read grid a success.** Detect a cut-off reply, compare the level columns found in the document's headers against the ones returned, and if any are missing either re-read those columns or say plainly which ones are missing — never show a partial grid as complete.
- **Raise the answer budget** and lower the reading temperature to zero, since this is transcription, not writing.

## Checks

After the change I'll run your AMAM grid through the real uploader and confirm 11 products × 15 levels land in the editor with the right rates, LOA reading as 0, and re-run the existing grid checks (`grid-review-check`, `comp-grid-model-check`, `carrier-wizard-check`).

## Technical notes

- `src/lib/document-extract.ts`: add a layout-aware text mode for PDFs (group `getTextContent` items by y, order by x) and let the grid path request text + image rather than image only.
- `src/lib/comp-grid.functions.ts`: new compact response schema in `EXTRACT_SYSTEM` plus an expander to `GridRow[]`; level-column chunking; `maxTokens` raised and `temperature: 0`.
- `src/lib/ai-gateway.ts`: surface `finish_reason` so a truncated completion is an error instead of a silent partial.
- `src/components/contracting/manage-grids.tsx`: pass the text layer through, and report missing level columns in the review panel.
