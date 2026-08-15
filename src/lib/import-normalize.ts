/**
 * Turning what a spreadsheet says into what the database means.
 *
 * Every function here exists because of a specific way real agency data
 * arrives broken. None of them is clever; all of them are the difference
 * between an import that works and one that quietly destroys a field.
 *
 * ── Why this is deterministic code and not an LLM call ──────────────────────
 *
 * The model is good at *proposing a mapping* — "this column called `cust_tel`
 * is probably the phone number". It is bad, expensive and unauditable at
 * *executing* one, and per-row LLM calls on a four-thousand-row book are all
 * three at once. So the model proposes and this executes. Every rule below can
 * be read, tested and argued with; none of them is a prompt.
 *
 * Pure on purpose, so `scripts/import-normalize-check.ts` can exercise the
 * whole surface with no database and no network.
 */

// ── Policy status ───────────────────────────────────────────────────────────

/**
 * Carriers and CRMs each spell the same handful of states differently, and
 * some spell them in one letter. `A`, `IF`, `In Force`, `Paid` and `Active`
 * are the same policy.
 *
 * Anything unrecognised returns null rather than a guess — an unknown status
 * silently coerced to `active` is a lapsed policy counted as production.
 */
const POLICY_STATUS: Record<string, string> = {
  a: "active", active: "active", if: "active", "in force": "active",
  inforce: "active", paid: "active", "paid up": "active", current: "active",
  issued: "active", placed: "active",

  p: "issued_not_paid", pending: "issued_not_paid", "issued not paid": "issued_not_paid",
  inp: "issued_not_paid", "issued-not-paid": "issued_not_paid", unpaid: "issued_not_paid",

  ur: "in_review", "under review": "in_review", underwriting: "in_review",
  uw: "in_review", "in review": "in_review", submitted: "in_review", app: "in_review",

  lp: "lapse_pending", "lapse pending": "lapse_pending", grace: "lapse_pending",
  "grace period": "lapse_pending", delinquent: "lapse_pending",

  l: "lapsed", lapse: "lapsed", lapsed: "lapsed", terminated: "lapsed",
  term: "lapsed", expired: "lapsed",

  c: "cancelled", cancel: "cancelled", cancelled: "cancelled", canceled: "cancelled",
  surrendered: "cancelled",

  w: "withdrawn", withdrawn: "withdrawn", nt: "not_taken", "not taken": "not_taken",
  "not taken out": "not_taken", nto: "not_taken", declined: "not_taken",
  postponed: "postponed", pp: "postponed",

  /*
    Carrier contract vocabulary.

    Royal Neighbors (and every carrier built on the same admin system) prints a
    contract status and a status *reason*, and the reason is where the meaning
    is: "CONTRACT TERMINATED" alone cannot tell production from a chargeback,
    while "CON TERM NT NO PAY" says the policy never paid and "CON TERM
    WITHDRAWN" says the application was pulled. Left unmapped, every one of
    these fell through to `active` and a terminated book counted as production.
  */
  "contract active": "active",
  "con active": "active",
  "contract terminated": "lapsed",
  "con term lapsed": "lapsed",
  "con term nt no pay": "not_taken",
  "con term not taken": "not_taken",
  "con term declined": "not_taken",
  "con term withdrawn": "withdrawn",
  "con term incomplete": "withdrawn",
  "contract suspended": "in_review",
  "con sus home office": "in_review",
  "contract pending": "in_review",
  "con pend submitted": "in_review",
  "con pend": "in_review",
};

export function normalizePolicyStatus(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const k = String(raw).toLowerCase().trim().replace(/[._]/g, " ").replace(/\s+/g, " ");
  return POLICY_STATUS[k] ?? null;
}

// ── Premium mode ────────────────────────────────────────────────────────────

const MODE_WORDS: Record<string, string> = {
  m: "monthly", mo: "monthly", mth: "monthly", monthly: "monthly", month: "monthly",
  q: "quarterly", qtr: "quarterly", quarterly: "quarterly", quarter: "quarterly",
  s: "semi_annual", sa: "semi_annual", semi: "semi_annual",
  "semi annual": "semi_annual", "semi-annual": "semi_annual", semiannual: "semi_annual",
  "twice yearly": "semi_annual",
  a: "annual", ann: "annual", annual: "annual", annually: "annual", yearly: "annual",
  y: "annual", year: "annual",
  w: "weekly", weekly: "weekly",
  b: "biweekly", biweekly: "biweekly", "bi-weekly": "biweekly", "every two weeks": "biweekly",
};

/**
 * Payments per year, when the mode arrives as a number.
 *
 * This is the trap the roadmap flags and it is easy to miss: some systems
 * encode mode as an integer meaning *payments per year*, so `12` is monthly
 * and `1` is annual — the opposite of the intuitive reading where a bigger
 * number sounds like a longer period. Getting it backwards turns an annual
 * premium into a monthly one and multiplies somebody's reported production by
 * twelve.
 */
const MODE_BY_PAYMENTS: Record<number, string> = {
  1: "annual", 2: "semi_annual", 4: "quarterly", 12: "monthly", 26: "biweekly", 52: "weekly",
};

export function normalizePremiumMode(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === "") return null;

  const asNumber = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (Number.isFinite(asNumber) && String(raw).trim() !== "") {
    return MODE_BY_PAYMENTS[asNumber] ?? null;
  }

  const k = String(raw).toLowerCase().trim().replace(/[._]/g, " ").replace(/\s+/g, " ");
  return MODE_WORDS[k] ?? null;
}

// ── The format landmines ────────────────────────────────────────────────────

/**
 * Undo what Excel did to a policy number.
 *
 * Two failures, both silent, both destroying an identifier:
 *
 *   1. **Scientific notation.** A long numeric policy number becomes
 *      `1.23457E+14` the moment the cell is treated as a number, and the
 *      original digits are gone from the display. The export writes the
 *      mangled form.
 *   2. **Stripped leading zeros.** `00123456` becomes `123456`. Nothing in the
 *      file records that four characters were removed.
 *
 * The scientific-notation case is recoverable — the mantissa and exponent
 * still describe the integer — so it is reconstructed. The leading-zero case
 * is *not* recoverable, and this deliberately does not pad to a guessed width:
 * inventing zeros would be a second corruption dressed as a fix. `expectedLength`
 * exists for callers who genuinely know the carrier's format.
 */
export function normalizePolicyNumber(
  raw: string | number | null | undefined,
  opts: { expectedLength?: number } = {},
): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // 1.23457E+14 → 123457000000000
  if (/^-?\d+(\.\d+)?e\+?\d+$/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) {
      // toFixed(0) rather than String(n), which would just print the
      // scientific form back out for large values.
      s = BigInt(Math.round(n)).toString();
    }
  }

  // Trailing `.0` from a float round-trip.
  s = s.replace(/\.0+$/, "");

  if (opts.expectedLength && /^\d+$/.test(s) && s.length < opts.expectedLength) {
    s = s.padStart(opts.expectedLength, "0");
  }

  return s;
}

/**
 * Split a full name without destroying it.
 *
 * `name.split(" ")` with `[0]` and `[1]` is the standard implementation and it
 * gets "Mary Jo Van Der Berg" wrong in two directions at once — first name
 * "Mary", last name "Jo". The surname is four words long and none of them
 * survive.
 *
 * Rules, in order:
 *   - `Last, First M.` is unambiguous when a comma is present, so that wins.
 *   - Trailing suffixes (Jr, III, MD) belong to neither name.
 *   - Surname particles (van, de, der, del, di, la, mc, o') bind forwards, so
 *     "Van Der Berg" stays together.
 *   - Everything between the first token and the surname is a middle name.
 */
const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v", "md", "phd", "esq", "dds"]);
const PARTICLES = new Set(["van", "von", "de", "del", "della", "der", "den", "di", "da", "du", "la", "le", "st", "st.", "mac", "mc", "o'", "bin", "al", "ter"]);

export function splitName(raw: string | null | undefined): {
  first: string; middle: string | null; last: string; suffix: string | null;
} | null {
  if (!raw) return null;
  const cleaned = String(raw).replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  // "Last, First Middle" — the comma removes all ambiguity, so trust it.
  if (cleaned.includes(",")) {
    const [lastPart, restPart = ""] = cleaned.split(",", 2).map((x) => x.trim());
    const rest = restPart.split(" ").filter(Boolean);
    const suffix = rest.length && SUFFIXES.has(rest[rest.length - 1].toLowerCase())
      ? rest.pop()! : null;
    return {
      first: rest[0] ?? "",
      middle: rest.length > 1 ? rest.slice(1).join(" ") : null,
      last: lastPart,
      suffix,
    };
  }

  const parts = cleaned.split(" ").filter(Boolean);
  const suffix = parts.length > 1 && SUFFIXES.has(parts[parts.length - 1].toLowerCase())
    ? parts.pop()! : null;

  if (parts.length === 1) return { first: parts[0], middle: null, last: "", suffix };
  if (parts.length === 2) return { first: parts[0], middle: null, last: parts[1], suffix };

  // Walk back from the end while the token before is a particle, so the whole
  // surname phrase comes along.
  let lastStart = parts.length - 1;
  while (lastStart > 1 && PARTICLES.has(parts[lastStart - 1].toLowerCase())) lastStart--;

  return {
    first: parts[0],
    middle: lastStart > 1 ? parts.slice(1, lastStart).join(" ") : null,
    last: parts.slice(lastStart).join(" "),
    suffix,
  };
}

/**
 * Parse a date without guessing between day and month.
 *
 * `03/04/2026` is 3 April in most of the world and 4 March in the United
 * States, and nothing in the cell says which. Guessing wrong shifts an
 * effective date by up to eleven months, which moves a policy into a different
 * commission period.
 *
 * So: ISO is taken as ISO. An unambiguous value (a component over 12) is read
 * from whichever position forces it. A genuinely ambiguous value is resolved
 * by `assume`, which the caller must choose deliberately — and the return says
 * which rule fired, so an importer can flag the ambiguous ones for review
 * rather than pretending it knew.
 */
export function parseImportDate(
  raw: string | null | undefined,
  opts: { assume?: "US" | "ISO" | "EU" } = {},
): { iso: string; ambiguous: boolean } | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Already ISO.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return { iso: `${iso[1]}-${iso[2]}-${iso[3]}`, ambiguous: false };

  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
  if (m) {
    const [, a, b, y] = m;
    let year = Number(y);
    // Two-digit years: 70-99 are the 1900s, everything else the 2000s. A
    // policy effective in 1972 is plausible; one in 2072 is not.
    if (y.length === 2) year = year >= 70 ? 1900 + year : 2000 + year;

    const na = Number(a), nb = Number(b);
    let month: number, day: number, ambiguous = false;

    if (na > 12 && nb <= 12) { day = na; month = nb; }
    else if (nb > 12 && na <= 12) { month = na; day = nb; }
    else if (na > 12 && nb > 12) return null; // neither can be a month
    else {
      // Both ≤ 12. Genuinely undecidable from the value alone.
      ambiguous = true;
      if (opts.assume === "EU") { day = na; month = nb; }
      else { month = na; day = nb; }
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const pad = (n: number) => String(n).padStart(2, "0");
    return { iso: `${year}-${pad(month)}-${pad(day)}`, ambiguous };
  }

  // Anything else — "March 4, 2026", "4 Mar 26" — hand to the runtime, which
  // handles the long forms well. Rejected if it cannot.
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return { iso: d.toISOString().slice(0, 10), ambiguous: false };
}

/**
 * A currency amount from a spreadsheet cell.
 *
 * Handles `$1,234.56`, `1 234,56` (European), bare numbers, and accounting
 * negatives written as `(1,234.56)`. Returns null rather than 0 for anything
 * unparseable — a premium silently becoming zero is a policy that looks free.
 */
export function parseAmount(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

  let s = String(raw).trim();
  if (!s) return null;

  const accountingNegative = /^\(.*\)$/.test(s);
  if (accountingNegative) s = s.slice(1, -1);

  s = s.replace(/[^\d.,-]/g, "");
  if (!s) return null;

  // European "1.234,56": the comma is the decimal separator when it comes last.
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return accountingNegative ? -Math.abs(n) : n;
}
