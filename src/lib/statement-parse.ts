/**
 * Reading a carrier commission statement.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 *
 * `finances_.reconciliation.tsx` carried its own CSV parser, its own header
 * guesser and its own money parser, all written before `csv.ts`, `sheet-shape.ts`
 * and `import-normalize.ts` existed. Four defects came with them, and every one
 * was silent — the upload succeeded and the numbers were wrong:
 *
 *   1. `money2` stripped `(` and `)` along with the currency symbol, so the
 *      accounting negative `(1,234.56)` read as **positive** 1234.56. On a
 *      commission statement that is not a rounding error: a chargeback becomes
 *      a payment, and the variance is wrong by twice the amount. Chargebacks
 *      are the single line item reconciliation exists to catch.
 *   2. `mapHeaders` matched with `norm.includes(hint)` in one pass, so the
 *      `paid_amount` hint "amount" claimed a *Face Amount* column before
 *      *Commission Amount* was ever considered, and nothing stopped two fields
 *      claiming the same column.
 *   3. `paid_date` was mapped and then thrown away — every line was written
 *      with `paid_date: null`. Any fallback matching on date had nothing to
 *      match on.
 *   4. An unparseable amount became `0`, which reconciles as a policy the
 *      carrier paid nothing for rather than a line nobody could read.
 *
 * ── What a carrier statement actually looks like ────────────────────────────
 *
 * Not like the CSV in the docs. Statements are printed ledgers exported to a
 * grid, so they arrive with the agency's name across the top, a header split
 * over two rows, a subtotal after every agent block, and a grand total at the
 * bottom. `sheet-shape.ts` was written for exactly that shape and is used here
 * rather than reimplemented — a subtotal line read as a policy is a phantom
 * commission worth the sum of the block above it.
 *
 * They also use ledger conventions no consumer spreadsheet does: `CR`/`DR`
 * suffixes and a trailing minus. Those live in `parseStatementAmount` below
 * rather than in `parseAmount`, because the book-of-business importer never
 * sees them and widening the shared parser to accept them would let a stray
 * "DR" flip the sign of a premium.
 */

import { readBlock, type SheetBlock } from "./sheet-shape";
import { parseAmount, parseImportDate } from "./import-normalize";

export type StatementField =
  | "policy_number" | "insured_name" | "agent_name"
  | "product" | "paid_amount" | "paid_date";

/**
 * Header spellings, per field.
 *
 * Ordered most-specific first within each list, because the fuzzy pass takes
 * the first hit — "commission amount" has to be tried before "amount", or a
 * statement carrying both a face amount and a commission amount resolves to
 * the wrong one.
 */
const FIELD_SPELLINGS: Record<StatementField, string[]> = {
  policy_number: [
    "policy number", "policy no", "policy #", "policy num", "contract number",
    "certificate number", "cert number", "policy id", "policy",
  ],
  insured_name: [
    "insured name", "insured", "client name", "member name", "policyholder",
    "policy holder", "client", "member", "name",
  ],
  agent_name: [
    "writing agent", "agent name", "producer name", "producer", "writer", "agent",
  ],
  product: ["product name", "product", "plan name", "plan", "coverage type"],
  paid_amount: [
    "commission amount", "commission paid", "net commission", "commission",
    "amount paid", "paid amount", "net amount", "earnings", "compensation",
    "net pay", "payment", "amount", "net", "paid",
  ],
  paid_date: [
    "paid date", "payment date", "process date", "processed date",
    "transaction date", "statement date", "date paid", "date",
  ],
};

const ORDER: StatementField[] = [
  "policy_number", "paid_amount", "insured_name", "paid_date", "agent_name", "product",
];

function norm(h: string): string {
  return h.toLowerCase().replace(/[_\-.#/\\]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Which column is which.
 *
 * Same discipline as `guessColumnMapping` in `csv.ts` and for the same reason:
 * every exact match is taken across *all* fields before any loose match is
 * considered, and a column that has been claimed cannot be claimed again.
 * Without both halves, a header list of `["Policy Holder", "Policy Number"]`
 * loses the policy number — the loose "policy" hit consumes column 0 and the
 * real one is never reached.
 *
 * Fields are resolved in `ORDER` rather than declaration order so that the two
 * that decide whether the file is usable at all get first refusal on an
 * ambiguous column.
 */
export function mapStatementColumns(headers: string[]): Partial<Record<StatementField, number>> {
  const hs = headers.map(norm);
  const out: Partial<Record<StatementField, number>> = {};
  const taken = new Set<number>();

  for (const field of ORDER) {
    const idx = hs.findIndex((h, i) => !taken.has(i) && FIELD_SPELLINGS[field].includes(h));
    if (idx >= 0) { out[field] = idx; taken.add(idx); }
  }

  for (const field of ORDER) {
    if (out[field] !== undefined) continue;
    // Spelling order matters here: the first spelling that hits any column
    // wins, so "commission amount" gets to claim before "amount" does.
    for (const spelling of FIELD_SPELLINGS[field]) {
      const idx = hs.findIndex((h, i) => !taken.has(i) && h.includes(spelling));
      if (idx >= 0) { out[field] = idx; taken.add(idx); break; }
    }
  }

  return out;
}

/**
 * A money amount as a carrier ledger writes it.
 *
 * Three conventions on top of what `parseAmount` handles, all of which mean
 * "this is money going the other way":
 *
 *   `(1,234.56)`  accounting negative   — handled by parseAmount
 *   `1,234.56-`   trailing minus        — mainframe exports, still common
 *   `1,234.56 DR` debit                 — a chargeback
 *
 * `CR` is the positive case and is accepted explicitly rather than merely
 * ignored, so that a statement using CR/DR consistently is read consistently
 * instead of half-read.
 *
 * Returns null, never 0, for anything it cannot read. A line whose amount is
 * unreadable is a line to show somebody — reconciling it as zero says the
 * carrier paid nothing, which is a specific and wrong claim.
 */
export function parseStatementAmount(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

  let s = String(raw).trim();
  if (!s) return null;

  // Any negative marker makes it negative. Deliberately not a toggle: a
  // statement that writes "1,234.56- DR" is one amount marked negative twice by
  // a system that does both, not a double negation, and toggling would read
  // the clearest chargeback on the page as a payment.
  let negative = false;

  // DR/CR must be tested before the digits are extracted, because the suffix
  // is exactly what the extraction throws away. CR does not force positive —
  // it merely fails to make it negative, so an explicit "(1,234.56) CR" keeps
  // the sign its parentheses gave it.
  const ledger = s.match(/\b(cr|dr)\b\.?$/i);
  if (ledger) {
    if (ledger[1].toLowerCase() === "dr") negative = true;
    s = s.slice(0, ledger.index).trim();
  }

  if (/-\s*$/.test(s)) {
    negative = true;
    s = s.replace(/-\s*$/, "").trim();
  }

  const n = parseAmount(s);
  if (n === null) return null;
  return negative ? -Math.abs(n) : n;
}

export type StatementLineInput = {
  policy_number: string | null;
  insured_name: string | null;
  agent_name: string | null;
  product: string | null;
  paid_amount: number;
  paid_date: string | null;
};

export type StatementParse = {
  lines: StatementLineInput[];
  /** Header text as read, so the UI can show what it matched against. */
  headers: string[];
  columns: Partial<Record<StatementField, number>>;
  /** Rows dropped, by reason, so the total can be reconciled with the file. */
  skipped: { banner: number; subtotal: number; blank: number; unreadableAmount: number };
  /** Set when the file cannot be used at all, phrased for a person. */
  problem: string | null;
};

/**
 * Turn one sheet of a statement into lines.
 *
 * A line needs an amount. It does not need a policy number — the statements
 * that most need reconciling are the ones whose policy column is blank or
 * abbreviated, and dropping those rows here would hide exactly the lines the
 * feature exists to surface. They arrive as unmatched, which is the honest
 * outcome and the one the RPC already models.
 */
export function parseStatementBlock(block: SheetBlock): StatementParse {
  const base: StatementParse = {
    lines: [],
    headers: block.headers,
    columns: {},
    skipped: { ...block.skipped, unreadableAmount: 0 },
    problem: null,
  };

  if (!block.headers.length || !block.rows.length) {
    return { ...base, problem: "That file has no data rows we could read." };
  }

  const columns = mapStatementColumns(block.headers);
  base.columns = columns;

  if (columns.paid_amount === undefined) {
    return {
      ...base,
      problem:
        "Couldn't find a commission amount column. We looked for headers like " +
        "“Commission Amount”, “Net Commission” or “Earnings”.",
    };
  }

  const cell = (row: string[], field: StatementField): string | null => {
    const i = columns[field];
    if (i === undefined) return null;
    const v = (row[i] ?? "").trim();
    return v || null;
  };

  for (const row of block.rows) {
    const amount = parseStatementAmount(row[columns.paid_amount]);
    if (amount === null) {
      // Counted rather than dropped silently: a statement whose amount column
      // was mapped to the wrong header produces a page of these, and the count
      // is what makes that visible instead of an empty result.
      base.skipped.unreadableAmount++;
      continue;
    }

    const rawDate = cell(row, "paid_date");
    base.lines.push({
      policy_number: cell(row, "policy_number"),
      insured_name: cell(row, "insured_name"),
      agent_name: cell(row, "agent_name"),
      product: cell(row, "product"),
      paid_amount: amount,
      // Ambiguity is tolerated here in a way it is not for a policy effective
      // date: this is only ever used to narrow a match, never written to a
      // policy, so a US reading of an ambiguous date costs a near-miss rather
      // than a wrong record.
      paid_date: rawDate ? (parseImportDate(rawDate)?.iso ?? null) : null,
    });
  }

  if (!base.lines.length && !base.problem) {
    base.problem = base.skipped.unreadableAmount
      ? `We found ${base.skipped.unreadableAmount} rows but couldn't read an amount on any of them — the amount column may be the wrong one.`
      : "That file has no data rows.";
  }

  return base;
}

/** The same, from raw CSV text. */
export function parseStatementCsv(text: string): StatementParse {
  return parseStatementBlock(readBlock(text));
}
