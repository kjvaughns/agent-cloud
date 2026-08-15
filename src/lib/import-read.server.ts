/**
 * Reading a stored file without a browser.
 *
 * Until now the only thing that could read an uploaded file was the tab that
 * uploaded it: the bytes lived in the page, so a reload, a sleeping laptop or a
 * single thrown error left the row saying "queued" with nothing anywhere able to
 * finish it. Files are stored now, which makes this possible — the same
 * planning and the same reconciliation, run on the server, against bytes pulled
 * back out of storage.
 *
 * What this cannot do is render a page. Scanned PDFs and photographs need
 * pdfjs and a canvas, which only exist in a browser, so those are reported as
 * `deferred` and left for the page to pick up rather than being failed.
 */

import { readDocument } from "./sheet-shape";
import { planWorkbook, describePlan } from "./import-workbook";
import { reconcileRowsCore } from "./import-reconcile.server";
import { buildCarrierIndex } from "./carrier-index";
import type { CarrierRecord } from "./carrier-match";

/** Matches the cap the browser extractor uses, so behaviour does not shift. */
const MAX_TEXT_CHARS = 200_000;

/** Rows per reconcile pass. Same as the client's chunk. */
const CHUNK = 500;

export type ServerReadOutcome =
  | { status: "read"; sheets: number; rows: number; summary: string }
  | { status: "deferred"; reason: string }
  | { status: "failed"; reason: string };

function isSpreadsheetName(name: string, mime: string | null): boolean {
  return /spreadsheet|excel/i.test(mime ?? "") || /\.xlsx?$/i.test(name);
}

function isTextName(name: string, mime: string | null): boolean {
  return /csv|text|json/i.test(mime ?? "") || /\.(csv|txt|tsv|json|md)$/i.test(name);
}

/** Every sheet as labelled CSV — the same shape the browser produces. */
async function textFromSpreadsheet(bytes: ArrayBuffer): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(bytes, { type: "array", cellDates: true });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    parts.push(`=== Sheet: ${name} ===\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`);
  }
  return parts.join("\n\n").slice(0, MAX_TEXT_CHARS);
}

async function textFromFile(
  bytes: ArrayBuffer,
  fileName: string,
  mime: string | null,
): Promise<string | null> {
  if (isSpreadsheetName(fileName, mime)) return textFromSpreadsheet(bytes);
  if (isTextName(fileName, mime)) {
    return new TextDecoder().decode(bytes).slice(0, MAX_TEXT_CHARS);
  }
  return null;
}

async function reconcileAll(
  supabase: any,
  userId: string,
  documentId: string,
  kind: any,
  rows: Record<string, any>[],
): Promise<number> {
  let proposed = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const out = await reconcileRowsCore(supabase, userId, documentId, kind, rows.slice(i, i + CHUNK));
    proposed += out.proposed;
  }
  return proposed;
}

/**
 * Read one stored intake row all the way to proposals.
 *
 * `supabase` may be the uploader's own client or a service-role one; `userId`
 * is always the person the import belongs to, so ownership and matching come
 * out identical either way.
 */
export async function readStoredImport(
  supabase: any,
  userId: string,
  doc: {
    id: string;
    file_name: string;
    mime_type: string | null;
    file_url: string | null;
    user_note: string | null;
    batch_id: string;
  },
): Promise<ServerReadOutcome> {
  if (!doc.file_url) {
    return { status: "deferred", reason: "We don't have a copy of this file — upload it again to finish it." };
  }

  const dl = await supabase.storage.from("imports").download(doc.file_url);
  if (dl.error || !dl.data) {
    return { status: "failed", reason: dl.error?.message ?? "The stored copy of this file couldn't be opened." };
  }
  const bytes = await (dl.data as Blob).arrayBuffer();

  const text = await textFromFile(bytes, doc.file_name, doc.mime_type);
  if (text === null) {
    return {
      status: "deferred",
      reason: "This one needs its pages rendered, which happens on the Import page — open it to finish.",
    };
  }
  if (!text.trim()) return { status: "failed", reason: "There was nothing readable in the file." };

  let carriers: CarrierRecord[] = [];
  try {
    carriers = await buildCarrierIndex(supabase);
  } catch {
    // A tab name is a convenience, never the only path to a carrier.
  }

  const plan = planWorkbook(text, carriers, doc.user_note);
  const usable = plan.streams.filter((s) => s.kind !== "unknown" && s.rows.length);
  if (!usable.length) {
    return {
      status: "deferred",
      reason: "We couldn't tell what this is from its columns — open Import and describe it.",
    };
  }

  const nowIso = new Date().toISOString();
  let rowsTotal = 0;

  if (usable.length > 1) {
    // A workbook is a heading with its tabs underneath, exactly as the page
    // builds it, so the review screen looks the same however it was read.
    await supabase.from("document_intake").update({
      status: "split",
      doc_type: null,
      summary: describePlan(plan),
      error: null,
      heartbeat_at: nowIso,
      updated_at: nowIso,
    }).eq("id", doc.id);

    for (const st of usable) {
      const { data: child, error } = await supabase.from("document_intake").insert({
        batch_id: doc.batch_id,
        parent_id: doc.id,
        sheet_label: st.sheetLabel,
        file_name: `${doc.file_name} — ${st.sheetLabel}`,
        mime_type: doc.mime_type,
        file_url: doc.file_url,
        status: "needs_review",
        doc_type: st.kind,
        confidence: 0.95,
        summary: `${st.sheetLabel} — ${st.rows.length} row${st.rows.length === 1 ? "" : "s"}`,
        uploaded_by: userId,
        user_note: doc.user_note,
        heartbeat_at: nowIso,
      }).select("id").maybeSingle();
      if (error || !child) continue;
      rowsTotal += await reconcileAll(supabase, userId, child.id, st.kind, st.rows);
    }
    return { status: "read", sheets: usable.length, rows: rowsTotal, summary: describePlan(plan) };
  }

  const st = usable[0];
  await supabase.from("document_intake").update({
    status: "needs_review",
    doc_type: st.kind,
    confidence: 0.9,
    summary: describePlan(plan),
    error: null,
    heartbeat_at: nowIso,
    updated_at: nowIso,
  }).eq("id", doc.id);
  rowsTotal = await reconcileAll(supabase, userId, doc.id, st.kind, st.rows);

  // Say what was left on the floor rather than letting the arithmetic be quiet.
  const dropped = readDocument(text).reduce((n, b) => n + b.skipped.subtotal, 0);
  const summary = dropped ? `${describePlan(plan)} Skipped ${dropped} subtotal rows.` : describePlan(plan);
  return { status: "read", sheets: 1, rows: rowsTotal, summary };
}
