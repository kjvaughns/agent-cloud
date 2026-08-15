/**
 * Turning a spreadsheet into records, without asking a model.
 *
 * `extractDocument` gives back CSV-shaped text for anything with a grid in it.
 * Mapping that to client and policy fields is a column-naming problem, not a
 * language problem — every export in this industry spells the same twelve
 * columns a slightly different way, and a lookup table handles it exactly and
 * for nothing.
 *
 * The model is the fallback, not the default. A five-thousand-row book costs
 * one deterministic pass here; sending it to be read instead would cost real
 * money, take minutes, and be less accurate at the one thing that matters —
 * getting the phone number right.
 *
 * Finding the header row, joining a stacked one, dropping subtotals and reading
 * the carrier out of a tab name all live in `sheet-shape.ts`. This file is the
 * vocabulary — which spellings mean which field — and nothing else.
 */

import { readBlock, readDocument, type SheetBlock } from "./sheet-shape";
import { carrierFromLabel } from "./sheet-shape";
import type { CarrierRecord } from "./carrier-match";

/** Header spellings we accept, per field. Compared after normalisation. */
const CLIENT_FIELDS: Record<string, string[]> = {
  first_name: ["first name", "firstname", "first", "given name"],
  last_name: ["last name", "lastname", "last", "surname", "family name"],
  phone: ["phone", "phone number", "mobile", "cell", "cell phone", "primary phone", "telephone"],
  email: ["email", "email address", "e mail"],
  date_of_birth: ["date of birth", "dob", "birth date", "birthdate", "born"],
  street_address: ["address", "street", "street address", "address 1", "address line 1"],
  city: ["city", "town"],
  state: ["state", "st", "province"],
  zip_code: ["zip", "zip code", "postal code", "postcode"],
};

const POLICY_FIELDS: Record<string, string[]> = {
  policy_number: ["policy number", "policy #", "policy no", "policy", "contract number"],
  carrier_name: ["carrier", "carrier name", "company", "insurance company"],
  monthly_premium: ["monthly premium", "monthly", "modal premium", "premium monthly"],
  annual_premium: ["annual premium", "annual", "ap", "alp", "yearly premium"],
  face_amount: ["face amount", "face", "coverage", "death benefit", "benefit amount"],
  effective_date: ["effective date", "effective", "issue date", "start date", "policy date"],
  status: ["status", "policy status"],
};

/** A full name in one column, which plenty of exports do. */
const FULL_NAME = ["name", "client name", "insured", "insured name", "client", "full name"];

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[_\-.#]+/g, " ").replace(/\s+/g, " ").trim();
}

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/**
 * Best-effort date normalisation to ISO.
 *
 * Returns null rather than a guess when the format is ambiguous in a way that
 * matters. `03/04/1960` is either March or April depending on which side of the
 * Atlantic wrote it, but as a date of birth it is only ever used for matching —
 * so a consistent reading is worth more than a correct one, and US order is
 * what these exports use.
 */
function isoDate(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const [, a, b, c] = m;
    const year = c.length === 2 ? (Number(c) > 30 ? `19${c}` : `20${c}`) : c;
    const mm = a.padStart(2, "0");
    const dd = b.padStart(2, "0");
    if (Number(mm) > 12) return null;
    return `${year}-${mm}-${dd}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export type ExtractedClient = Record<string, any> & { policies?: Record<string, any>[] };

/**
 * Map one CSV-ish block into client records.
 *
 * Every row carries at most one policy, because that is how these exports are
 * shaped — one line per policy, the client's details repeated. Rows for the
 * same person are collapsed downstream by `rowKey`, which is where the
 * within-file deduplication belongs.
 */
export function clientsFromCsv(block: string): ExtractedClient[] {
  return clientsFromBlock(readBlock(block));
}

/**
 * The same, from an already-shaped block.
 *
 * Split out because `clientsFromDocument` needs the sheet label — a workbook
 * with one tab per carrier keeps its carrier there and nowhere else — and the
 * label is lost the moment a block is handed around as a string.
 */
export function clientsFromBlock(
  b: SheetBlock,
  carriers: CarrierRecord[] = [],
): ExtractedClient[] {
  if (!b.headers.length || !b.rows.length) return [];

  const headers = b.headers.map(normHeader);

  const colOf = (spellings: string[]): number =>
    headers.findIndex((h) => spellings.includes(h));

  const client: Record<string, number> = {};
  for (const [field, spellings] of Object.entries(CLIENT_FIELDS)) {
    const i = colOf(spellings);
    if (i >= 0) client[field] = i;
  }
  const policy: Record<string, number> = {};
  for (const [field, spellings] of Object.entries(POLICY_FIELDS)) {
    const i = colOf(spellings);
    if (i >= 0) policy[field] = i;
  }
  const fullNameCol = colOf(FULL_NAME);

  // Without a name or a phone there is nothing to match on and nothing worth
  // creating. Better to extract nothing and say so than to fill the book with
  // blank records.
  if (client.first_name === undefined && client.phone === undefined && fullNameCol < 0) {
    return [];
  }

  // The carrier can be in the tab name instead of a column, which is the
  // commonest shape in this industry — one tab per carrier, no carrier column
  // anywhere. Only consulted when there is no column, so a column always wins.
  const labelCarrier = policy.carrier_name === undefined
    ? carrierFromLabel(b.label, carriers)
    : null;

  const out: ExtractedClient[] = [];
  for (const cells of b.rows) {
    const rec: ExtractedClient = {};

    if (client.first_name !== undefined) rec.first_name = cells[client.first_name] || null;
    if (client.last_name !== undefined) rec.last_name = cells[client.last_name] || null;

    if (fullNameCol >= 0 && !rec.first_name && !rec.last_name) {
      const whole = (cells[fullNameCol] ?? "").trim();
      if (whole.includes(",")) {
        // "Smith, John" — surname first, which is how carrier reports print it.
        const [lastPart, firstPart] = whole.split(",");
        rec.last_name = lastPart?.trim() || null;
        rec.first_name = firstPart?.trim() || null;
      } else {
        const parts = whole.split(/\s+/);
        rec.first_name = parts.shift() || null;
        rec.last_name = parts.join(" ") || null;
      }
    }

    for (const f of ["phone", "email", "street_address", "city", "state", "zip_code"]) {
      if (client[f] !== undefined) rec[f] = cells[client[f]] || null;
    }
    if (client.date_of_birth !== undefined) rec.date_of_birth = isoDate(cells[client.date_of_birth]);

    if (!rec.first_name && !rec.last_name && !rec.phone && !rec.email) continue;

    const pol: Record<string, any> = {};
    if (policy.policy_number !== undefined) pol.policy_number = cells[policy.policy_number] || null;
    if (policy.carrier_name !== undefined) pol.carrier_name = cells[policy.carrier_name] || null;
    if (policy.monthly_premium !== undefined) pol.monthly_premium = num(cells[policy.monthly_premium]);
    if (policy.annual_premium !== undefined) pol.annual_premium = num(cells[policy.annual_premium]);
    if (policy.face_amount !== undefined) pol.face_amount = num(cells[policy.face_amount]);
    if (policy.effective_date !== undefined) pol.effective_date = isoDate(cells[policy.effective_date]);
    if (policy.status !== undefined) pol.status = cells[policy.status] || null;

    if (Object.values(pol).some((v) => v !== null && v !== undefined)) {
      // Stamped after the emptiness test, so a tab name cannot conjure a policy
      // out of a row that has nothing else policy-shaped in it.
      if (labelCarrier) {
        pol.carrier_name = labelCarrier.cleaned;
        pol.carrier_id = labelCarrier.carrierId;
        pol.carrier_source = "sheet_name";
      }
      rec.policies = [pol];
    }

    out.push(rec);
  }

  return out;
}

/**
 * Every sheet and every page, not just the first.
 *
 * `extractDocument` labels each block; a workbook's book of business is often
 * on the second tab, behind a summary.
 */
export function clientsFromDocument(
  text: string,
  carriers: CarrierRecord[] = [],
): ExtractedClient[] {
  return readDocument(text).flatMap((b) => clientsFromBlock(b, carriers));
}

// ── Contracting records ──────────────────────────────────────────────────────

/**
 * Column spellings for the three contracting imports.
 *
 * The keys are the ones `runContractingImport` reads —
 * `contracting-import.functions.ts` already defines that vocabulary in
 * `IMPORT_COLUMNS`, and its resolution rules (NPN or email to an agent,
 * carrier name to an org_carrier) are the reason this maps to those names
 * rather than inventing a second set.
 */
const CONTRACTING_FIELDS: Record<string, Record<string, string[]>> = {
  writing_numbers: {
    agent_npn: ["agent npn", "npn", "producer npn"],
    agent_email: ["agent email", "email", "agent e mail"],
    carrier_name: ["carrier name", "carrier", "company"],
    writing_number: ["writing number", "writing no", "writing", "agent number", "producer number"],
    number_type: ["number type", "type"],
    state_code: ["state", "state code", "st"],
    product_line: ["product line", "product"],
    effective_date: ["effective date", "effective", "appointed date"],
    status: ["status"],
    upline_writing_number: ["upline writing number", "upline number", "upline"],
  },
  licenses: {
    agent_npn: ["agent npn", "npn", "producer npn"],
    agent_email: ["agent email", "email", "agent e mail"],
    state_code: ["state", "state code", "st"],
    license_number: ["license number", "licence number", "license no", "license"],
    loa: ["loa", "lines of authority", "line of authority"],
    is_resident: ["resident", "is resident", "residency"],
    issued_date: ["issued date", "issued", "effective date"],
    expires_date: ["expires date", "expiration date", "expires", "expiry"],
    status: ["status"],
  },
  carriers: {
    carrier_name: ["carrier name", "carrier", "company"],
    contracting_email: ["contracting email"],
    contracting_portal_url: ["portal url", "contracting portal url", "portal"],
    surelc_url: ["surelc url", "surelc"],
    support_email: ["support email"],
    turnaround_days: ["turnaround days", "turnaround"],
  },
};

/**
 * Map a CSV block onto the column names the contracting importer reads.
 *
 * Everything stays a string. `runContractingImport` does its own parsing,
 * normalising and validation, and doing any of it twice is how two callers end
 * up disagreeing about what a valid row is.
 */
export function contractingRowsFromCsv(
  block: string,
  kind: "writing_numbers" | "licenses" | "carriers",
): Record<string, string>[] {
  return contractingRowsFromBlock(readBlock(block), kind);
}

export function contractingRowsFromBlock(
  b: SheetBlock,
  kind: "writing_numbers" | "licenses" | "carriers",
): Record<string, string>[] {
  if (!b.headers.length || !b.rows.length) return [];

  const headers = b.headers.map(normHeader);
  const spec = CONTRACTING_FIELDS[kind];

  const cols: Record<string, number> = {};
  for (const [field, spellings] of Object.entries(spec)) {
    const i = headers.findIndex((h) => spellings.includes(h));
    if (i >= 0) cols[field] = i;
  }

  // Without the column that identifies the record there is nothing to import,
  // and a row of blanks is worse than no row.
  const required = kind === "carriers" ? "carrier_name"
    : kind === "licenses" ? "state_code"
    : "writing_number";
  if (cols[required] === undefined) return [];

  const out: Record<string, string>[] = [];
  for (const cells of b.rows) {
    const rec: Record<string, string> = {};
    for (const [field, idx] of Object.entries(cols)) rec[field] = cells[idx] ?? "";
    if (!rec[required]?.trim()) continue;
    out.push(rec);
  }
  return out;
}

export function contractingRowsFromDocument(
  text: string,
  kind: "writing_numbers" | "licenses" | "carriers",
): Record<string, string>[] {
  return readDocument(text).flatMap((b) => contractingRowsFromBlock(b, kind));
}

// ── Agent roster ─────────────────────────────────────────────────────────────

const ROSTER_FIELDS: Record<string, string[]> = {
  email: ["email", "email address", "agent email", "e mail"],
  first_name: ["first name", "firstname", "first"],
  last_name: ["last name", "lastname", "last", "surname"],
  location: ["location", "city", "state", "market"],
  status_label: ["status", "agent status"],
  depth: ["depth", "level", "tier", "generation"],
  contracts_label: ["contracts", "carriers", "appointments"],
  joined_date: ["date joined", "joined", "join date", "hire date", "start date"],
  last_active_label: ["last active", "last login", "last seen"],
};

const ROSTER_FULL_NAME = ["agent name", "name", "full name", "agent"];

/**
 * Roster rows, keyed on email.
 *
 * Email is required rather than merely useful: `pending_agents` is keyed on it,
 * an invitation is sent to it, and a roster row without one cannot become an
 * account. Dropping those rows here is better than proposing records that can
 * never be actioned.
 */
export function rosterFromCsv(block: string): Record<string, any>[] {
  return rosterFromBlock(readBlock(block));
}

export function rosterFromBlock(b: SheetBlock): Record<string, any>[] {
  if (!b.headers.length || !b.rows.length) return [];

  const headers = b.headers.map(normHeader);

  const cols: Record<string, number> = {};
  for (const [field, spellings] of Object.entries(ROSTER_FIELDS)) {
    const i = headers.findIndex((h) => spellings.includes(h));
    if (i >= 0) cols[field] = i;
  }
  const fullNameCol = headers.findIndex((h) => ROSTER_FULL_NAME.includes(h));

  if (cols.email === undefined) return [];

  const out: Record<string, any>[] = [];
  for (const cells of b.rows) {
    const email = (cells[cols.email] ?? "").trim();
    if (!email || !email.includes("@")) continue;

    const rec: Record<string, any> = { email: email.toLowerCase() };
    for (const [field, idx] of Object.entries(cols)) {
      if (field === "email") continue;
      rec[field] = cells[idx]?.trim() || null;
    }

    if (!rec.first_name && !rec.last_name && fullNameCol >= 0) {
      const whole = (cells[fullNameCol] ?? "").trim();
      const parts = whole.split(/\s+/);
      rec.first_name = parts.shift() || null;
      rec.last_name = parts.join(" ") || null;
    }

    out.push(rec);
  }
  return out;
}

export function rosterFromDocument(text: string): Record<string, any>[] {
  return readDocument(text).flatMap((b) => rosterFromBlock(b));
}
