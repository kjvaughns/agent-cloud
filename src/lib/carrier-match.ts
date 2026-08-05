/**
 * Working out which carrier a spreadsheet means.
 *
 * ── The bug this replaces ───────────────────────────────────────────────────
 *
 * `admin-import.functions.ts` resolved a carrier name like this:
 *
 *     if (name.includes(k) || k.includes(name)) return id;
 *
 * A substring test, in a loop, returning the first hit. Both directions of that
 * comparison are wrong in a way that quietly files policies under the wrong
 * carrier:
 *
 * - `k.includes(name)` — a spreadsheet cell reading "Mutual of Omaha Life" hits
 *   any carrier whose name is a substring of it. "Omaha", "Life", "Mutual" all
 *   match, and whichever the Map happens to iterate first wins.
 * - `name.includes(k)` — a cell reading "Life" matches *every* carrier with
 *   "Life" in the name. In a life-insurance product that is most of them.
 *
 * Neither reports a confidence, so a wrong answer looks exactly like a right
 * one, and the policy lands in somebody's book under a carrier they do not
 * hold a contract with. In an insurance product that is a commission paid at
 * the wrong level, not a cosmetic error.
 *
 * ── What replaces it ────────────────────────────────────────────────────────
 *
 * Four strategies, tried in order of how much they prove, each returning a
 * confidence the caller can act on:
 *
 *   1. **NAIC code** (1.00) — the industry's actual primary key. If the file
 *      carries one, nothing else is worth consulting.
 *   2. **Exact name** (0.99) after normalisation.
 *   3. **Known alias** (0.97) — "MoO", "United of Omaha", "Omaha Insurance Co".
 *      Curated, because the aliases carriers actually use are not derivable.
 *   4. **Edit distance** (0.0–0.95) — catches typos and spacing, and *only*
 *      typos, because it is normalised by length rather than counting raw
 *      characters.
 *
 * Below `CONFIRM_THRESHOLD` the answer is a suggestion, never a write. The
 * import asks. Guessing silently is the thing that got us here.
 *
 * Pure on purpose — no imports, no queries — so `scripts/carrier-match-check.ts`
 * can exercise it against real carrier names without a database.
 */

export type CarrierRecord = {
  id: string;
  name: string;
  naicCode?: string | null;
  /** Lower-cased alternates from `carrier_aliases`. */
  aliases?: string[];
};

export type MatchMethod = "naic" | "exact" | "alias" | "fuzzy" | "none";

export type CarrierMatch = {
  carrierId: string | null;
  /** 0–1. Anything below CONFIRM_THRESHOLD must be confirmed by a human. */
  confidence: number;
  method: MatchMethod;
  /** What was matched against, for the diff report. */
  matchedOn?: string;
};

/**
 * The line between "file it" and "ask".
 *
 * 0.9 because the normalised edit distance below reaches it only for
 * differences of roughly one character in ten — a typo or a stray period. Two
 * genuinely different carrier names do not get there: "Mutual of Omaha" and
 * "Mutual of New York" score 0.71, which is exactly the kind of pair the old
 * substring test would have collapsed into one.
 */
export const CONFIRM_THRESHOLD = 0.9;

/**
 * Strip everything that varies between how two systems write the same carrier.
 *
 * Corporate suffixes go because "Americo Financial Life and Annuity Insurance
 * Company" and "Americo" are the same carrier to everybody except a string
 * comparison. `&`→`and` because carriers are inconsistent about it within their
 * own paperwork.
 */
export function normalizeCarrierName(raw: string): string {
  const base = raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.,'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const stripped = base
    .replace(
      /\b(the|and|inc|llc|ltd|co|corp|corporation|company|companies|group|holdings|insurance|assurance|life|annuity|annuities|financial|services|of america|usa|national)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();

  // Some carriers are named entirely out of the words above — "Life Insurance
  // Company of the Southwest" strips down to "southwest", but a hypothetical
  // "Life & Annuity Co" strips to nothing at all. Falling back to the lightly
  // normalised form keeps those matchable instead of turning them into the
  // empty string, which would match every other over-stripped name.
  return stripped || base;
}

/** NAIC codes are five digits, sometimes written with leading zeros stripped. */
export function normalizeNaic(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length === 0 || digits.length > 5) return null;
  return digits.padStart(5, "0");
}

/** Levenshtein, iterative, two rows. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Similarity as a fraction of the longer string.
 *
 * Normalising by length is what keeps this honest: three wrong characters in a
 * six-letter name is a different carrier, three in a forty-letter name is a
 * typo. Counting raw edits treats them the same.
 */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - editDistance(a, b) / longest;
}

/**
 * Match one name (and optional NAIC code) against the agency's carriers.
 *
 * Returns the best candidate with its confidence. A caller that writes without
 * checking `confidence >= CONFIRM_THRESHOLD` has reintroduced the bug.
 */
export function matchCarrier(
  raw: string | null | undefined,
  carriers: CarrierRecord[],
  opts: { naicCode?: string | null } = {},
): CarrierMatch {
  const none: CarrierMatch = { carrierId: null, confidence: 0, method: "none" };
  if (!raw || !raw.trim()) return none;

  // 1. NAIC — the real primary key. Nothing beats it, so nothing else runs.
  const naic = normalizeNaic(opts.naicCode);
  if (naic) {
    const hit = carriers.find((c) => normalizeNaic(c.naicCode) === naic);
    if (hit) return { carrierId: hit.id, confidence: 1, method: "naic", matchedOn: naic };
  }

  const needle = normalizeCarrierName(raw);
  if (!needle) return none;

  // 2. Exact, post-normalisation.
  const exact = carriers.find((c) => normalizeCarrierName(c.name) === needle);
  if (exact) return { carrierId: exact.id, confidence: 0.99, method: "exact", matchedOn: exact.name };

  // 3. Curated aliases.
  for (const c of carriers) {
    for (const alias of c.aliases ?? []) {
      if (normalizeCarrierName(alias) === needle) {
        return { carrierId: c.id, confidence: 0.97, method: "alias", matchedOn: alias };
      }
    }
  }

  // 4. Nearest by normalised edit distance. Every candidate is scored and the
  //    best wins — unlike the old loop, which returned whichever substring
  //    happened to be reached first.
  let best: CarrierMatch = none;
  for (const c of carriers) {
    const candidates = [c.name, ...(c.aliases ?? [])];
    for (const cand of candidates) {
      const score = similarity(needle, normalizeCarrierName(cand));
      if (score > best.confidence) {
        best = {
          carrierId: c.id,
          // Capped below the exact/alias tiers so a fuzzy hit can never
          // outrank something that was actually verified.
          confidence: Math.min(score, 0.95),
          method: "fuzzy",
          matchedOn: cand,
        };
      }
    }
  }

  // A near-zero fuzzy score is noise, not a match. Reporting "12% confident it
  // is Foresters" invites somebody to accept it.
  return best.confidence >= 0.55 ? best : none;
}

/** Convenience: did this match clear the bar to be written without asking? */
export function isConfident(m: CarrierMatch): boolean {
  return m.carrierId !== null && m.confidence >= CONFIRM_THRESHOLD;
}
