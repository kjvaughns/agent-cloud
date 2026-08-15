/**
 * Nothing extracted from a photograph is published unreviewed.
 *
 *   npx tsx scripts/grid-review-check.ts
 *
 * ── The defect ──
 *
 * Uploading a comp grid produced a table of numbers and a Save button. The
 * failures extraction actually makes — a rate read as 8 instead of 80, an age
 * band whose upper bound was cut off, two bands both claiming age 70, a level
 * column with no heading — all look like perfectly ordinary numbers in that
 * table, and every one of them misprices deals silently and forever.
 *
 * ── Why blocking and warning are separate ──
 *
 * A rate of 145% is unusual and real. A band that runs backwards is not a
 * judgement call. Warnings must never stop a save, or an owner whose carrier
 * genuinely pays that ends up arguing with us; blocking must never be
 * overridable, or the review step is decoration.
 */

import {
  reviewGrid, canSaveGrid, flaggedRows, reviewSummary, LOW_CONFIDENCE,
  type ReviewRow,
} from "../src/lib/carriers/grid-review";

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const row = (o: Partial<ReviewRow> = {}): ReviewRow => ({
  product_name: "Final Expense",
  level_name: "Level 80",
  year_1_pct: 80,
  years_2_5_pct: 5,
  years_6_plus_pct: 3,
  age_group_min: 18,
  age_group_max: 85,
  ...o,
});

const codes = (rows: ReviewRow[]) => reviewGrid(rows).map((i) => i.code);

// ── A clean grid says nothing ────────────────────────────────────────────────
//
// A review screen that always finds something teaches an owner to click past
// it, which is exactly when the one that matters appears.

check("a clean row raises nothing", codes([row()]), []);
check("…and can be saved", canSaveGrid(reviewGrid([row()])), true);
check("…and the summary asks for a spot check",
  /read cleanly/.test(reviewSummary([row()], reviewGrid([row()]))), true);

// ── The blocking four ────────────────────────────────────────────────────────

check("a row with no product blocks", codes([row({ product_name: "  " })]), ["missing_product"]);
check("a row with no level blocks", codes([row({ level_name: "" })]), ["missing_level"]);
// Zero is the dangerous one: it looks like a number and pays nothing.
check("a zero rate blocks", codes([row({ year_1_pct: 0 })]), ["missing_rate"]);
check("a missing rate blocks", codes([row({ year_1_pct: null })]), ["missing_rate"]);
check("a band that runs backwards blocks",
  codes([row({ age_group_min: 70, age_group_max: 50 })]), ["band_backwards"]);
check("…and none of those can be saved past",
  canSaveGrid(reviewGrid([row({ year_1_pct: 0 })])), false);

// ── Overlapping bands ────────────────────────────────────────────────────────
//
// "50-70" and "70-85" both claim 70, which is the commonest extraction failure
// on a printed grid and gives one age two rates.

const overlap = [
  row({ age_group_min: 18, age_group_max: 70 }),
  row({ age_group_min: 70, age_group_max: 85 }),
];
check("two bands sharing an age block", codes(overlap), ["band_overlap"]);
check("…naming both bands",
  /18-70 and 70-85 overlap/.test(reviewGrid(overlap)[0].message), true);
// Adjacent is not overlapping. 18-69 then 70-85 is how a grid is meant to read.
check("adjacent bands are fine",
  codes([row({ age_group_min: 18, age_group_max: 69 }), row({ age_group_min: 70, age_group_max: 85 })]),
  []);
// A different product's bands are a different band set entirely.
check("bands on different products do not collide",
  codes([
    row({ product_name: "Final Expense", age_group_min: 18, age_group_max: 85 }),
    row({ product_name: "Term Life", age_group_min: 18, age_group_max: 85 }),
  ]),
  []);
check("…nor do bands on different levels",
  codes([
    row({ level_name: "Level 80", age_group_min: 18, age_group_max: 85 }),
    row({ level_name: "Level 90", age_group_min: 18, age_group_max: 85 }),
  ]),
  []);

// The same product and level twice with no ages at all: nothing decides which
// rate applies, which is worse than an overlap because it looks tidy.
check("a duplicate with no ages blocks",
  codes([
    row({ age_group_min: null, age_group_max: null }),
    row({ age_group_min: null, age_group_max: null, year_1_pct: 75 }),
  ]),
  ["band_overlap"]);

// ── Gaps ─────────────────────────────────────────────────────────────────────
//
// A warning, not a block: a gap is payable, it just falls back to the position
// percentage, and an owner is entitled to ship that.

const gap = [
  row({ age_group_min: 18, age_group_max: 50 }),
  row({ age_group_min: 60, age_group_max: 85 }),
];
check("a gap between bands warns", codes(gap), ["band_gap"]);
check("…naming the ages nobody covers",
  /ages 51-59/.test(reviewGrid(gap)[0].message), true);
check("…and does not stop the save", canSaveGrid(reviewGrid(gap)), true);
check("bands that stop short of the usual range warn",
  codes([row({ age_group_min: 40, age_group_max: 60 })]), ["band_gap"]);
check("an open-ended top band counts as covering the tail",
  codes([row({ age_group_min: 18, age_group_max: null })]), []);

// ── Suspicious numbers ───────────────────────────────────────────────────────

check("a rate read as 8 instead of 80 warns",
  codes([row({ year_1_pct: 0.8 })]), ["rate_out_of_range"]);
check("a rate above anything a carrier pays warns",
  codes([row({ year_1_pct: 800 })]), ["rate_out_of_range"]);
// 145 is real on some annuity and FE contracts, so the ceiling has to allow it.
check("a genuinely high but real rate is accepted",
  codes([row({ year_1_pct: 140 })]), []);
check("…and the warning suggests the likely cause",
  /decimal was misread/.test(reviewGrid([row({ year_1_pct: 0.8 })])[0].message), true);

// ── Low confidence and filled-in rates ───────────────────────────────────────

check("a low-confidence read warns",
  codes([row({ confidence: LOW_CONFIDENCE - 0.2 })]), ["low_confidence"]);
check("a confident read does not",
  codes([row({ confidence: 0.95 })]), []);
check("a rate filled in for you is marked as an estimate",
  codes([row({ is_estimated: true })]), ["estimated"]);

// ── Ordering and highlighting ────────────────────────────────────────────────
//
// Blocking first: the list is a to-do list, and the things that stop a save
// belong at the top of it.

const mixed = [row({ year_1_pct: 0 }), row({ product_name: "Term Life", year_1_pct: 0.9 })];
check("blocking issues come first",
  reviewGrid(mixed).map((i) => i.severity), ["blocking", "warning"]);
check("every flagged row is reachable for highlighting",
  [...flaggedRows(reviewGrid(mixed))].sort(), [0, 1]);
check("the summary counts what must be fixed",
  /1 problem must be fixed/.test(reviewSummary(mixed, reviewGrid(mixed))), true);
check("…and softens once nothing blocks",
  /You can save either way/.test(
    reviewSummary([row({ confidence: 0.2 })], reviewGrid([row({ confidence: 0.2 })]))), true);
check("an empty grid says so", reviewSummary([], []), "Nothing to review yet.");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
