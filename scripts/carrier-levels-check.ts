/**
 * "Match carrier levels" offers the carrier's actual level names.
 *
 *   npx tsx scripts/carrier-levels-check.ts
 *
 * The reported symptom: three carriers, and every dropdown showing nothing but
 * "Use position percentage" and "Enter it manually…". The names were not
 * missing from the database — they were on the uploaded comp grids, and the
 * dropdown was reading `carrier_comp_levels`, a table an owner fills in by hand
 * and therefore almost never has rows in.
 *
 * Two halves. The merge is a pure function, so the rules that matter — dedupe
 * across the two sources, a range instead of an invented number, what gets
 * stored when a level's rates vary — are asserted directly. The wiring half
 * proves the panel and the server actually go through it, because a correct
 * module nothing calls is exactly the state this was already in.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  carrierLevelOptions,
  contractPctFromName,
  levelLabel,
  levelOrigin,
  levelDistance,
  suggestLevel,
  mappingFor,
  findLevel,
} from "../src/lib/compensation/carrier-levels";
import { carrierState } from "../src/lib/carriers/status";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── The bug, stated as a test ───────────────────────────────────────────────

// A carrier exactly as the screenshot had it: a real comp grid, and nobody has
// ever opened the hand-entry screen.
const GRIDDED = {
  carrier_comp_levels: [],
  carrier_grid_levels: [
    { level_name: "Level 40", product_name: "Final Expense", year_1_pct: 100 },
    { level_name: "Level 40", product_name: "Term", year_1_pct: 85 },
    { level_name: "Level 55", product_name: "Final Expense", year_1_pct: 115 },
  ],
};

check("a carrier with only a comp grid still lists its levels",
  carrierLevelOptions(GRIDDED).map((o) => o.name), ["Level 55", "Level 40"]);
check("…highest first, the way a comp ladder reads",
  carrierLevelOptions(GRIDDED)[0].name, "Level 55");
check("…and a level whose rates vary shows the range, not one of them",
  levelLabel(carrierLevelOptions(GRIDDED)[1]), "Level 40 — pays 85–100%");
check("…naming where it came from, and the contract its name states",
  levelOrigin(carrierLevelOptions(GRIDDED)[1]), "the 40 contract · from the comp grid, 2 products");

// The hand-entered table is still authoritative where it has an opinion: it
// carries one deliberate percentage, and a grid row is an extraction.
const BOTH = {
  carrier_comp_levels: [
    { id: "a", level_name: "Level 40", commission_pct: 90, status: "active" },
    { id: "b", level_name: "Retired", commission_pct: 70, status: "inactive" },
  ],
  carrier_grid_levels: [
    { level_name: "level 40", product_name: "Final Expense", year_1_pct: 100 },
    { level_name: "Level 55", product_name: "Term", year_1_pct: 115 },
  ],
};
check("one level named in both places is listed once",
  carrierLevelOptions(BOTH).filter((o) => /level 40/i.test(o.name)).length, 1);
check("…keeping the casing the owner typed",
  carrierLevelOptions(BOTH).find((o) => /level 40/i.test(o.name))!.name, "Level 40");
check("…and the percentage they chose, not the grid's",
  carrierLevelOptions(BOTH).find((o) => /level 40/i.test(o.name))!.pct, 90);
check("…said plainly to be from both",
  carrierLevelOptions(BOTH).find((o) => /level 40/i.test(o.name))!.source, "both");
// A level the agency has retired is not an option: mapping a position onto it
// would put agents on terms that no longer exist.
check("an inactive carrier level is not offered",
  carrierLevelOptions(BOTH).some((o) => o.name === "Retired"), false);

// ── No invented number, anywhere ────────────────────────────────────────────

console.log("");

const varying = carrierLevelOptions(GRIDDED).find((o) => o.name === "Level 40")!;
check("a level whose rates vary by product has no single percentage",
  varying.pct, null);
// The whole point. `agency_level_carrier_mappings.carrier_pct` outranks the
// grid in the resolver, so storing 100 here would pay Term at 100 too.
check("…so saving it stores the name and no percentage",
  mappingFor(varying), { carrier_level_name: "Level 40", carrier_pct: null });
const flat = carrierLevelOptions(GRIDDED).find((o) => o.name === "Level 55")!;
check("a level that pays one rate everywhere does store it",
  mappingFor(flat), { carrier_level_name: "Level 55", carrier_pct: 115 });

// ── The contract a level's NAME states ──────────────────────────────────────
//
// A grid rate and a contract number are different things, and the difference
// decides which rung a position lands on. Final expense routinely pays above
// street, so a carrier's 50 contract can show 65–80% across its products.
// Matching an agency position on 50% against 65–80 puts it on the wrong rung,
// and every agent there is then paid from that mapping.
//
// Naming a column "RK1 (50)" says which contract it is. This reads that.

console.log("");

check("a parenthesised contract is read", contractPctFromName("RK1 (50)"), 50);
check("…with or without a space before it", contractPctFromName("RK1(75)"), 75);
check("…and with or without a percent inside", contractPctFromName("RK1 (50%)"), 50);
check("an explicit percent is read", contractPctFromName("55%"), 55);
check("a standalone number token is read", contractPctFromName("Level 50"), 50);
check("…including after a code", contractPctFromName("GA 80"), 80);
// The case that makes guessing dangerous, and the reason this declines rather
// than tries harder. RK10 is the tenth code in a series, not the 10 contract;
// reading it as 10 would map every position to the bottom rung on exactly the
// grids this was written for.
check("a number glued to letters is NOT a contract", contractPctFromName("RK10"), null);
check("…nor is one inside a product name", contractPctFromName("Trendsetter LB 10y"), null);
check("a name stating no number reads as none", contractPctFromName("SGA"), null);
check("…and nothing out of range is accepted", contractPctFromName("Plan 900"), null);

// ── Suggestion: contract number first, rates only when there is none ─────────

console.log("");

// Named columns with a contract in the name. This is the shape an owner gets
// after labelling their grid "RK1 (50)" — the rates say 65–80, the name says 50,
// and 50 is the number an agency position is comparable to.
const NAMED = {
  carrier_comp_levels: [],
  carrier_grid_levels: [
    { level_name: "RK1 (50)", product_name: "FE Express", year_1_pct: 65 },
    { level_name: "RK1 (50)", product_name: "Term", year_1_pct: 80 },
    { level_name: "RK12 (110)", product_name: "FE Express", year_1_pct: 120 },
  ],
};
const rk1 = carrierLevelOptions(NAMED).find((o) => o.name === "RK1 (50)")!;
check("a level carries the contract its name states", rk1.contractPct, 50);
check("…while its rates stay what the products pay",
  [rk1.minPct, rk1.maxPct], [65, 80]);
check("…and the label distinguishes the two",
  levelLabel(rk1), "RK1 (50) — pays 65–80%");
check("…saying which contract it is",
  /^the 50 contract · /.test(levelOrigin(rk1)), true);
// The whole reason the number is read. On rates alone, a 50% position is 15
// away from RK1 and 70 away from RK12 — it would still pick RK1 here, but a
// grid where the bottom column pays 100+ flips that. On contract numbers it is
// exact.
check("a 50% position matches the 50 contract exactly",
  levelDistance(rk1, 50), 0);
check("…and the suggestion picks it",
  suggestLevel(carrierLevelOptions(NAMED), 50)!.name, "RK1 (50)");
check("…while a 110% position picks the 110",
  suggestLevel(carrierLevelOptions(NAMED), 110)!.name, "RK12 (110)");
// Ordered by the same number the matching uses, so the list agrees with the
// suggestion under it.
check("the list is ordered by contract, highest first",
  carrierLevelOptions(NAMED).map((o) => o.name), ["RK12 (110)", "RK1 (50)"]);
// The contract number is NOT what gets stored. "RK1 (50)" names the contract;
// what the carrier settles on FE Express is 65%. Storing 50 underpays every
// deal that misses the grid, with a plausible number behind it.
check("saving it still stores the name and no flat percentage",
  mappingFor(rk1), { carrier_level_name: "RK1 (50)", carrier_pct: null });

// Rates are the fallback, for a grid whose columns state no contract.
const UNNAMED = {
  carrier_comp_levels: [],
  carrier_grid_levels: [
    { level_name: "Bronze", product_name: "Final Expense", year_1_pct: 100 },
    { level_name: "Bronze", product_name: "Term", year_1_pct: 85 },
    { level_name: "Gold", product_name: "Final Expense", year_1_pct: 115 },
  ],
};
const bronze = carrierLevelOptions(UNNAMED).find((o) => o.name === "Bronze")!;
check("with no contract in the name, the rates are compared", bronze.contractPct, null);
// A position at 90% sits inside Bronze's 85–100 band. It is that level, not
// "25 away from 115" and not "10 away from 85".
check("…and a percentage inside the range is a distance of zero",
  levelDistance(bronze, 90), 0);
check("…with the distance to the nearer edge outside it",
  levelDistance(bronze, 80), 5);
check("…so the suggestion picks the level it falls in",
  suggestLevel(carrierLevelOptions(UNNAMED), 90)!.name, "Bronze");
check("…and the nearest one when it falls in none",
  suggestLevel(carrierLevelOptions(UNNAMED), 130)!.name, "Gold");

// A grid whose percentages failed to extract still names its levels, and those
// names are worth offering. They just cannot be ranked.
const NAMES_ONLY = { carrier_comp_levels: [], carrier_grid_levels: [{ level_name: "SGA", product_name: "Term" }] };
check("a level with no percentage anywhere is still offered",
  carrierLevelOptions(NAMES_ONLY).map((o) => o.name), ["SGA"]);
check("…but is never suggested, because nothing compares",
  suggestLevel(carrierLevelOptions(NAMES_ONLY), 80), null);
check("a saved mapping finds its option regardless of casing",
  findLevel(carrierLevelOptions(BOTH), "LEVEL 40")?.name, "Level 40");
check("…and an empty carrier lists nothing rather than throwing",
  carrierLevelOptions({}), []);

// ── A gridded carrier counts its grid's levels ──────────────────────────────

console.log("");

const facts = {
  orgCarrierId: "oc", carrierName: "Transamerica", enabled: true, archived: false,
  gridRowCount: 3, unreviewedGridRowCount: 0, maxAdvance: "9_months",
  hasContractingMethod: true, configuration: { configured: true, reasons: [] },
  positionsOnFallback: [],
};
// A carrier whose grid names every level knows its levels, so it is not on the
// fallback and has nothing to say about them.
const gridded = carrierState({ ...facts, levelCount: carrierLevelOptions(GRIDDED).length });
check("a carrier whose grid names its levels has levels", gridded.usesFallback, false);
check("…and nothing to fix", gridded.problems, []);
// One with none from either source is still active — levels are a trade-off,
// not a gate — and says what it is trading away rather than blocking.
const bare = carrierState({ ...facts, levelCount: 0 });
check("one with no levels from either source is still active", bare.status, "active");
check("…but is on the fallback", bare.usesFallback, true);
check("…and is told the grid is a way to supply them",
  bare.problems.some((p) => /upload its comp grid/.test(p)), true);

// ── The panel and the server go through it ──────────────────────────────────

console.log("");

const PANEL = strip(read("src/components/contracting/levels-panel.tsx"));
check("the panel builds its dropdown from the merged options",
  /from "@\/lib\/compensation\/carrier-levels"/.test(PANEL), true);
// The regression this replaced: reading one table directly is what made the
// list empty, so no component may do it again.
check("…and no longer reads carrier_comp_levels on its own",
  /carrier\?\.carrier_comp_levels \?\? \[\]\)\s*$/m.test(PANEL) ||
  /\.filter\(\(l\) => l\.status === "active" \|\| !l\.status\)/.test(PANEL), false);
check("the dropdown renders the carrier's own level names",
  /levels\.map\(\(l\) => <SelectItem key=\{l\.id\} value=\{l\.id\}>\{levelLabel\(l\)\}/.test(PANEL), true);
check("choosing one goes through mappingFor, not a hand-built row",
  /const m = mappingFor\(o\)/.test(PANEL), true);
check("a carrier with no levels says so instead of showing an empty list",
  /No levels recorded for/.test(PANEL), true);

const FNS = strip(read("src/lib/contracting-ops.functions.ts"));
check("the server reads the grid's level names, not just its products",
  /\.select\("carrier_id, product_name, level_name, level_sort, year_1_pct"\)/.test(FNS), true);
check("…and ships the merged list with each carrier",
  /level_options: levelOptions/.test(FNS), true);
check("…computed by the shared module rather than a second merge",
  /carrierLevelOptions\(\{/.test(FNS) &&
  /from "@\/lib\/compensation\/carrier-levels"/.test(FNS), true);
// Two numbers for one thing is how somebody stops trusting the screen.
check("the Levels fact counts what the dropdown offers",
  /comp_level_count: levelOptions\.length/.test(FNS), true);
check("…and the carrier's status agrees with it",
  /levelCount: levelOptions\.length/.test(FNS), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
