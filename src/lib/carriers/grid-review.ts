/**
 * What is wrong with an extracted comp grid, before anybody saves it.
 *
 * ── Why this exists ──
 *
 * Extraction reads a photograph of a paper grid. It is good, not perfect, and
 * the failures are boringly consist: a rate read as 8 instead of 80, an age
 * band whose upper bound was in a column the camera cut off, two bands that
 * overlap because "50-70" and "70-85" both claim 70, a level column with no
 * heading. Every one of those silently misprices deals forever, and none of
 * them looks wrong in a table of numbers.
 *
 * So the review step names them. Pure functions over the rows, no queries and
 * no React, because the same checks are worth running in a test and in the
 * wizard, and a rule that only exists inside a component cannot be verified.
 *
 * ── Severity is the whole design ──
 *
 * `blocking` means the row cannot be stored as a fact: no product, no level,
 * no first-year rate, a band that runs backwards, or two bands fighting over
 * the same age. `warning` means it is storable and suspicious — a rate outside
 * what any carrier pays, a low-confidence read, ages nobody covers. Warnings
 * never stop a save, because an owner who knows their carrier pays 145% should
 * not have to argue with us about it.
 */

export type ReviewRow = {
  product_name: string;
  level_name: string;
  year_1_pct: number | null;
  years_2_5_pct?: number | null;
  years_6_plus_pct?: number | null;
  age_group_min?: number | null;
  age_group_max?: number | null;
  /** 0–1 from the extraction, when it reported one. */
  confidence?: number | null;
  is_estimated?: boolean;
};

export type Severity = "blocking" | "warning";

export type GridIssue = {
  severity: Severity;
  /** Stable key so the UI can highlight, and a test can assert on it. */
  code:
    | "missing_product"
    | "missing_level"
    | "missing_rate"
    | "band_backwards"
    | "band_overlap"
    | "band_gap"
    | "rate_out_of_range"
    | "low_confidence"
    | "estimated";
  message: string;
  /** Indexes into the rows passed in. Empty when the issue is about the set. */
  rows: number[];
};

/** Anything outside this on a first-year rate is a misread until proven. */
const PLAUSIBLE_MIN = 1;
const PLAUSIBLE_MAX = 145;

/** Below this the extraction is guessing, and a guess must be looked at. */
export const LOW_CONFIDENCE = 0.7;

/** The ages a life grid is expected to cover, when it bands at all. */
const EXPECTED_MIN_AGE = 18;
const EXPECTED_MAX_AGE = 85;

function key(r: ReviewRow): string {
  return `${r.product_name.trim().toLowerCase()}|${r.level_name.trim().toLowerCase()}`;
}

function bandOf(r: ReviewRow): { min: number; max: number } | null {
  const min = r.age_group_min;
  const max = r.age_group_max;
  if (min == null && max == null) return null;
  // A half-open band is still a band: an unbounded end is the whole tail, which
  // is exactly how "70+" is printed on real grids.
  return { min: min ?? 0, max: max ?? 120 };
}

/**
 * Every issue in one pass, ordered blocking first.
 *
 * Grouped by product and level because that is the unit a band belongs to —
 * "0-49 and 50-85 for Final Expense at Level 40" is complete, and comparing it
 * against Term Life's bands would invent overlaps that do not exist.
 */
export function reviewGrid(rows: ReviewRow[]): GridIssue[] {
  const issues: GridIssue[] = [];

  const missingProduct: number[] = [];
  const missingLevel: number[] = [];
  const missingRate: number[] = [];
  const backwards: number[] = [];
  const outOfRange: number[] = [];
  const lowConfidence: number[] = [];
  const estimated: number[] = [];

  rows.forEach((r, i) => {
    if (!String(r.product_name ?? "").trim()) missingProduct.push(i);
    if (!String(r.level_name ?? "").trim()) missingLevel.push(i);

    const y1 = r.year_1_pct;
    if (y1 == null || Number.isNaN(y1) || y1 === 0) {
      missingRate.push(i);
    } else if (y1 < PLAUSIBLE_MIN || y1 > PLAUSIBLE_MAX) {
      outOfRange.push(i);
    }

    const band = bandOf(r);
    if (band && band.min > band.max) backwards.push(i);

    if (r.confidence != null && r.confidence < LOW_CONFIDENCE) lowConfidence.push(i);
    if (r.is_estimated) estimated.push(i);
  });

  if (missingProduct.length) {
    issues.push({
      severity: "blocking",
      code: "missing_product",
      message: `${count(missingProduct.length, "row")} has no product name. A rate that is not against a product cannot price a deal.`,
      rows: missingProduct,
    });
  }
  if (missingLevel.length) {
    issues.push({
      severity: "blocking",
      code: "missing_level",
      message: `${count(missingLevel.length, "row")} has no contract level. The level is how a position is matched to this rate.`,
      rows: missingLevel,
    });
  }
  if (missingRate.length) {
    issues.push({
      severity: "blocking",
      code: "missing_rate",
      message: `${count(missingRate.length, "row")} has no first-year rate. Fill it in or remove the row — a zero would pay nothing.`,
      rows: missingRate,
    });
  }
  if (backwards.length) {
    issues.push({
      severity: "blocking",
      code: "band_backwards",
      message: `${count(backwards.length, "age band")} starts above where it ends. Check the age columns on the original.`,
      rows: backwards,
    });
  }

  // Overlaps and gaps, per product and level.
  const groups = new Map<string, number[]>();
  rows.forEach((r, i) => {
    if (!String(r.product_name ?? "").trim() || !String(r.level_name ?? "").trim()) return;
    const k = key(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(i);
  });

  for (const [, idx] of groups) {
    const banded = idx
      .map((i) => ({ i, band: bandOf(rows[i]) }))
      .filter((x): x is { i: number; band: { min: number; max: number } } => x.band != null)
      // A band that runs backwards is already reported, and reasoning about
      // coverage from it would invent a second complaint about the same typo.
      .filter((x) => x.band.min <= x.band.max)
      .sort((a, b) => a.band.min - b.band.min);


    // Two rows for the same product and level with no bands at all is a
    // duplicate, not a band problem — same rate twice, or worse, two different
    // rates with no rule saying which wins.
    const unbanded = idx.filter((i) => bandOf(rows[i]) == null);
    if (unbanded.length > 1) {
      issues.push({
        severity: "blocking",
        code: "band_overlap",
        message:
          `${rows[unbanded[0]].product_name} at ${rows[unbanded[0]].level_name} appears ` +
          `${unbanded.length} times with no age band, so nothing decides which rate applies. ` +
          `Give each row its ages, or keep one.`,
        rows: unbanded,
      });
    }
    if (banded.length > 1 && unbanded.length > 0) {
      issues.push({
        severity: "warning",
        code: "band_overlap",
        message:
          `${rows[unbanded[0]].product_name} at ${rows[unbanded[0]].level_name} has both ` +
          `age-banded rates and one with no ages, which covers every age including the banded ones.`,
        rows: [...unbanded, ...banded.map((b) => b.i)],
      });
    }

    for (let n = 1; n < banded.length; n++) {
      const prev = banded[n - 1];
      const cur = banded[n];
      if (cur.band.min <= prev.band.max) {
        issues.push({
          severity: "blocking",
          code: "band_overlap",
          message:
            `${rows[cur.i].product_name} at ${rows[cur.i].level_name}: ages ` +
            `${prev.band.min}-${prev.band.max} and ${cur.band.min}-${cur.band.max} overlap, ` +
            `so an age in both has two rates.`,
          rows: [prev.i, cur.i],
        });
      } else if (cur.band.min > prev.band.max + 1) {
        issues.push({
          severity: "warning",
          code: "band_gap",
          message:
            `${rows[cur.i].product_name} at ${rows[cur.i].level_name}: nothing covers ages ` +
            `${prev.band.max + 1}-${cur.band.min - 1}. A deal in that range will fall back ` +
            `to the position percentage.`,
          rows: [prev.i, cur.i],
        });
      }
    }

    if (banded.length > 0) {
      const lowest = banded[0].band.min;
      const highest = banded[banded.length - 1].band.max;
      if (lowest > EXPECTED_MIN_AGE || highest < EXPECTED_MAX_AGE) {
        issues.push({
          severity: "warning",
          code: "band_gap",
          message:
            `${rows[banded[0].i].product_name} at ${rows[banded[0].i].level_name} covers ages ` +
            `${lowest}-${highest === 120 ? "up" : highest}. Anything outside that pays the ` +
            `position percentage.`,
          rows: banded.map((b) => b.i),
        });
      }
    }
  }

  if (outOfRange.length) {
    issues.push({
      severity: "warning",
      code: "rate_out_of_range",
      message:
        `${count(outOfRange.length, "rate")} is outside ${PLAUSIBLE_MIN}–${PLAUSIBLE_MAX}%, ` +
        `which usually means a decimal was misread. Confirm it if your carrier really pays that.`,
      rows: outOfRange,
    });
  }
  if (lowConfidence.length) {
    issues.push({
      severity: "warning",
      code: "low_confidence",
      message:
        `${count(lowConfidence.length, "row")} was read with low confidence. Check these ` +
        `against the original before saving.`,
      rows: lowConfidence,
    });
  }
  if (estimated.length) {
    issues.push({
      severity: "warning",
      code: "estimated",
      message:
        `${count(estimated.length, "rate")} was filled in for you rather than read from the ` +
        `document. Those are estimates until you confirm them.`,
      rows: estimated,
    });
  }

  return [
    ...issues.filter((i) => i.severity === "blocking"),
    ...issues.filter((i) => i.severity === "warning"),
  ];
}

/** Whether the grid may be saved at all. */
export function canSaveGrid(issues: GridIssue[]): boolean {
  return !issues.some((i) => i.severity === "blocking");
}

/** Every row index any issue points at, for highlighting. */
export function flaggedRows(issues: GridIssue[]): Set<number> {
  const out = new Set<number>();
  for (const i of issues) for (const r of i.rows) out.add(r);
  return out;
}

/** One sentence for the header: what a person is being asked to do. */
export function reviewSummary(rows: ReviewRow[], issues: GridIssue[]): string {
  const blocking = issues.filter((i) => i.severity === "blocking").length;
  const warnings = issues.length - blocking;
  if (rows.length === 0) return "Nothing to review yet.";
  if (blocking > 0) {
    return `${count(blocking, "problem")} must be fixed before this grid can be saved.`;
  }
  if (warnings > 0) {
    return `${count(warnings, "thing")} is worth a look. You can save either way — nothing extracted is used until you do.`;
  }
  return `${count(rows.length, "rate")} read cleanly. Check a few against the original, then save.`;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
