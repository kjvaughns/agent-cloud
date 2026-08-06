/**
 * Working out what a document is, as cheaply as possible.
 *
 * The rule is deterministic first, AI last. `admin-import.functions.ts` already
 * does this in miniature — it tries a real parser and only falls back to the
 * model when the sheets don't match — and it is the right instinct: a
 * spreadsheet whose header row says `policy_number, carrier, face_amount` does
 * not need a language model to be recognised, and paying for one on every row
 * of every upload is how a feature becomes too expensive to leave switched on.
 *
 * Four rungs, stopping at the first confident answer:
 *
 *   1. header fingerprinting  — free, and right most of the time
 *   2. the uploader's own note — free, and right when they bothered to type it
 *   3. the model              — only for what the first two could not settle
 *   4. give up honestly       — ask, rather than guess
 *
 * The note is treated as a strong prior, never as an override. If someone says
 * "comp grid" and the columns say book of business, we ask instead of picking.
 * That asymmetry is deliberate: a book of business misrouted to the grid path
 * reaches `saveGrid`, and even in `merge` mode that clears every level on file
 * for whatever it decides the "products" are.
 */

import { readBlock, readDocument } from "./sheet-shape";

export const IMPORT_KINDS = [
  "book_of_business",
  "commission_grid",
  "agent_roster",
  "writing_numbers",
  "state_licenses",
  "commission_statement",
  "policy_status_report",
  "unknown",
] as const;

export type ImportKind = (typeof IMPORT_KINDS)[number];

export const KIND_LABEL: Record<ImportKind, string> = {
  book_of_business: "Book of business",
  commission_grid: "Commission grid",
  agent_roster: "Agent roster",
  writing_numbers: "Writing numbers",
  state_licenses: "State licenses",
  commission_statement: "Commission statement",
  policy_status_report: "Policy status report",
  unknown: "Not recognized",
};

/**
 * Where each kind lands, and therefore who has to approve it.
 *
 * `shared` means the rows are read by everybody in the agency — the carrier
 * catalogue, the comp grids every forecast is calculated from, the roster that
 * defines the downline. One person's misread document should not be able to
 * change those without a second pair of eyes.
 */
export const KIND_TARGET: Record<
  ImportKind,
  { table: string; scope: "own" | "shared"; applies: string } | null
> = {
  book_of_business: { table: "clients", scope: "own", applies: "saveClientFullRecord" },
  commission_grid: { table: "commission_grids", scope: "shared", applies: "saveGrid" },
  agent_roster: { table: "pending_agents", scope: "shared", applies: "confirmAdminImport" },
  writing_numbers: { table: "writing_numbers", scope: "shared", applies: "runContractingImport" },
  state_licenses: { table: "state_licenses", scope: "own", applies: "runContractingImport" },
  commission_statement: { table: "commission_statements", scope: "own", applies: "createStatement" },
  policy_status_report: { table: "policies", scope: "own", applies: "applyCarrierSync" },
  unknown: null,
};

/**
 * Column vocabularies, per kind.
 *
 * The writing-numbers, licences and carriers lists come straight from
 * `IMPORT_COLUMNS` in `contracting-import.functions.ts` — that mapping already
 * describes exactly these files, and duplicating it with different words would
 * mean two answers to the same question.
 */
const VOCAB: Record<Exclude<ImportKind, "unknown">, { strong: string[]; weak: string[] }> = {
  book_of_business: {
    strong: ["policy number", "policy #", "face amount", "annual premium", "monthly premium"],
    weak: ["first name", "last name", "phone", "email", "date of birth", "dob", "carrier", "effective date", "beneficiary"],
  },
  commission_grid: {
    strong: ["level", "comp level", "street level", "year 1", "years 2-5", "years 6+", "commission %"],
    weak: ["product", "carrier", "percentage", "rate", "age band"],
  },
  agent_roster: {
    strong: ["upline", "downline", "depth", "agent level", "recruiter"],
    weak: ["agent name", "first name", "last name", "email", "npn", "status", "hire date"],
  },
  writing_numbers: {
    strong: ["writing number", "writing #", "upline writing number"],
    weak: ["agent npn", "agent email", "carrier name", "number type", "product line", "effective date"],
  },
  state_licenses: {
    strong: ["loa", "lines of authority", "license number", "resident"],
    weak: ["agent npn", "state", "issued date", "expires date", "status"],
  },
  commission_statement: {
    strong: ["commission earned", "statement period", "chargeback", "advance", "paid amount"],
    weak: ["policy number", "agent", "carrier", "premium", "period"],
  },
  policy_status_report: {
    strong: ["policy status", "lapse date", "termination date", "in force"],
    weak: ["policy number", "status", "carrier", "effective date"],
  },
};

/** Words in the note that point at a kind. */
const NOTE_LEXICON: { kind: Exclude<ImportKind, "unknown">; words: string[] }[] = [
  { kind: "book_of_business", words: ["book of business", "book", "my clients", "clients", "policies", "policyholders"] },
  { kind: "commission_grid", words: ["comp grid", "commission grid", "grid", "comp", "rates", "rate card", "commission schedule"] },
  { kind: "agent_roster", words: ["roster", "agents", "downline", "team", "hierarchy", "recruits"] },
  { kind: "writing_numbers", words: ["writing number", "writing numbers", "appointment", "appointments", "contract"] },
  { kind: "state_licenses", words: ["license", "licenses", "licence", "nipr", "pdb", "loa"] },
  { kind: "commission_statement", words: ["statement", "commission statement", "payout", "earnings"] },
  { kind: "policy_status_report", words: ["lapse", "lapses", "status report", "terminations", "in force"] },
];

export type KindGuess = {
  kind: ImportKind;
  confidence: number;
  source: "headers" | "note" | "ai" | "none";
  /** Set when the note and the columns disagree. Never resolved silently. */
  conflict?: { fromHeaders: ImportKind; fromNote: ImportKind };
  reason: string;
};

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Score a set of column headers against each kind's vocabulary.
 *
 * A strong term is one that essentially only appears in that kind of file;
 * a weak term is suggestive but shared. Two weak terms should not outvote one
 * strong one, hence the weighting.
 */
export function guessFromHeaders(headers: string[]): { kind: ImportKind; score: number } {
  const norm = headers.map(normHeader).filter(Boolean);
  if (!norm.length) return { kind: "unknown", score: 0 };

  let best: ImportKind = "unknown";
  let bestScore = 0;

  for (const [kind, vocab] of Object.entries(VOCAB) as [Exclude<ImportKind, "unknown">, typeof VOCAB[keyof typeof VOCAB]][]) {
    let score = 0;
    for (const term of vocab.strong) if (norm.some((h) => h.includes(term))) score += 3;
    for (const term of vocab.weak) if (norm.some((h) => h.includes(term))) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = kind;
    }
  }

  return { kind: best, score: bestScore };
}

/** What the uploader said, if it points anywhere. */
export function guessFromNote(note: string | null | undefined): ImportKind {
  const n = (note ?? "").toLowerCase();
  if (!n.trim()) return "unknown";

  let best: ImportKind = "unknown";
  let bestLen = 0;
  for (const { kind, words } of NOTE_LEXICON) {
    for (const w of words) {
      // Longest matching phrase wins, so "commission grid" beats "commission".
      if (n.includes(w) && w.length > bestLen) {
        bestLen = w.length;
        best = kind;
      }
    }
  }
  return best;
}

/**
 * Combine the free signals. Returns `unknown` when they cannot settle it —
 * that is the caller's cue to spend an AI call, not a reason to guess.
 */
export function resolveKind(headers: string[], note: string | null | undefined): KindGuess {
  const fromHeaders = guessFromHeaders(headers);
  const fromNote = guessFromNote(note);

  const headersConfident = fromHeaders.score >= 4 && fromHeaders.kind !== "unknown";

  if (headersConfident && fromNote !== "unknown") {
    if (fromNote === fromHeaders.kind) {
      return {
        kind: fromHeaders.kind,
        confidence: 1,
        source: "headers",
        reason: "The columns and your description agree.",
      };
    }
    // Do not pick a winner. A book of business routed to the grid path reaches
    // a save that replaces every row for the carrier.
    return {
      kind: "unknown",
      confidence: 0,
      source: "none",
      conflict: { fromHeaders: fromHeaders.kind, fromNote },
      reason: `You described this as ${KIND_LABEL[fromNote].toLowerCase()}, but the columns look like ${KIND_LABEL[fromHeaders.kind].toLowerCase()}.`,
    };
  }

  if (headersConfident) {
    return {
      kind: fromHeaders.kind,
      confidence: 0.85,
      source: "headers",
      reason: "Recognized from the column headers.",
    };
  }

  if (fromNote !== "unknown" && fromHeaders.score === 0) {
    return {
      kind: fromNote,
      confidence: 0.7,
      source: "note",
      reason: "Going by your description — the columns weren't recognizable.",
    };
  }

  return { kind: "unknown", confidence: 0, source: "none", reason: "Couldn't tell from the columns." };
}

/**
 * The header row of a CSV-ish blob.
 *
 * Not the first line — `sheet-shape.ts` looks past the banner an agency puts
 * above its data and joins a stacked header back together. Routing off line 0
 * meant a book of business with a title row was classified `unknown`, which
 * sent a perfectly readable file to the model and then to a human.
 */
export function headerRowOf(text: string): string[] {
  return readBlock(text).headers.filter(Boolean);
}

/**
 * Headers from every sheet of a spreadsheet extraction, not just the first.
 * `extractDocument` labels sheets with `=== Sheet: name ===`, and a workbook's
 * identifying columns are often on the second tab.
 */
export function allHeaderRows(text: string): string[] {
  return readDocument(text).flatMap((b) => b.headers.filter(Boolean));
}
