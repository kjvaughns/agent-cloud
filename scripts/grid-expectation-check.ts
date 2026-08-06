/**
 * Does the third opinion say anything useful, and does it stay quiet otherwise?
 *
 *   npm run check:grid-expectation
 *
 * The finding this exists for is the rate mismatch: `commission_grids.year_1_pct`
 * and `agent_commission_levels.assigned_pct` are two numbers that are supposed
 * to be the same number, and nothing in the codebase compares them. Every
 * schedule is built from the second; the first is displayed and never used.
 *
 * The rest of these assert restraint. "The carrier underpaid you" sends an
 * agency to argue with a carrier, so claiming it wrongly costs more than the
 * finding is worth.
 */

import {
  gridExpectation, asFraction, isActionable, rankFindings,
} from "../src/lib/grid-expectation";

let pass = 0;
const failures: string[] = [];
function check(name: string, got: any, want: any) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok    ${name}`); }
  else {
    failures.push(name);
    console.log(`  FAIL  ${name}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`);
  }
}

console.log("\n1. Percentages, stored both ways");

// assigned_pct is a fraction in some rows and a whole number in others —
// commission-calculator.ts carries the same coercion for the same reason.
check("0.9 is already a fraction", asFraction(0.9), 0.9);
check("90 is a percentage", asFraction(90), 0.9);
check("110% is a real override rate", asFraction(110), 1.1);
// 1.0 read as 1% would under-report, and under-reports are what stay hidden.
check("1 is 100%, not 1%", asFraction(1), 1);
check("null stays null", asFraction(null), null);
check("a negative rate is not a rate", asFraction(-5), null);

console.log("\n2. The finding nobody was checking");

// The grid says 90%. The agent is set to 75%. Every schedule this agent has is
// built at 75%, so every variance is measured from the wrong baseline.
const mismatch = gridExpectation({
  annualPremium: 1200, assignedPct: 0.75, gridYear1Pct: 90, scheduled: 900, paid: 900,
});
check("a rate mismatch is found", mismatch.finding, "rate_mismatch");
check("the contract expectation uses the grid rate, not the assigned one", mismatch.gridExpected, 1080);
check("and the gap is the real one", mismatch.gridVariance, -180);
check("the explanation names both rates",
  /90%/.test(mismatch.explanation) && /75%/.test(mismatch.explanation), true);

// It outranks the money comparison deliberately: with the baseline wrong, a
// per-line variance is arguing about the consequence.
check("a mismatch is reported even when the payment matches the schedule",
  gridExpectation({ annualPremium: 1200, assignedPct: 0.75, gridYear1Pct: 90, scheduled: 900, paid: 900 }).finding,
  "rate_mismatch");

// Both written the same way, in different units.
check("90 and 0.9 are the same rate",
  gridExpectation({ annualPremium: 1200, assignedPct: 0.9, gridYear1Pct: 90, scheduled: 1080, paid: 1080 }).finding,
  "ok");
check("a rounding difference is not a mismatch",
  gridExpectation({ annualPremium: 1200, assignedPct: 0.9, gridYear1Pct: 90.2, scheduled: 1080, paid: 1080 }).finding,
  "ok");

console.log("\n3. Policies with no schedule at all");

// commission-calculator returns early with no carrier, no effective date, or
// no assigned level. Those lines currently reconcile against null and read as
// "nothing to see".
const none = gridExpectation({ annualPremium: 1200, assignedPct: 0.9, gridYear1Pct: 90, scheduled: null, paid: 400 });
check("no schedule is its own finding", none.finding, "no_schedule");
check("and it says why that happens", /no carrier or no effective date/i.test(none.explanation), true);

console.log("\n4. Money, claimed conservatively");

const base = { annualPremium: 1200, assignedPct: 0.9, gridYear1Pct: 90, scheduled: 1080 };

check("paid in line with the contract", gridExpectation({ ...base, paid: 1080 }).finding, "ok");
// A statement line is one payment; the expectation is a year of them. A part
// payment must not read as an underpayment.
check("a partial payment is not an underpayment claim",
  gridExpectation({ ...base, paid: 1000 }).finding, "ok");
check("a real shortfall is claimed", gridExpectation({ ...base, paid: 600 }).finding, "underpaid");
check("with the arithmetic in the sentence",
  /\$1,080\.00/.test(gridExpectation({ ...base, paid: 600 }).explanation), true);

check("an overpayment is worth knowing", gridExpectation({ ...base, paid: 1500 }).finding, "overpaid");
check("because it usually comes back",
  /chargeback/i.test(gridExpectation({ ...base, paid: 1500 }).explanation), true);

console.log("\n5. Saying nothing when there is nothing to say");

check("no grid row for this level", gridExpectation({ ...base, gridYear1Pct: null, paid: 1080 }).finding, "no_grid");
check("no premium to apply a rate to",
  gridExpectation({ ...base, annualPremium: null, paid: 1080 }).finding, "no_grid");
// Without an assigned rate there is nothing to disagree with the grid about.
check("no assigned level is not a mismatch",
  gridExpectation({ ...base, assignedPct: null, paid: 1080 }).finding, "ok");
check("and with neither rate, nothing is claimed",
  gridExpectation({ annualPremium: 1200, assignedPct: null, gridYear1Pct: null, scheduled: 1080, paid: 1080 }).finding,
  "no_grid");

console.log("\n6. What deserves a task, and in what order");

check("a rate mismatch is actionable", isActionable("rate_mismatch"), true);
check("an underpayment is actionable", isActionable("underpaid"), true);
check("a missing schedule is actionable", isActionable("no_schedule"), true);
// An overpayment is worth showing and not worth chasing — the carrier reclaims
// it themselves, and a task to "ask the carrier for less money" is noise.
check("an overpayment is not a task", isActionable("overpaid"), false);
check("a missing grid row is not a task", isActionable("no_grid"), false);
check("nothing wrong is not a task", isActionable("ok"), false);

check("the systematic finding sorts first",
  rankFindings(["ok", "overpaid", "underpaid", "rate_mismatch"]),
  ["rate_mismatch", "underpaid", "overpaid", "ok"]);
check("duplicates collapse", rankFindings(["underpaid", "underpaid", "ok"]), ["underpaid", "ok"]);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
