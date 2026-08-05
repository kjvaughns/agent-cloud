/**
 * Reading a CSV somebody exported from another system.
 *
 * Lifted out of `contracting-ops/import.tsx`, where it was the only copy in a
 * codebase with four import paths. A CSV parser is exactly the kind of thing
 * that gets reimplemented badly under time pressure — and the bad version is
 * always the same one.
 *
 * ── The part that actually bites ────────────────────────────────────────────
 *
 * `text.split(",")` looks fine until the first row containing
 * `"Mutual of Omaha, Inc."` — a quoted field with a comma in it. Company names
 * have commas in them constantly, so a naive split does not fail loudly; it
 * shifts every column after that point by one, for that row only, and the
 * import writes a phone number into a policy number. Quoted fields are the
 * whole reason this is thirty lines rather than one.
 *
 * Also handled: doubled quotes (`""` inside a quoted field), CRLF from
 * Windows, and a trailing newline that would otherwise produce a phantom empty
 * row at the end of every file.
 */

/** Parse CSV text into rows of raw string cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        // A doubled quote is an escaped quote, not the end of the field.
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  // Blank lines are noise, not data — a spreadsheet export routinely ends with
  // several, and each one would otherwise become a row of empty strings that
  // the importer then complains about.
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/**
 * Guess which column is which from the header row.
 *
 * Deliberately generous: every guess is shown to the person and editable, so a
 * wrong one costs a click while a missing one costs them reading the whole
 * header list themselves. This is the opposite trade-off from carrier
 * matching, where a wrong guess is silent and writes bad data — worth naming,
 * because the two look similar and want opposite defaults.
 */
export function guessColumnMapping(
  headers: string[],
  columns: { key: string; label: string }[],
): Record<string, string> {
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const out: Record<string, string> = {};
  const taken = new Set<number>();

  // Exact matches first, across all columns, before any fuzzy pass — otherwise
  // a loose match on an early column can consume the header that a later
  // column matches exactly.
  for (const col of columns) {
    const key = squash(col.key);
    const label = squash(col.label);
    const idx = headers.findIndex((h, i) => !taken.has(i) && (squash(h) === key || squash(h) === label));
    if (idx >= 0) { out[col.key] = String(idx); taken.add(idx); }
  }

  for (const col of columns) {
    if (out[col.key]) continue;
    const key = squash(col.key);
    const label = squash(col.label);
    const idx = headers.findIndex((h, i) => {
      if (taken.has(i)) return false;
      const n = squash(h);
      if (!n) return false;
      return n.includes(key) || key.includes(n) || n.includes(label) || label.includes(n);
    });
    if (idx >= 0) { out[col.key] = String(idx); taken.add(idx); }
  }

  return out;
}

/** Rows keyed by column name, built from a mapping of column → header index. */
export function applyMapping<T extends { key: string }>(
  dataRows: string[][],
  columns: T[],
  mapping: Record<string, string>,
): Record<string, string>[] {
  return dataRows.map((r) => {
    const obj: Record<string, string> = {};
    for (const col of columns) {
      const sourceIdx = mapping[col.key];
      if (sourceIdx === undefined || sourceIdx === "") continue;
      const v = r[Number(sourceIdx)];
      if (v !== undefined && String(v).trim() !== "") obj[col.key] = String(v).trim();
    }
    return obj;
  });
}
