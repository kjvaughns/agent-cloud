# Uploads that always get read

## What's actually happening

I checked your intake rows. The workbook you dropped is sitting there as `queued`, and its stored file location is empty — because today the file never leaves your browser tab. The tab is the only thing that can read it: the tab opens the file, splits the tabs, and posts rows to the server. If that tab reloads, sleeps, loses its network, or the read throws once, the row stays `queued` forever and nothing on the server can pick it up, because the bytes were never anywhere but in the page.

So "Waiting to be read" was literal, and for that file nothing was ever going to read it.

## The fix, in three parts

### 1. The file gets stored the moment you drop it

Every dropped file is uploaded to private storage before any reading starts, and its row records where it landed. Only you (and your agency admins) can read it back. From that point on the file exists independently of your browser, which is what makes everything below possible. Nothing about approval changes: rows are still proposals until you approve them.

### 2. Anything left unread gets picked up automatically

- **When you open Import**, any of your files still marked queued or half-read are resumed on the spot — pulled back from storage and read, no re-upload, with a visible "Picking up 3 files we hadn't finished" line rather than silent activity.
- **A background sweep** catches files whose uploader never came back: spreadsheets and CSVs are read entirely on the server, and scanned PDFs are read on the server through the assistant with the stored pages. So a file gets read whether or not any tab is open.
- **PDFs that need page rendering** still read fastest in the browser; if the server can't do one, it stays queued for resume instead of being dropped, and it says so in those words.

### 3. Honest states and a retry that works

- A file being read now says so with a heartbeat, so "in progress" means a worker is genuinely on it.
- A file whose read fails or stalls becomes **Couldn't read — try again**, with a **Read again** button that re-reads the stored file. No hunting for the original on your desktop.
- Retries are automatic up to two attempts (with a pause between) before it asks you.
- Your one stranded row from earlier has no stored bytes, so it can't be resumed retroactively: it will be labelled as needing a re-upload, and the button will say that. Every upload after this change is resumable.

## Technical notes

- New private storage bucket `imports`; `handleFiles` uploads each file (path `{org}/{doc_id}/{filename}`) and `createImportBatch` records `file_url`. Upload failure is surfaced per-file, and the file still processes in-tab so nothing regresses.
- `document_intake.status` gains `processing`, plus `attempts int` and `heartbeat_at timestamptz`. Client and server both claim a row before working it (conditional update on status) so a resume and a sweep can't read the same file twice; row keys in `import-match.ts` already make double-writes idempotent.
- New `src/lib/import-resume.functions.ts`:
  - `claimStaleImports` — my rows in `queued`/`processing` with heartbeat older than 2 minutes, returning signed download URLs.
  - `processImportDocServer` — server-side read for CSV/XLSX using the existing SheetJS path from `document-extract.ts` (pure JS, worker-safe) plus `planWorkbook` → `setImportKind` → `reconcileImportRows`, reusing the exact code the client uses so classification and joins are identical. Scanned PDFs route to the existing `import-carrier-ai.ts` extraction with stored bytes; pdfjs-only paths are left for the browser.
  - `retryImportDoc` — resets status/attempts for one row.
- Sweep endpoint `src/routes/api/public/hooks/process-imports.ts` (shared-secret header, service-role client) walks rows older than 2 minutes with `attempts < 3`, calling `processImportDocServer`; safe to hit on a schedule.
- `import.tsx`: on mount, call `claimStaleImports` and feed results through the existing `processOne` path via fetched Blobs, reusing the live progress bars already there; `STATUS_STYLE` gains `processing` and a distinct failed-with-retry treatment.
