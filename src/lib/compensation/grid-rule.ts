/**
 * Which grid row applies to this deal.
 *
 * ── The gap this fills ──
 *
 * `resolveCompensation` decides what percentage an agent is on: their contract
 * override, their level's terms for the carrier, or their level's base. All
 * three are single numbers, so a carrier paying 100% on Final Expense at 55
 * and 60% at 82 could only ever be told to the product as one figure.
 *
 * `commission_grids` has carried `product_name`, `age_group_min/max`,
 * `year_1_pct`, `years_2_5_pct`, `years_6_plus_pct` and `level_name` since the
 * first schema. Nothing selected from it. This is that selection, as a pure
 * function, so Post a Deal, the calculator, forecasts and the ledger cannot
 * disagree about which row won.
 *
 * ── Most specific wins, and it is not a preference ──
 *
 * A carrier that publishes a national rate and a Florida exception means the
 * Florida one for Florida. Picking "the first match" or "the highest" would be
 * wrong in opposite directions on the same grid. Specificity is scored, and
 * ties are broken by the narrower age band — a row written for 71–80 was
 * written more deliberately than one written for 18–85.
 *
 * ── What this deliberately does not do ──
 *
 * Fall back. If no row matches, this returns null and the caller drops to the
 * level percentages, which is the brief's tiers 3 and 4. Inventing a rate here
 * would be the hard-coded percentage the brief forbids, one layer down where
 * nobody would look for it.
 */

/** One row of a carrier's published grid. */
export type GridRow = {
  id: string;
  /** The carrier's own level name, e.g. "Level 40". Not an agency position. */
  levelName: string | null;
  productName: string;
  ageMin: number | null;
  ageMax: number | null;
  /** Stored 0–500 where 80 means 80%, like every other percentage here. */
  year1Pct: number | null;
  years2to5Pct: number | null;
  years6PlusPct: number | null;
  /** Two-letter code when the row is a state exception, else null. */
  stateCode?: string | null;
  /** "tobacco" | "non_tobacco" | null when the row applies to both. */
  riskClass?: string | null;
};

export type GridQuery = {
  /** The carrier level the agent actually holds. */
  levelName: string | null;
  productName: string;
  /** Insured age on the policy effective date. */
  age: number | null;
  /** 1 for the first year. */
  policyYear: number;
  state?: string | null;
  riskClass?: string | null;
};

export type GridMatch = {
  row: GridRow;
  /** The percentage for the queried policy year, stored 0–500. */
  pct: number;
  /** Why this row and not another. Shown to an owner reconciling a number. */
  because: string;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * The column for a policy year.
 *
 * Years 2–5 and 6+ are separate columns rather than a formula because that is
 * how carriers publish them. A grid with renewals left blank returns null and
 * the caller falls back, rather than paying year one rates forever.
 */
export function pctForYear(row: GridRow, policyYear: number): number | null {
  if (policyYear <= 1) return row.year1Pct;
  if (policyYear <= 5) return row.years2to5Pct;
  return row.years6PlusPct;
}

/** Does this row apply at all? */
function applies(row: GridRow, q: GridQuery): boolean {
  if (norm(row.productName) !== norm(q.productName)) return false;

  // A row tied to a carrier level only applies to that level. A row with no
  // level applies to any of them, which is how single-level grids are written.
  if (row.levelName && norm(row.levelName) !== norm(q.levelName)) return false;

  // An age band with no bounds covers every age. One with bounds excludes an
  // age outside them — and an unknown age cannot be placed in a bounded band,
  // so it does not match one. That is what makes Post a Deal ask for the age
  // rather than quietly using the widest row.
  if (row.ageMin != null || row.ageMax != null) {
    if (q.age == null) return false;
    if (row.ageMin != null && q.age < row.ageMin) return false;
    if (row.ageMax != null && q.age > row.ageMax) return false;
  }

  // A state or risk row applies only to its own; a row with neither applies to
  // all, so a grid without exceptions behaves exactly as it does today.
  if (row.stateCode && norm(row.stateCode) !== norm(q.state)) return false;
  if (row.riskClass && norm(row.riskClass) !== norm(q.riskClass)) return false;

  return pctForYear(row, q.policyYear) != null;
}

/**
 * How specific a matching row is.
 *
 * State and risk outrank the age band because a carrier writing a Florida
 * exception is overriding the national schedule deliberately, while every row
 * has some age band whether or not anybody thought about it.
 */
function specificity(row: GridRow): number {
  let score = 0;
  if (row.stateCode) score += 8;
  if (row.riskClass) score += 4;
  if (row.levelName) score += 2;
  if (row.ageMin != null || row.ageMax != null) score += 1;
  return score;
}

/** Narrower is more deliberate. Unbounded bands sort last. */
function bandWidth(row: GridRow): number {
  if (row.ageMin == null && row.ageMax == null) return Number.MAX_SAFE_INTEGER;
  const lo = row.ageMin ?? 0;
  const hi = row.ageMax ?? 120;
  return hi - lo;
}

function reason(row: GridRow, q: GridQuery): string {
  const bits: string[] = [row.productName];
  if (row.ageMin != null || row.ageMax != null) {
    bits.push(`ages ${row.ageMin ?? 0}–${row.ageMax ?? "up"}`);
  }
  if (row.stateCode) bits.push(row.stateCode.toUpperCase());
  if (row.riskClass) bits.push(row.riskClass.replace(/_/g, " "));
  if (row.levelName) bits.push(row.levelName);
  const year = q.policyYear <= 1 ? "year 1" : q.policyYear <= 5 ? "years 2–5" : "years 6+";
  return `${bits.join(", ")} — ${year}`;
}

/**
 * The row that applies, or null when the grid says nothing about this deal.
 *
 * Null is a normal answer, not a failure: most agencies start with no grid at
 * all and pay from the level percentages. The caller decides what that means.
 */
export function selectGridRule(rows: GridRow[], q: GridQuery): GridMatch | null {
  const candidates = rows.filter((r) => applies(r, q));
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const s = specificity(b) - specificity(a);
    if (s !== 0) return s;
    const w = bandWidth(a) - bandWidth(b);
    if (w !== 0) return w;
    // Deterministic last resort. Two rows this alike are a data problem, and
    // the constraint added alongside this refuses new ones; ordering by id at
    // least makes the same deal resolve the same way twice.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const row = candidates[0];
  const pct = pctForYear(row, q.policyYear);
  if (pct == null) return null;
  return { row, pct, because: reason(row, q) };
}

/**
 * Which products an agent may pick for a carrier.
 *
 * Post a Deal shows these and nothing else, so a product the agency never
 * configured cannot be sold into a grid that says nothing about it.
 */
export function productsFor(rows: GridRow[], levelName: string | null): string[] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    if (r.levelName && norm(r.levelName) !== norm(levelName)) continue;
    const k = norm(r.productName);
    if (k && !seen.has(k)) seen.set(k, r.productName.trim());
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * The age bands published for one product, in order.
 *
 * Used to tell an owner reviewing an extraction that 71–80 is covered and
 * 81–85 is not, and to show an agent why their 82 year old resolved lower.
 */
export function bandsFor(rows: GridRow[], productName: string): { min: number; max: number }[] {
  return rows
    .filter((r) => norm(r.productName) === norm(productName))
    .filter((r) => r.ageMin != null || r.ageMax != null)
    .map((r) => ({ min: r.ageMin ?? 0, max: r.ageMax ?? 120 }))
    .sort((a, b) => a.min - b.min)
    .filter((b, i, all) => i === 0 || b.min !== all[i - 1].min || b.max !== all[i - 1].max);
}

/**
 * Gaps and overlaps in a product's bands.
 *
 * The extraction review screen needs both: a gap means a deal at that age
 * silently falls back, and an overlap means two rows claim the same age and
 * which one wins depends on tie-breaking nobody chose.
 */
export function bandProblems(rows: GridRow[], productName: string): string[] {
  const bands = bandsFor(rows, productName);
  const out: string[] = [];
  for (let i = 1; i < bands.length; i++) {
    const prev = bands[i - 1];
    const cur = bands[i];
    if (cur.min <= prev.max) {
      out.push(
        `${productName}: ages ${cur.min}–${prev.max} are covered by two rows ` +
          `(${prev.min}–${prev.max} and ${cur.min}–${cur.max}).`,
      );
    } else if (cur.min > prev.max + 1) {
      out.push(
        `${productName}: nothing covers ages ${prev.max + 1}–${cur.min - 1}, ` +
          `so a deal in that range falls back to the level percentage.`,
      );
    }
  }
  return out;
}

/**
 * What Post a Deal has to ask for before this carrier can be priced.
 *
 * Derived from the grid rather than configured, because the grid is what
 * decides. A carrier whose rows carry no age bands must not make an agent
 * enter a date of birth to satisfy a form; a carrier with a Florida exception
 * must ask for the state or it will quietly pay the national rate in Florida.
 *
 * `needsAge` is the one that matters most. An unknown age matches no bounded
 * band at all, so without asking, every deal on a banded carrier falls back to
 * the level percentage and the agency's uploaded grid does nothing.
 */
export type DealRequirements = {
  products: string[];
  needsAge: boolean;
  needsState: boolean;
  needsRisk: boolean;
};

export function requirementsFor(rows: GridRow[], levelName: string | null): DealRequirements {
  const mine = rows.filter((r) => !r.levelName || norm(r.levelName) === norm(levelName));
  return {
    products: productsFor(rows, levelName),
    needsAge: mine.some((r) => r.ageMin != null || r.ageMax != null),
    needsState: mine.some((r) => Boolean(r.stateCode)),
    needsRisk: mine.some((r) => Boolean(r.riskClass)),
  };
}

/**
 * What is still missing before this deal can be priced from the grid.
 *
 * Returned as sentences an agent can act on. Empty means either the deal is
 * fully specified or the carrier has no grid — both of which price fine, one
 * from the grid and one from the level percentage.
 */
export function missingForPricing(
  req: DealRequirements,
  deal: { age: number | null; state?: string | null; riskClass?: string | null },
): string[] {
  const out: string[] = [];
  if (req.needsAge && deal.age == null) {
    out.push("This carrier pays different rates by age. Add the insured's date of birth.");
  }
  if (req.needsState && !deal.state) {
    out.push("This carrier pays different rates in some states. Choose the state.");
  }
  if (req.needsRisk && !deal.riskClass) {
    out.push("This carrier pays different rates by tobacco use. Choose one.");
  }
  return out;
}

/**
 * Age on a date, which is what a carrier rates on.
 *
 * Not age today: a policy written in December for somebody whose birthday is
 * in November is rated at the age they were when it was written, and using
 * today's age would move a deal into the wrong band months later.
 */
export function ageOn(dateOfBirth: string | Date, effective: string | Date): number | null {
  const dob = new Date(dateOfBirth);
  const eff = new Date(effective);
  if (Number.isNaN(dob.getTime()) || Number.isNaN(eff.getTime())) return null;
  let age = eff.getFullYear() - dob.getFullYear();
  const m = eff.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && eff.getDate() < dob.getDate())) age -= 1;
  return age < 0 ? null : age;
}
