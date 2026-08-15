/**
 * The spreadsheet an agency actually has.
 *
 * Every extractor in `import-extract-rows.ts` used to open with the same three
 * lines: split on newlines, take line 0 as the header, treat the rest as data.
 * That is true of the file we ship as a template and false of nearly every file
 * an agency sends. What actually arrives:
 *
 *   - A banner. Row 1 is the agency's name, row 2 is "Book of Business as of
 *     08/01/2026", row 3 is blank, and the header is row 4. Reading row 1 as the
 *     header finds no recognisable columns, so the file imports *nothing* and
 *     reports success.
 *   - A two-row header stack, usually because a merged cell spans a group:
 *         Premium ,        ,        , Face
 *         Monthly , Annual , Mode    , Amount
 *     Excel writes the merged cell once and leaves the rest of the span empty,
 *     so the top row must be forward-filled before the two are joined. Read
 *     either row alone and "Monthly" and "Annual" lose the word that says what
 *     they are.
 *   - Subtotal rows interleaved with data — a per-agent total after each block,
 *     a grand total at the bottom. These have a premium and no name, so they
 *     survive every "does this row have anything in it" check and land in the
 *     book as a client called nothing holding a policy worth the sum of twelve
 *     other policies.
 *   - The carrier in the *sheet name* rather than in a column. A workbook with
 *     one tab per carrier is the single most common shape in this industry, and
 *     a column-only reader drops the one field that makes the row useful.
 *
 * None of this needs a model. It needs the file to be read the way a person
 * reads it — find the row that looks like labels, notice that the row under it
 * finishes the labels, and skip the lines that are obviously arithmetic.
 *
 * The one rule throughout: when the shape is not clear, prefer reading less.
 * A row wrongly kept becomes a fake client; a row wrongly skipped is reported
 * in `skipped` and can be argued with.
 */

import { matchCarrier, isConfident, type CarrierRecord, type CarrierMatch } from "./carrier-match";

/** How far down a block we will look for the header before giving up. */
const MAX_BANNER_ROWS = 12;

/** A header stack deeper than this is not a header, it is data. */
const MAX_STACK = 3;

export type SheetBlock = {
  /** The `=== Sheet: … ===` label, when the extraction had one. */
  label: string | null;
  /** Header cells, merged spans filled and stacked rows joined. */
  headers: string[];
  /** Data rows. Banner, subtotal and blank rows are not here. */
  rows: string[][];
  /** Zero-based line index of the header row within the block. */
  headerIndex: number;
  /** What was dropped, so a review screen can say so rather than imply nothing was. */
  skipped: { banner: number; subtotal: number; blank: number };
};

// ── CSV ──────────────────────────────────────────────────────────────────────

/**
 * Split a CSV line, respecting quotes.
 *
 * Names contain commas — "Smith, Jr." is not two columns — and a naive split
 * shifts every field after it by one, which is the kind of corruption nobody
 * notices until the phone numbers are in the email column.
 */
export function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === delim && !quoted) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * Tab or comma.
 *
 * Decided over the whole block rather than the first line, because the first
 * line is often the banner — a single cell with no delimiter in it at all.
 */
function detectDelimiter(lines: string[]): string {
  let tabs = 0;
  let commas = 0;
  for (const l of lines.slice(0, 20)) {
    tabs += (l.match(/\t/g) ?? []).length;
    commas += (l.match(/,/g) ?? []).length;
  }
  return tabs > commas ? "\t" : ",";
}

// ── Cell shapes ──────────────────────────────────────────────────────────────

const NUMERIC = /^[$(-]?\s*[\d,]+(\.\d+)?\s*%?\)?$/;
const DATEISH = /^\d{1,4}[/\-.]\d{1,2}([/\-.]\d{1,4})?$/;

function looksNumeric(cell: string): boolean {
  const s = cell.trim();
  return s !== "" && (NUMERIC.test(s) || DATEISH.test(s));
}

/**
 * Does this cell read like a column label?
 *
 * Labels are short, contain a letter, and are not a value. The length cap is
 * what separates "Monthly Premium" from a sentence that happens to sit in a
 * notes column of the first data row — a header cell is a name, and names in
 * spreadsheets do not run to forty characters.
 */
function looksLikeLabel(cell: string): boolean {
  const s = cell.trim();
  if (!s || s.length > 40) return false;
  if (looksNumeric(s)) return false;
  return /[a-z]/i.test(s);
}

const nonEmpty = (cells: string[]) => cells.filter((c) => c.trim() !== "").length;

// ── Header detection ─────────────────────────────────────────────────────────

/**
 * Could this row be the header?
 *
 * Three things separate a header from everything above it. Nearly all of its
 * populated cells read as labels rather than values, there are at least two of
 * them, and it covers a real share of the sheet's width — a banner is one or
 * two cells in a nine-column sheet, which is what rules it out.
 *
 * Deliberately a yes/no rather than a score, and the *first* yes wins. Scoring
 * and taking the best picks the densest label row, and the densest label row in
 * a stacked header is the bottom one — which loses the group name above it —
 * while in a sheet whose last two columns are unnamed it is the first row of
 * data. Earliest-plausible is right in both, because nothing above a header is
 * ever a header.
 */
function isHeaderCandidate(cells: string[], width: number): boolean {
  const populated = cells.filter((c) => c.trim() !== "");
  if (populated.length < 2) return false;
  if (populated.filter(looksLikeLabel).length / populated.length < 0.6) return false;
  return populated.length * 2 >= width;
}

/**
 * Forward-fill a merged span.
 *
 * `Premium,,,Face` is what Excel writes for a cell merged across three columns:
 * the value once, then empties. Filling turns it into
 * `Premium,Premium,Premium,Face`, which is what the merge meant.
 *
 * Stops at the last populated cell. Trailing empties are unnamed columns, not
 * part of a span, and naming one after its neighbour is worse than leaving it
 * blank — the first gets mapped to a field it has nothing to do with, the
 * second gets ignored.
 */
function fillMerged(cells: string[]): string[] {
  const lastPopulated = cells.map((c) => c.trim() !== "").lastIndexOf(true);
  const out: string[] = [];
  let last = "";
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i].trim();
    if (v) last = v;
    out.push(i <= lastPopulated ? last : "");
  }
  return out;
}

/**
 * Column indexes that sit inside a gap in `cells` — empty, with something
 * populated on both sides.
 *
 * This is the signature of a merged cell, and the thing that separates it from
 * an unnamed trailing column. `Client,Premium,,Face` has a gap at index 2:
 * the merge covered it. `First Name,Last Name,,` has no gap — its empties run
 * off the end, and they mean two columns nobody named.
 *
 * The distinction is load-bearing. Without it, a sheet whose last columns are
 * unnamed reads its first row of data as a second header row and every column
 * gets a name with somebody's actual data glued onto it.
 */
function interiorGaps(cells: string[]): number[] {
  const populated = cells.map((c) => c.trim() !== "");
  const lastPopulated = populated.lastIndexOf(true);
  const firstPopulated = populated.indexOf(true);
  if (firstPopulated < 0) return [];
  const out: number[] = [];
  for (let i = firstPopulated + 1; i < lastPopulated; i++) if (!populated[i]) out.push(i);
  return out;
}

/**
 * Is `next` the second row of a header stack rather than the first row of data?
 *
 * Only when the row above has a merged span — an interior gap — and `next`
 * fills at least one cell of it. That is exactly what Excel writes for a group
 * header, and it is a shape ordinary data does not have.
 *
 * A looser test was tried and removed: "the row below has more populated cells
 * than the row above" is true of every sheet with unnamed trailing columns, and
 * it ate the first row of data on all of them.
 */
function isStackedHeader(above: string[], next: string[], width: number): boolean {
  if (!isHeaderCandidate(next, width)) return false;
  const gaps = interiorGaps(above);
  return gaps.some((i) => (next[i] ?? "").trim() !== "");
}

/** Join a stack top-down, skipping repeats so "Premium Premium" cannot happen. */
function joinStack(stack: string[][], width: number): string[] {
  const out: string[] = [];
  for (let col = 0; col < width; col++) {
    const parts: string[] = [];
    for (const row of stack) {
      const v = (row[col] ?? "").trim();
      if (v && !parts.includes(v)) parts.push(v);
    }
    out.push(parts.join(" "));
  }
  return out;
}

// ── Subtotals ────────────────────────────────────────────────────────────────

/**
 * A cell whose entire meaning is "this line is arithmetic".
 *
 * The word has to be the cell, not a word inside it. "Total", "Totals",
 * "Subtotal", "TOTAL:", "Agent Total" and "Total for J. Smith" are all labels;
 * "Total Life Insurance Company" is a carrier and "Total Premium" is a column,
 * and matching either of those on a bare `\btotal\b` would delete real rows.
 *
 * Digits and punctuation are stripped first because these labels arrive as
 * "Total:", "TOTAL — 12" and "Subtotal (3)".
 */
function isTotalLabel(cell: string): boolean {
  const bare = cell.replace(/[\d$,.:;—–\-()%]+/g, " ").replace(/\s+/g, " ").trim();
  return /^(.*\s)?(sub\s*total|grand\s*total|total|sum|count|average|avg)s?(\s+for\b.*)?$/i.test(bare);
}

/**
 * Is this a subtotal rather than a record?
 *
 * Two shapes, and both have to be caught because agencies produce both:
 *
 *   1. It says so — a cell whose whole meaning is "Total".
 *   2. It does not say so, but the row is nothing but numbers. That is a bare
 *      arithmetic line, and there is no reading of it where it is a person.
 *
 * Both require the row to be *sparse*, which is the real signature: a subtotal
 * fills the money columns and leaves the rest blank. Without that condition a
 * full row of client data that happens to contain the word in some field gets
 * silently deleted, which is a worse failure than keeping a subtotal — the
 * subtotal is visible in the review screen, the deleted client is not.
 */
export function isSubtotalRow(cells: string[]): boolean {
  const populated = cells.map((c) => c.trim()).filter(Boolean);
  if (!populated.length) return false;

  // Either most of the row is blank, or the row is barely populated at all.
  // The second clause carries the narrow sheets — "Grand Total, $4,980" in
  // three columns has only one empty cell but is obviously not a client.
  const sparse = cells.length - populated.length >= 2 || populated.length <= 2;
  if (!sparse) return false;

  if (populated.some(isTotalLabel)) return true;

  const numbers = populated.filter(looksNumeric).length;
  return numbers === populated.length;
}

// ── Reading a block ──────────────────────────────────────────────────────────

/**
 * Turn one CSV-ish block into headers and data rows.
 *
 * Everything above the header is counted as banner and dropped. Below it,
 * blank and subtotal rows are dropped and counted separately so the two reasons
 * stay distinguishable — "we skipped 14 rows" invites a support ticket,
 * "we skipped 14 subtotal rows" does not.
 */
export function readBlock(body: string, label: string | null = null): SheetBlock {
  const empty: SheetBlock = {
    label, headers: [], rows: [], headerIndex: -1,
    skipped: { banner: 0, subtotal: 0, blank: 0 },
  };

  const lines = body.split(/\r?\n/);
  if (!lines.some((l) => l.trim())) return empty;

  const delim = detectDelimiter(lines.filter((l) => l.trim()));
  const grid = lines.map((l) => splitCsvLine(l, delim));

  // The widest row is what "as wide as the data" is measured against. Taken
  // over the whole block because a header can be narrower than its data when a
  // trailing column is unnamed.
  const width = Math.max(1, ...grid.map((g) => g.length));

  let headerIndex = -1;
  for (let i = 0; i < Math.min(grid.length, MAX_BANNER_ROWS); i++) {
    if (isHeaderCandidate(grid[i], width)) { headerIndex = i; break; }
  }
  if (headerIndex < 0) return empty;

  // Gather the stack.
  const stack: string[][] = [grid[headerIndex]];
  let last = headerIndex;
  while (
    stack.length < MAX_STACK &&
    last + 1 < grid.length &&
    isStackedHeader(stack[stack.length - 1], grid[last + 1], width)
  ) {
    last++;
    stack.push(grid[last]);
  }

  // Fill merged spans on every row of the stack except the bottom one — the
  // bottom row's empties are genuinely unnamed columns, not a span.
  const filled = stack.map((row, i) => (i === stack.length - 1 ? row : fillMerged(row)));
  const headers = joinStack(filled, width);

  const skipped = { banner: headerIndex, subtotal: 0, blank: 0 };
  const rows: string[][] = [];
  for (let i = last + 1; i < grid.length; i++) {
    const cells = grid[i];
    if (nonEmpty(cells) === 0) { skipped.blank++; continue; }
    if (isSubtotalRow(cells)) { skipped.subtotal++; continue; }
    rows.push(cells);
  }

  return { label, headers, rows, headerIndex, skipped };
}

// ── Blocks ───────────────────────────────────────────────────────────────────

const BLOCK_LABEL = /^=== (?:Sheet|Page): (.*?) ===$/;

/**
 * Split an extraction into labelled blocks.
 *
 * `document-extract.ts` writes `=== Sheet: name ===` before each tab. The old
 * readers split on that marker and threw the label away, which is exactly the
 * field a per-carrier workbook keeps its carrier in.
 */
export function splitBlocks(text: string): { label: string | null; body: string }[] {
  const out: { label: string | null; body: string }[] = [];
  let label: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    const body = buf.join("\n");
    if (body.trim()) out.push({ label, body });
    buf = [];
  };

  for (const line of text.split(/\r?\n/)) {
    const m = line.match(BLOCK_LABEL);
    if (m) { flush(); label = m[1].trim(); continue; }
    buf.push(line);
  }
  flush();
  return out;
}

/** Every block of a document, read. */
export function readDocument(text: string): SheetBlock[] {
  return splitBlocks(text).map(({ label, body }) => readBlock(body, label));
}

// ── The carrier in the sheet name ────────────────────────────────────────────

/**
 * Sheet names that are structure, not carriers.
 *
 * Checked before matching rather than relying on the match failing, because
 * "Summary" against a carrier list is exactly the kind of short generic string
 * that edit distance can drag over the line onto something unrelated.
 */
const NOT_A_CARRIER = new Set([
  "summary", "sheet1", "sheet2", "sheet3", "data", "notes", "instructions",
  "readme", "cover", "index", "totals", "all clients", "clients", "policies",
  "book of business", "team roster", "client notes", "roster", "template",
  "raw", "export", "report", "master", "pivot", "chart",
]);

/**
 * Strip the noise a tab name carries around the carrier.
 *
 * "MOO Book 2025", "Foresters - Policies", "Americo (in force)" all name a
 * carrier and then say something about the tab. The something is removed here
 * so `matchCarrier` sees the carrier alone.
 */
function cleanLabel(label: string): string {
  return label
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b(book|policies|policy|clients?|business|bob|in\s*force|inforce|data|list|export|report|tab|sheet|copy|final|new|old|q[1-4])\b/gi, " ")
    .replace(/[_\-–—|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The carrier a tab is named after, if it is named after one.
 *
 * Returns only a confident match. A tab name is a weak signal — it is a label
 * somebody typed for themselves, not a field — and stamping every row of a
 * sheet with a guessed carrier writes one mistake across a thousand policies.
 * Below the threshold the answer is nothing, and the column (or the human) has
 * to supply it.
 */
export function carrierFromLabel(
  label: string | null | undefined,
  carriers: CarrierRecord[],
): (CarrierMatch & { cleaned: string }) | null {
  if (!label) return null;
  const bare = label.trim().toLowerCase();
  if (!bare || NOT_A_CARRIER.has(bare)) return null;

  const cleaned = cleanLabel(label);
  if (!cleaned || NOT_A_CARRIER.has(cleaned.toLowerCase())) return null;

  const m = matchCarrier(cleaned, carriers);
  return isConfident(m) ? { ...m, cleaned } : null;
}
