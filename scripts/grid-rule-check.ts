/**
 * The most specific grid row wins, and says why.
 *
 *   npx tsx scripts/grid-rule-check.ts
 *
 * ── The defect ──
 *
 * `commission_grids` has carried `product_name`, `age_group_min/max`,
 * `year_1_pct`, `years_2_5_pct`, `years_6_plus_pct` and `level_name` since the
 * first schema in this repository. Nothing ever selected from it.
 *
 * So a carrier paying 100% on Final Expense at 55 and 60% at 82 was told to
 * the product as one number — the agent's level percentage — and the age bands
 * an owner had uploaded were stored and ignored. An 82 year old's deal paid
 * the 55 year old's rate.
 *
 * ── Why the tie-breaks are tested and not just the matches ──
 *
 * Picking "the first row" and picking "the highest rate" are both wrong, in
 * opposite directions, on the same grid. A carrier that publishes a national
 * rate and a Florida exception means Florida for Florida — that is not a
 * preference, and it is the case a naive implementation gets backwards.
 */

import {
  selectGridRule, productsFor, bandsFor, bandProblems, pctForYear, ageOn,
  type GridRow,
} from "../src/lib/compensation/grid-rule";
import { resolveCompensation, type ResolveInput } from "../src/lib/compensation/resolve";

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const row = (over: Partial<GridRow> & { id: string }): GridRow => ({
  levelName: null, productName: "Final Expense",
  ageMin: null, ageMax: null,
  year1Pct: 100, years2to5Pct: 10, years6PlusPct: 5,
  stateCode: null, riskClass: null,
  ...over,
});

// The brief's own example, three bands on one product.
const FE = [
  row({ id: "a", ageMin: 18, ageMax: 70, year1Pct: 100 }),
  row({ id: "b", ageMin: 71, ageMax: 80, year1Pct: 80 }),
  row({ id: "c", ageMin: 81, ageMax: 85, year1Pct: 60 }),
];

const q = (over: Partial<Parameters<typeof selectGridRule>[1]> = {}) => ({
  levelName: null as string | null, productName: "Final Expense",
  age: 55, policyYear: 1, state: null as string | null, riskClass: null as string | null,
  ...over,
});

// ── The age bands are not flattened ─────────────────────────────────────────

check("a 55 year old gets the first band", selectGridRule(FE, q())?.pct, 100);
check("a 75 year old gets the second", selectGridRule(FE, q({ age: 75 }))?.pct, 80);
check("an 82 year old gets the third", selectGridRule(FE, q({ age: 82 }))?.pct, 60);
// Boundaries are inclusive on both ends, which is how carriers publish them.
check("the lower boundary is inside the band", selectGridRule(FE, q({ age: 71 }))?.pct, 80);
check("the upper boundary is too", selectGridRule(FE, q({ age: 80 }))?.pct, 80);
// Above every band is not "the nearest band" — it is nothing, and the caller
// falls back. Silently paying the 81–85 rate at 91 would be inventing one.
check("an age above every band matches nothing", selectGridRule(FE, q({ age: 91 })), null);
check("…and below every band too", selectGridRule(FE, q({ age: 12 })), null);

// An unknown age cannot be placed in a bounded band. This is what makes Post a
// Deal ask for the age rather than quietly using the widest row.
check("an unknown age does not match a bounded band", selectGridRule(FE, q({ age: null })), null);
// …but a grid with no bands at all still works, which is most agencies.
check("…while an unbounded grid still resolves without one",
  selectGridRule([row({ id: "x" })], q({ age: null }))?.pct, 100);

// ── Renewal years are columns, not a formula ────────────────────────────────

check("year 1 uses the year 1 column", selectGridRule(FE, q())?.pct, 100);
check("year 3 uses the 2–5 column", selectGridRule(FE, q({ policyYear: 3 }))?.pct, 10);
check("year 5 is still 2–5", selectGridRule(FE, q({ policyYear: 5 }))?.pct, 10);
check("year 6 moves to 6+", selectGridRule(FE, q({ policyYear: 6 }))?.pct, 5);
check("year 20 is still 6+", selectGridRule(FE, q({ policyYear: 20 }))?.pct, 5);
// A grid with renewals left blank must fall back, not pay year one forever.
check("a blank renewal column matches nothing rather than paying year 1",
  selectGridRule([row({ id: "n", years2to5Pct: null })], q({ policyYear: 3 })), null);
check("pctForYear picks the same column directly",
  [pctForYear(FE[0], 1), pctForYear(FE[0], 4), pctForYear(FE[0], 9)], [100, 10, 5]);

// ── Most specific wins ──────────────────────────────────────────────────────

// A carrier publishing a national rate and a Florida exception means Florida
// for Florida. "First match" and "highest rate" are both wrong here.
const withState = [...FE, row({ id: "fl", ageMin: 18, ageMax: 70, stateCode: "FL", year1Pct: 90 })];
check("a state exception beats the national row",
  selectGridRule(withState, q({ state: "FL" }))?.pct, 90);
check("…and does not apply outside that state",
  selectGridRule(withState, q({ state: "TX" }))?.pct, 100);
check("…nor when no state was given",
  selectGridRule(withState, q({ state: null }))?.pct, 100);
check("…case-insensitively", selectGridRule(withState, q({ state: "fl" }))?.pct, 90);

const withRisk = [...FE, row({ id: "tob", ageMin: 18, ageMax: 70, riskClass: "tobacco", year1Pct: 70 })];
check("a risk class row beats the general one",
  selectGridRule(withRisk, q({ riskClass: "tobacco" }))?.pct, 70);
check("…and a non-tobacco deal keeps the general row",
  selectGridRule(withRisk, q({ riskClass: "non_tobacco" }))?.pct, 100);

// State outranks risk: a state exception is a deliberate override of the whole
// schedule, while risk splits a rate that already applies.
const both = [
  row({ id: "g", ageMin: 18, ageMax: 70, year1Pct: 100 }),
  row({ id: "r", ageMin: 18, ageMax: 70, riskClass: "tobacco", year1Pct: 70 }),
  row({ id: "s", ageMin: 18, ageMax: 70, stateCode: "FL", year1Pct: 90 }),
];
check("state outranks risk when both could apply",
  selectGridRule(both, q({ state: "FL", riskClass: "tobacco" }))?.pct, 90);

// A row tied to a carrier level only applies to that level; an untied row
// applies to any, which is how single-level grids are written.
const levelled = [
  row({ id: "any", year1Pct: 50 }),
  row({ id: "l40", levelName: "Level 40", year1Pct: 40 }),
];
check("a level row applies to its level",
  selectGridRule(levelled, q({ levelName: "Level 40", age: null }))?.pct, 40);
check("…and not to a different one",
  selectGridRule(levelled, q({ levelName: "Level 80", age: null }))?.pct, 50);
check("…while an untied row still covers an agent with no level",
  selectGridRule(levelled, q({ levelName: null, age: null }))?.pct, 50);

// A narrower band was written more deliberately than a wider one.
const overlapping = [
  row({ id: "wide", ageMin: 18, ageMax: 85, year1Pct: 70 }),
  row({ id: "narrow", ageMin: 71, ageMax: 80, year1Pct: 80 }),
];
check("the narrower band wins a tie", selectGridRule(overlapping, q({ age: 75 }))?.pct, 80);
check("…and the wide one still covers ages the narrow one misses",
  selectGridRule(overlapping, q({ age: 30 }))?.pct, 70);

// ── It says why ─────────────────────────────────────────────────────────────

check("the match explains itself",
  selectGridRule(FE, q({ age: 75 }))?.because, "Final Expense, ages 71–80 — year 1");
check("…naming the state when one applied",
  selectGridRule(withState, q({ state: "FL" }))?.because, "Final Expense, ages 18–70, FL — year 1");
check("…and the renewal window",
  selectGridRule(FE, q({ age: 75, policyYear: 4 }))?.because, "Final Expense, ages 71–80 — years 2–5");

// ── Products an agent may pick ──────────────────────────────────────────────

const mixed = [
  row({ id: "1", productName: "Final Expense" }),
  row({ id: "2", productName: "Term Life" }),
  row({ id: "3", productName: "final expense" }),
  row({ id: "4", productName: "Whole Life", levelName: "Level 40" }),
];
// Case duplicates are one product, not two rows in a dropdown.
check("products are listed once each",
  productsFor(mixed, null), ["Final Expense", "Term Life"]);
check("…and a level sees its own too",
  productsFor(mixed, "Level 40"), ["Final Expense", "Term Life", "Whole Life"]);

// ── Bands, gaps and overlaps for the review screen ──────────────────────────

check("the bands come back in order",
  bandsFor(FE, "Final Expense"), [{ min: 18, max: 70 }, { min: 71, max: 80 }, { min: 81, max: 85 }]);
check("a complete ladder has no problems", bandProblems(FE, "Final Expense"), []);

const gapped = [
  row({ id: "a", ageMin: 18, ageMax: 70 }),
  row({ id: "c", ageMin: 81, ageMax: 85 }),
];
check("a gap is reported with the ages it leaves uncovered",
  /nothing covers ages 71–80/.test(bandProblems(gapped, "Final Expense")[0] ?? ""), true);
check("…and says what happens there",
  /falls back to the level percentage/.test(bandProblems(gapped, "Final Expense")[0] ?? ""), true);
check("an overlap is reported too",
  /ages 71–75 are covered by two rows/.test(
    bandProblems([row({ id: "a", ageMin: 18, ageMax: 75 }), row({ id: "b", ageMin: 71, ageMax: 80 })],
      "Final Expense")[0] ?? ""), true);

// ── Age is taken on the effective date, not today ───────────────────────────
//
// A policy written in December for somebody whose birthday is in November is
// rated at the age they were when it was written. Using today's age would move
// a deal into a different band months after it was posted.

check("age on the effective date", ageOn("1950-06-15", "2026-08-15"), 76);
check("…before the birthday that year", ageOn("1950-12-15", "2026-08-15"), 75);
check("…on the birthday itself", ageOn("1950-08-15", "2026-08-15"), 76);
check("…the day before", ageOn("1950-08-16", "2026-08-15"), 75);
check("a nonsense date is null, not a number", ageOn("not-a-date", "2026-08-15"), null);
check("an effective date before birth is null", ageOn("2030-01-01", "2026-08-15"), null);

// ── The resolver actually uses it ───────────────────────────────────────────
//
// A selector nothing calls prices no deals. These go through
// `resolveCompensation` rather than the selector directly, so the layering is
// what is tested and not just the arithmetic.

console.log("");

const base: ResolveInput = {
  agentId: "ag1",
  orgCarrierId: "oc1",
  level: { id: "l1", name: "Training Agent", base_pct: 50, sort_order: 1, can_invite: false, active: true },
  mapping: {
    agency_level_id: "l1", org_carrier_id: "oc1",
    carrier_pct: 40, advance_option: null, carrier_level_name: "Level 40",
  },
  contract: null,
  carrier: {
    org_carrier_id: "oc1", enabled: true, visible_to_agents: true,
    requestable_by_agents: true, available_for_post_deal: true,
    default_advance_option: "9_months",
  },
};

// Every existing caller passes no grid and no deal, and must be unaffected.
const noGrid = resolveCompensation(base);
check("without a grid the mapping still answers", noGrid.ok && noGrid.pct, 40);
check("…and reports no grid rule", noGrid.ok && noGrid.gridRule, null);

// The brief's example: the agency position is 50%, the carrier mapping is 40%,
// and the published grid says this product at this age pays 80%.
const LEVEL40 = [
  row({ id: "g1", levelName: "Level 40", ageMin: 18, ageMax: 70, year1Pct: 100 }),
  row({ id: "g2", levelName: "Level 40", ageMin: 71, ageMax: 80, year1Pct: 80 }),
];
const priced = resolveCompensation({
  ...base, grid: LEVEL40,
  deal: { productName: "Final Expense", age: 75, policyYear: 1 },
});
check("a matching grid row outranks the carrier mapping", priced.ok && priced.pct, 80);
check("…and says so", priced.ok && priced.pctSource, "grid");
// The carrier level is part of the explanation when the row is tied to one:
// an owner reconciling against a statement needs to know which contract level
// the rate came from, not just which age band.
check("…naming the row and the level it belongs to",
  priced.ok && priced.gridRule, "Final Expense, ages 71–80, Level 40 — year 1");

// No match is normal, not a failure. Most agencies have no grid at all.
const unmatched = resolveCompensation({
  ...base, grid: LEVEL40,
  deal: { productName: "Term Life", age: 75, policyYear: 1 },
});
check("a product the grid does not cover falls back to the mapping",
  unmatched.ok && unmatched.pct, 40);
check("…without claiming a grid rule", unmatched.ok && unmatched.gridRule, null);
check("…and is still a success, not an error", unmatched.ok, true);

// The grid is keyed on the CARRIER's level name. Matching on the agency's
// label — "Training Agent" — would find nothing, which is the mistake that
// makes a whole grid silently do nothing.
const wrongKey = resolveCompensation({
  ...base,
  mapping: { ...base.mapping!, carrier_level_name: "Training Agent" },
  grid: LEVEL40,
  deal: { productName: "Final Expense", age: 75, policyYear: 1 },
});
check("a mismatched carrier level name does not pick up the grid",
  wrongKey.ok && wrongKey.pctSource, "level_carrier");

// An age the grid does not reach must not be priced from the nearest band.
const tooOld = resolveCompensation({
  ...base, grid: LEVEL40,
  deal: { productName: "Final Expense", age: 91, policyYear: 1 },
});
check("an age past every band falls back rather than using the nearest",
  tooOld.ok && tooOld.pct, 40);

// A carrier that cannot resolve at all is still an error, grid or no grid.
const broken = resolveCompensation({
  ...base, level: null, mapping: null, grid: LEVEL40,
  deal: { productName: "Final Expense", age: 75, policyYear: 1 },
});
check("a grid does not paper over an unplaced agent", broken.ok, false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
