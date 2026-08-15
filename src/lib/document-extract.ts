/**
 * Turn any uploaded file into something a model can actually read.
 *
 * There were three strategies for this before, and they disagreed:
 *
 *   `file-to-image.ts` rasterized page 1 of a PDF and sent a JPEG.
 *   `admin-import.functions.ts` sent the raw PDF bytes as an `image_url`.
 *   `resources.functions.ts` did the same for NIPR reports.
 *
 * The raw-bytes trick works only because Gemini tolerates it; it is undefined
 * against an OpenAI-shaped gateway and it spends the entire file on tokens. The
 * rasterizer was honest about its limit — "only the first page is rendered, a
 * commission grid is almost always one page" — and that was true when the only
 * caller was the grid uploader. It stopped being true the moment one front door
 * had to accept a book of business, a multi-page rate card, or a statement.
 *
 * The important change here is not multi-page. It is trying the **text layer
 * first**. Most carrier PDFs are digital, not scanned, and pdfjs is already
 * parsing the file to render it — asking for the text instead is exact, free,
 * and perhaps a hundredth of the tokens of a picture of the same page. We
 * rasterize only what has no text, which is what "scanned" actually means.
 *
 * Runs in the browser: the pdfjs worker is bundled (the CSP forbids CDN
 * scripts) and the file never leaves the page except as what we choose to send.
 */

import type { ChatPart } from "./ai-gateway";

/** Enough to read grid digits, small enough to send. */
const MAX_EDGE = 2000;

/**
 * The most one page image may weigh, as a data-URI string.
 *
 * Not a server limit copied down: it is the budget that keeps a normal upload —
 * several photographed pages in one request — inside what a request can carry.
 * `MAX_REQUEST_IMAGE_CHARS` below is the whole-request version of the same
 * budget, and callers that batch pages use it.
 */
export const MAX_IMAGE_CHARS = 1_400_000;

/**
 * The most one extraction request may carry in page images, all pages summed.
 * Callers sending several pages split into batches on this rather than posting
 * everything and getting the browser's unexplained "Load failed".
 */
export const MAX_REQUEST_IMAGE_CHARS = 4_000_000;

/** Past this, we are sending a book rather than reading a document. */
const DEFAULT_MAX_PAGES = 8;

/**
 * A page with less than this much text is a picture of a page, not a page.
 * Scanned PDFs commonly still carry a few stray characters — a header stamp, a
 * fax banner — so "zero" is the wrong threshold.
 */
const SCANNED_PAGE_CHAR_THRESHOLD = 50;

/** Matches the cap the existing extractors use, so behaviour does not shift. */
const MAX_TEXT_CHARS = 200_000;

export type ExtractedDoc = {
  /** Text, when we could get any. Empty string when the document is a scan. */
  text: string;
  /** Data URIs for pages we had to rasterize. Empty when text was enough. */
  images: string[];
  /** Pages in the document, as far as we can tell. 1 for images and sheets. */
  pageCount: number;
  /** Pages we actually read. Less than `pageCount` means we stopped early. */
  pagesRead: number;
  /** True when the document is longer than we read. Say so; never imply we read it all. */
  truncated: boolean;
  /** How we got it, for telling the user why an extraction looks the way it does. */
  source: "text" | "images" | "mixed" | "sheets";
  /** Sheet names, for spreadsheets. */
  sheetNames?: string[];
};

export type ExtractOptions = {
  maxPages?: number;
  /**
   * Force rasterization even when a text layer exists. The comp grid extractor
   * wants this: a rate table's meaning is in its layout, and the text layer
   * gives you the numbers in reading order with the columns lost.
   */
  prefer?: "text" | "image";
};

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function isImage(file: File): boolean {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
}

function isSpreadsheet(file: File): boolean {
  return /spreadsheet|excel/i.test(file.type) || /\.xlsx?$/i.test(file.name);
}

function isPlainText(file: File): boolean {
  return (
    /csv|text|json/.test(file.type) || /\.(csv|txt|tsv|json|md)$/i.test(file.name)
  );
}

/** The one entry point. Everything else in this module serves it. */
export async function extractDocument(
  file: File,
  opts: ExtractOptions = {},
): Promise<ExtractedDoc> {
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;

  if (isImage(file)) {
    return {
      text: "",
      images: [await downscaleImage(file)],
      pageCount: 1,
      pagesRead: 1,
      truncated: false,
      source: "images",
    };
  }

  if (isSpreadsheet(file)) return extractSpreadsheet(file);

  if (isPdf(file)) return extractPdf(file, maxPages, opts.prefer ?? "text");

  if (isPlainText(file)) {
    const raw = await file.text();
    return {
      text: raw.slice(0, MAX_TEXT_CHARS),
      images: [],
      pageCount: 1,
      pagesRead: 1,
      truncated: raw.length > MAX_TEXT_CHARS,
      source: "text",
    };
  }

  // Unknown extension. Read it as text rather than refusing — a .dat that is
  // really a CSV is common, and an unreadable one produces mojibake the model
  // will simply report as unreadable.
  const raw = await file.text();
  if (!raw.trim()) throw new Error(`Couldn't read anything out of ${file.name}`);
  return {
    text: raw.slice(0, MAX_TEXT_CHARS),
    images: [],
    pageCount: 1,
    pagesRead: 1,
    truncated: raw.length > MAX_TEXT_CHARS,
    source: "text",
  };
}

/**
 * Every sheet as CSV, labelled. Lifted from `admin-import.functions.ts`, which
 * had the best of the three implementations — the others could not read a
 * spreadsheet at all, which is awkward for a feature whose commonest input is
 * a book of business exported to xlsx.
 */
async function extractSpreadsheet(file: File): Promise<ExtractedDoc> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    parts.push(`=== Sheet: ${name} ===\n${csv}`);
  }
  const combined = parts.join("\n\n");

  return {
    text: combined.slice(0, MAX_TEXT_CHARS),
    images: [],
    pageCount: wb.SheetNames.length,
    pagesRead: wb.SheetNames.length,
    truncated: combined.length > MAX_TEXT_CHARS,
    source: "sheets",
    sheetNames: wb.SheetNames,
  };
}

/**
 * Text where there is text, a picture where there is not.
 *
 * A document can be both — a scanned rate card stapled to a typed cover letter
 * is an ordinary thing to receive — so pages are decided one at a time rather
 * than the whole file being called digital or scanned.
 *
 * `maxPages` caps **rasterization only**. Text costs a rounding error to read
 * and a fraction of that to send, so a 40-page licence report gives up all 40
 * pages of text; it is the JPEGs that have to be rationed. Capping both would
 * have quietly halved what a long digital document yields.
 */
async function extractPdf(
  file: File,
  maxPages: number,
  prefer: "text" | "image",
): Promise<ExtractedDoc> {
  const pdfjs: any = await import("pdfjs-dist");

  // Bundled rather than fetched from a CDN — the app's CSP does not allow
  // external script origins.
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pageCount = doc.numPages as number;

  const texts: string[] = [];
  const images: string[] = [];
  let pagesRead = 0;
  let rasterSkipped = 0;

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);

    let pageText = "";
    if (prefer === "text") {
      const content = await page.getTextContent();
      pageText = (content.items ?? [])
        .map((it: any) => (typeof it.str === "string" ? it.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (prefer === "text" && pageText.length >= SCANNED_PAGE_CHAR_THRESHOLD) {
      texts.push(`=== Page ${i} ===\n${pageText}`);
      pagesRead++;
    } else if (images.length < maxPages) {
      images.push(await renderPage(page));
      pagesRead++;
    } else {
      rasterSkipped++;
    }
  }

  const joined = texts.join("\n\n");
  const text = joined.slice(0, MAX_TEXT_CHARS);
  const source: ExtractedDoc["source"] =
    texts.length && images.length ? "mixed" : images.length ? "images" : "text";

  if (!text && !images.length) {
    throw new Error(`Couldn't read anything out of ${file.name}`);
  }

  return {
    text,
    images,
    pageCount,
    pagesRead,
    truncated: rasterSkipped > 0 || joined.length > MAX_TEXT_CHARS,
    source,
  };
}

async function renderPage(page: any): Promise<string> {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(MAX_EDGE / Math.max(base.width, base.height), 3);
  const viewport = page.getViewport({ scale: Math.max(1, scale) });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't render that PDF");

  // White background: a transparent canvas renders black text on black once
  // flattened to JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Bring a photograph down to something that can actually be sent.
 *
 * A phone camera writes an 8-megapixel JPEG; base64 inflates it by a third, so
 * one page arrived as roughly 6 MB of string and three pages exceeded what the
 * request could carry. The browser reported that as a bare "Load failed" — the
 * fetch never completed, so there was no server error to show — and an owner
 * photographing a paper comp grid, which is the normal case, could not upload
 * at all.
 *
 * Re-encoded to the same ceiling the PDF rasterizer already uses, because that
 * ceiling was chosen for exactly this content: 2000px on the long edge is
 * enough to read rate digits, and anything beyond it is detail the model cannot
 * use. An image already inside the ceiling and already a JPEG is passed
 * through untouched rather than re-compressed.
 *
 * Falls back to the original bytes if anything here fails: a slightly-too-large
 * upload that might work is better than a hard failure on a browser whose
 * canvas or decoder behaved unexpectedly.
 */
async function downscaleImage(file: File): Promise<string> {
  const original = await readAsDataUrl(file);
  const isJpeg = /^data:image\/jpe?g/i.test(original);
  if (isJpeg && original.length <= MAX_IMAGE_CHARS) return original;

  try {
    const img = await loadImage(original);
    const longest = Math.max(img.width, img.height);
    const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    // White behind it, for the same reason the PDF renderer does: a
    // transparent PNG flattened to JPEG turns dark text into a black block.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Step the quality down rather than settle for one guess: a dense grid
    // photographed at close range can still be large at 0.85, and the rates
    // stay legible well below it.
    for (const quality of [0.85, 0.7, 0.55]) {
      const out = canvas.toDataURL("image/jpeg", quality);
      if (out.length <= MAX_IMAGE_CHARS) return out;
    }
    return canvas.toDataURL("image/jpeg", 0.45);
  } catch {
    return original;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image"));
    img.src = src;
  });
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read that file"));
    r.readAsDataURL(file);
  });
}

/** Shape an extraction into the message content the gateway expects. */
export function toChatParts(doc: ExtractedDoc, instruction: string): ChatPart[] {
  const parts: ChatPart[] = [{ type: "text", text: instruction }];
  if (doc.text) parts.push({ type: "text", text: doc.text });
  for (const url of doc.images) parts.push({ type: "image_url", image_url: { url } });
  return parts;
}

/**
 * What to tell the user when we did not read the whole thing. Returns null when
 * there is nothing to say — silence should mean "we read it all", so the caller
 * can show this unconditionally.
 */
export function truncationNotice(doc: ExtractedDoc): string | null {
  if (!doc.truncated) return null;
  if (doc.source === "sheets") {
    return "That spreadsheet is larger than we can read in one pass — later rows were not included.";
  }
  return `That document has ${doc.pageCount} pages and we read ${doc.pagesRead}. Scanned pages beyond the first few are skipped; a text PDF is read in full.`;
}
