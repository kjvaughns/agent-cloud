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
 */

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

/**
 * Split a CSV line, respecting quotes.
 *
 * Names contain commas — "Smith, Jr." is not two columns — and a naive split
 * shifts every field after it by one, which is the kind of corruption nobody
 * notices until the phone numbers are in the email column.
 */
function splitCsvLine(line: string, delim: string): string[] {
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
  const m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
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
  const lines = block.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const delim = lines[0].includes("\t") ? "\t" : ",";
  const headers = splitCsvLine(lines[0], delim).map(normHeader);

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

  const out: ExtractedClient[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delim);
    if (!cells.some((c) => c)) continue;

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

    if (Object.values(pol).some((v) => v !== null && v !== undefined)) rec.policies = [pol];

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
export function clientsFromDocument(text: string): ExtractedClient[] {
  const blocks = text.split(/^=== (?:Sheet|Page): .*? ===$/m).filter((b) => b.trim());
  return blocks.flatMap((b) => clientsFromCsv(b));
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
  const lines = block.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const delim = lines[0].includes("\t") ? "\t" : ",";
  const headers = splitCsvLine(lines[0], delim).map(normHeader);
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
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delim);
    if (!cells.some((c) => c)) continue;

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
  const blocks = text.split(/^=== (?:Sheet|Page): .*? ===$/m).filter((b) => b.trim());
  return blocks.flatMap((b) => contractingRowsFromCsv(b, kind));
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
  const lines = block.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const delim = lines[0].includes("\t") ? "\t" : ",";
  const headers = splitCsvLine(lines[0], delim).map(normHeader);

  const cols: Record<string, number> = {};
  for (const [field, spellings] of Object.entries(ROSTER_FIELDS)) {
    const i = headers.findIndex((h) => spellings.includes(h));
    if (i >= 0) cols[field] = i;
  }
  const fullNameCol = headers.findIndex((h) => ROSTER_FULL_NAME.includes(h));

  if (cols.email === undefined) return [];

  const out: Record<string, any>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delim);
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
  const blocks = text.split(/^=== (?:Sheet|Page): .*? ===$/m).filter((b) => b.trim());
  return blocks.flatMap((b) => rosterFromCsv(b));
}
