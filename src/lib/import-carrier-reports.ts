/**
 * Reading the three reports a carrier actually sends.
 *
 * An agency's back office does not export a tidy "book of business". It
 * downloads whatever its carriers produce, and for a life carrier that is
 * almost always these three:
 *
 *   1. Certificates by agent   — every application and its contract status
 *   2. Commission statement    — what was paid, and the balances behind it
 *   3. Debt report             — what is owed back, per agent, per chargeback
 *
 * Each is a different question about the same policies, and none of them looks
 * like the CRM export `import-extract-rows.ts` was written for. A certificate
 * report has no premium and no phone number; a debt report is about agents, not
 * clients; a statement's meaning is in a summary block rather than a grid.
 *
 * So the vocabulary lives here, apart from the client one, and the rule is the
 * same as everywhere else in this feature: read less rather than guess. A
 * certificate row without a certificate number is not a policy, and a debt row
 * without a balance is not a debt — both are dropped and counted rather than
 * invented.
 *
 * Pure functions over already-shaped blocks, so they can be exercised with no
 * database and no network.
 */

import { readDocument, type SheetBlock } from "./sheet-shape";
import { normalizePolicyStatus } from "./import-normalize";

// ── Shared cell readers ──────────────────────────────────────────────────────

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[_\-.#]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Money as the carrier prints it: `$1,234.56`, `(1,226.05)`, `-5.24`. */
export function money(v: string | undefined): number | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = Number(s.replace(/[()$,\s-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

function int(v: string | undefined): number | null {
  const n = money(v);
  return n === null ? null : Math.round(n);
}

/**
 * A date, including the two shapes only a carrier export produces.
 *
 * Excel keeps dates as a day count from 1899-12-30, and `sheet_to_csv` hands
 * those through as bare five-digit numbers — `46203` is 18 June 2026. Read as
 * text they are meaningless; read as a year they are nonsense.
 *
 * `1/1/1800` is the other one: it is not a date, it is this system's way of
 * writing "never activated". Storing it as an effective date would put policies
 * two centuries into the past and break every production report that averages
 * over a period.
 */
export function reportDate(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;

  if (/^\d{5}$/.test(s)) {
    const serial = Number(s);
    // Sanity band: 1990-01-01 (32874) to 2100-01-01 (73051). Outside it, this
    // is a number that merely looks like a date serial — an amount, an age, an
    // ID — and coercing it would be worse than reading nothing.
    if (serial < 32874 || serial > 73051) return null;
    const ms = Date.UTC(1899, 11, 30) + serial * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }

  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const [, a, b, c] = m;
    const year = c.length === 2 ? (Number(c) > 30 ? `19${c}` : `20${c}`) : c;
    if (Number(year) < 1900) return null; // the "never happened" sentinel
    if (Number(a) > 12) return null;
    return `${year}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.startsWith("18") ? null : s;

  const d = new Date(s);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 1900) return null;
  return d.toISOString().slice(0, 10);
}

/** "SMITH, SHERYL" or "Sheryl Smith" → first/last. Carrier reports use both. */
export function splitName(whole: string): { first_name: string | null; last_name: string | null } {
  const s = whole.trim().replace(/\s+/g, " ");
  if (!s) return { first_name: null, last_name: null };
  if (s.includes(",")) {
    const [last, first] = s.split(",");
    return { first_name: first?.trim() || null, last_name: last?.trim() || null };
  }
  const parts = s.split(" ");
  const first = parts.shift() ?? null;
  return { first_name: first || null, last_name: parts.join(" ") || null };
}

/** Column index by any accepted spelling. */
function indexer(headers: string[]) {
  const norm = headers.map(normHeader);
  return (spellings: string[]): number =>
    norm.findIndex((h) => spellings.some((s) => h === s || h.startsWith(`${s} `) || h === `${s}s`));
}

// ── 1. Certificates by agent ─────────────────────────────────────────────────

const CERT_FIELDS = {
  insured: ["insured name", "insured", "member name", "client name", "name"],
  owner: ["owner name", "owner"],
  number: ["certificate number", "certificate", "certificate no", "policy number", "contract number"],
  product: ["product id", "product", "plan", "plan code"],
  status: ["current contract status", "status", "contract status", "status group"],
  reason: ["current contract status reason", "status reason", "termination reason", "reason"],
  applied: ["application entry date", "application date", "app date", "entry date", "signed date"],
  activated: ["certificate activation date", "activation date", "issue date", "effective date", "paid date"],
  age: ["issue age", "age"],
  face: ["face amount", "coverage", "death benefit", "benefit amount"],
  premium: ["modal premium", "monthly premium", "premium"],
  notes: ["notes", "note", "comment"],
};

export type CertificateRecord = Record<string, any> & { policies?: Record<string, any>[] };

/**
 * One certificate row → one client carrying one policy.
 *
 * Deliberately the same shape `clientsFromCsv` produces, because the whole
 * point of reading this report is that the policies in it are the *same*
 * policies already in the book. Landing them through the client path means the
 * existing matcher recognises them by certificate number, an import of last
 * month's report updates the status instead of creating a second copy, and a
 * policy the agency has never seen arrives with the person attached to it.
 *
 * The status reason wins over the status. "CONTRACT TERMINATED" is a category;
 * "CON TERM NT NO PAY" is what happened.
 */
export function certificatesFromBlock(
  b: SheetBlock,
  carrierName: string | null = null,
): CertificateRecord[] {
  if (!b.headers.length || !b.rows.length) return [];
  const at = indexer(b.headers);

  const col = {
    insured: at(CERT_FIELDS.insured),
    owner: at(CERT_FIELDS.owner),
    number: at(CERT_FIELDS.number),
    product: at(CERT_FIELDS.product),
    status: at(CERT_FIELDS.status),
    reason: at(CERT_FIELDS.reason),
    applied: at(CERT_FIELDS.applied),
    activated: at(CERT_FIELDS.activated),
    age: at(CERT_FIELDS.age),
    face: at(CERT_FIELDS.face),
    premium: at(CERT_FIELDS.premium),
    notes: at(CERT_FIELDS.notes),
  };

  // A certificate number and a name are the two things that make this a
  // certificate report rather than some other table with a "status" column.
  if (col.number < 0 || (col.insured < 0 && col.owner < 0)) return [];

  const out: CertificateRecord[] = [];
  for (const cells of b.rows) {
    const number = (cells[col.number] ?? "").trim().replace(/^0+(?=\d)/, "");
    const whole = (cells[col.insured >= 0 ? col.insured : col.owner] ?? "").trim();
    if (!number || !whole) continue;

    const { first_name, last_name } = splitName(whole);
    if (!first_name && !last_name) continue;

    const rawStatus = col.reason >= 0 ? (cells[col.reason] ?? "").trim() : "";
    const fallback = col.status >= 0 ? (cells[col.status] ?? "").trim() : "";
    const status = normalizePolicyStatus(rawStatus) ?? normalizePolicyStatus(fallback);

    const activated = col.activated >= 0 ? reportDate(cells[col.activated]) : null;
    const applied = col.applied >= 0 ? reportDate(cells[col.applied]) : null;

    const rec: CertificateRecord = {
      first_name,
      last_name,
      // A certificate report is proof of a sale, so the person belongs in the
      // book as sold rather than as a lead who happens to own a policy.
      stage_raw: "sold",
      policies: [
        {
          policy_number: number,
          carrier_name: carrierName,
          product: col.product >= 0 ? (cells[col.product] || null) : null,
          // The date it went on the books, falling back to the date it was
          // written. Production is dated from this, so a wrong one moves
          // somebody's month.
          effective_date: activated ?? applied,
          status: status ?? null,
          status_raw: rawStatus || fallback || null,
          face_amount: col.face >= 0 ? money(cells[col.face]) : null,
          monthly_premium: col.premium >= 0 ? money(cells[col.premium]) : null,
        },
      ],
    };

    const notes = col.notes >= 0 ? (cells[col.notes] ?? "").trim() : "";
    if (notes) rec.reminder_notes = notes;

    // Issue age plus the report's own date is not a date of birth, so it is
    // never written as one — it travels as a note the agent can act on.
    const age = col.age >= 0 ? int(cells[col.age]) : null;
    if (age && age > 0 && age < 120) rec.issue_age = age;

    out.push(rec);
  }
  return out;
}

/**
 * Every sheet of a certificate workbook, deduplicated by certificate number.
 *
 * These exports habitually carry the same policies four times — one tab per
 * status plus a sorted "all" tab — and importing the workbook as it comes would
 * propose the same certificate on every tab. First sighting wins, which is the
 * combined tab, and the per-status tabs then agree with it rather than
 * competing.
 */
export function certificatesFromDocument(
  text: string,
  carrierName: string | null = null,
): CertificateRecord[] {
  const seen = new Set<string>();
  const out: CertificateRecord[] = [];
  for (const block of readDocument(text)) {
    for (const rec of certificatesFromBlock(block, carrierName)) {
      const key = String(rec.policies?.[0]?.policy_number ?? "").toLowerCase();
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      out.push(rec);
    }
  }
  return out;
}

// ── 2. Agent debt ────────────────────────────────────────────────────────────

const DEBT_FIELDS = {
  agent: ["agent name", "agent", "producer name", "producer", "writing agent"],
  number: ["agent number", "agent no", "writing number", "producer number"],
  upline: ["immediate upline name", "upline name", "upline"],
  uplineNumber: ["immediate upline number", "upline number"],
  level: ["commission level", "comp level", "level"],
  email: ["email", "email address", "e mail"],
  phone: ["phone number", "phone", "mobile", "cell"],
  npn: ["npn", "agent npn"],
  company: ["company name", "company", "carrier name", "carrier"],
  balance: ["debit balance", "debt balance", "balance", "immediate balance", "amount owed", "amount"],
  unsecured: ["unsecured advance", "unsecured advance balance"],
  unpaid: ["unpaid commission", "unpaid commission balance"],
  age: ["age of debt", "debt age", "months"],
  pending: ["pending policies", "pending"],
  status: ["agent status", "status"],
  source: ["source", "product line", "business line"],
  asOf: ["refreshed date", "as of", "as of date", "report date", "statement date"],
};

export type DebtRecord = {
  agent_name: string;
  agent_number: string | null;
  agent_email: string | null;
  npn: string | null;
  upline_name: string | null;
  commission_level: string | null;
  carrier_name: string | null;
  balance: number;
  unsecured_advance: number | null;
  unpaid_commission: number | null;
  age_of_debt: number | null;
  pending_policies: number | null;
  agent_status: string | null;
  source_line: string | null;
  as_of_date: string | null;
};

/**
 * A downline debt report → one row per agent, per carrier.
 *
 * Balances are stored as the carrier states them: negative means owed back.
 * Flipping the sign to make it read nicely in a card is how a debt becomes a
 * credit two screens later, so the number is left exactly as printed and the
 * display decides how to word it.
 */
export function debtFromBlock(b: SheetBlock): DebtRecord[] {
  if (!b.headers.length || !b.rows.length) return [];
  const at = indexer(b.headers);

  const col = Object.fromEntries(
    Object.entries(DEBT_FIELDS).map(([k, spellings]) => [k, at(spellings)]),
  ) as Record<keyof typeof DEBT_FIELDS, number>;

  // Without an agent and a number there is no debt row here, whatever else the
  // sheet contains.
  if (col.agent < 0 || (col.balance < 0 && col.unsecured < 0)) return [];

  const out: DebtRecord[] = [];
  for (const cells of b.rows) {
    const name = (cells[col.agent] ?? "").trim();
    if (!name || /^total/i.test(name)) continue;

    const balance = col.balance >= 0 ? money(cells[col.balance]) : null;
    const unsecured = col.unsecured >= 0 ? money(cells[col.unsecured]) : null;
    const amount = balance ?? unsecured;
    // Zero is a real, useful answer — "this agent is square" — but a blank is
    // not, and treating it as zero would report debt that was never read.
    if (amount === null) continue;

    out.push({
      agent_name: name,
      agent_number: col.number >= 0 ? (cells[col.number] || null) : null,
      agent_email: col.email >= 0 ? (cells[col.email] || null) : null,
      npn: col.npn >= 0 ? (cells[col.npn] || null) : null,
      upline_name: col.upline >= 0 ? (cells[col.upline] || null) : null,
      commission_level: col.level >= 0 ? (cells[col.level] || null) : null,
      carrier_name: col.company >= 0 ? (cells[col.company] || null) : null,
      balance: amount,
      unsecured_advance: unsecured,
      unpaid_commission: col.unpaid >= 0 ? money(cells[col.unpaid]) : null,
      age_of_debt: col.age >= 0 ? int(cells[col.age]) : null,
      pending_policies: col.pending >= 0 ? int(cells[col.pending]) : null,
      agent_status: col.status >= 0 ? (cells[col.status] || null) : null,
      source_line: col.source >= 0 ? (cells[col.source] || null) : null,
      as_of_date: col.asOf >= 0 ? reportDate(cells[col.asOf]) : null,
    });
  }
  return out;
}

export function debtFromDocument(text: string): DebtRecord[] {
  return readDocument(text).flatMap(debtFromBlock);
}

// ── 3. Commission statement lines ────────────────────────────────────────────

const LINE_FIELDS = {
  insured: ["insured name", "insured", "client name", "member name", "name"],
  policy: ["certificate number", "certificate", "policy number", "policy", "contract number"],
  product: ["product id", "product", "plan"],
  paid: ["commission earned", "commission", "paid amount", "amount paid", "net amount", "amount"],
  date: ["paid date", "transaction date", "statement date", "process date", "date"],
  agent: ["agent name", "agent", "producer"],
  premium: ["premium", "annual premium", "modal premium"],
};

export type StatementLine = {
  insured_name: string | null;
  policy_number: string | null;
  product: string | null;
  paid_amount: number;
  paid_date: string | null;
  agent_name: string | null;
};

/**
 * Detail lines out of a statement that arrived as a table.
 *
 * The summary page — YTD earned, unsecured advance, aggregate balance — is a
 * layout, not a grid, so it comes from the reader in
 * `import-carrier-reports.functions.ts` instead. This handles the "CSV
 * friendly" detail export, which is a grid and needs no model.
 */
export function statementLinesFromBlock(b: SheetBlock): StatementLine[] {
  if (!b.headers.length || !b.rows.length) return [];
  const at = indexer(b.headers);
  const col = Object.fromEntries(
    Object.entries(LINE_FIELDS).map(([k, spellings]) => [k, at(spellings)]),
  ) as Record<keyof typeof LINE_FIELDS, number>;

  if (col.paid < 0 || (col.policy < 0 && col.insured < 0)) return [];

  const out: StatementLine[] = [];
  for (const cells of b.rows) {
    const paid = money(cells[col.paid]);
    if (paid === null) continue;
    const insured = col.insured >= 0 ? (cells[col.insured] || null) : null;
    const policy = col.policy >= 0 ? (cells[col.policy] || null) : null;
    if (!insured && !policy) continue;

    out.push({
      insured_name: insured,
      policy_number: policy,
      product: col.product >= 0 ? (cells[col.product] || null) : null,
      paid_amount: paid,
      paid_date: col.date >= 0 ? reportDate(cells[col.date]) : null,
      agent_name: col.agent >= 0 ? (cells[col.agent] || null) : null,
    });
  }
  return out;
}

export function statementLinesFromDocument(text: string): StatementLine[] {
  return readDocument(text).flatMap(statementLinesFromBlock);
}
