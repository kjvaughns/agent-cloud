/**
 * Adding a carrier can be left and come back to.
 *
 *   npx tsx scripts/carrier-wizard-check.ts
 *
 * ── The defect ──
 *
 * Carrier setup was a form. An owner three steps in who went to find the
 * carrier's contracting email came back to nothing, and the brief's seven
 * steps existed nowhere — so there was no way to tell an owner what was left,
 * and no way for them to do the parts they had answers for first.
 *
 * ── The one that carries the most weight ──
 *
 * The advance ceiling. An agent advanced beyond what the carrier permits is a
 * chargeback nobody budgeted for, and the same rule has to hold in two places:
 * the agency default on the carrier, and the per-agent assignment. Tested as a
 * function rather than as form validation for exactly that reason.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  WIZARD_STEPS, STEP_TITLE, OPTIONAL_STEPS,
  wizardState, nextStep, wizardProgress, canOpenStep, toCarrierFacts,
  advanceWithinCarrierMax, advanceRefusal, advanceOptionsUpTo,
  type WizardProgress,
} from "../src/lib/carriers/wizard";
import { carrierState } from "../src/lib/carriers/status";

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

// ── The seven, in the brief's order ─────────────────────────────────────────

check("the seven the brief names", [...WIZARD_STEPS], [
  "carrier", "details", "grid", "levels", "advance", "method", "review",
]);
check("each has a title", WIZARD_STEPS.every((s) => STEP_TITLE[s].length > 5), true);
// Only the grid may be skipped; offering to skip a step that blocks the end of
// the flow wastes somebody's time twice.
check("only the grid is optional", [...OPTIONAL_STEPS], ["grid"]);

const blank: WizardProgress = {
  carrierChosen: false, detailsEntered: false, gridRowCount: 0,
  levelCount: 0, maxAdvance: null, hasContractingMethod: false, activated: false,
};
const done: WizardProgress = {
  carrierChosen: true, detailsEntered: true, gridRowCount: 12,
  levelCount: 4, maxAdvance: "9_months", hasContractingMethod: true, activated: true,
};

// ── Starting, and coming back ───────────────────────────────────────────────

check("a new carrier starts at the first step", nextStep(blank), "carrier");
check("…and shows none of seven done", wizardProgress(blank).done, 0);
// Six required, not seven: the grid does not count against progress an owner
// was told they could skip.
check("…of six required", wizardProgress(blank).total, 6);

check("a finished carrier has nothing left", nextStep(done), null);
check("…and reads as complete", wizardProgress(done).pct, 100);

// The case the machine exists for: an owner who left and came back.
const partway: WizardProgress = { ...blank, carrierChosen: true, detailsEntered: true };
check("coming back lands on the first unfinished step", nextStep(partway), "levels");
check("…with the finished ones marked done",
  wizardState(partway).filter((s) => s.status === "done").map((s) => s.id),
  ["carrier", "details"]);
// The grid is skipped over rather than blocking, which is what "optional"
// has to mean to be worth anything.
check("…and the grid does not block the way past it",
  wizardState(partway).find((s) => s.id === "grid")?.status, "optional");

// ── The grid is genuinely optional ──────────────────────────────────────────

const noGrid: WizardProgress = { ...done, gridRowCount: 0, activated: false };
check("a carrier with no grid still reaches review", nextStep(noGrid), "review");
// Five of six: the missing grid costs nothing, and the one step outstanding is
// activation itself. Progress reaching 100 before anybody switched the carrier
// on would tell an owner they were finished when agents still cannot see it.
check("…with only activation outstanding", wizardProgress(noGrid).done, 5);
check("…and reaches 100 when it is switched on",
  wizardProgress({ ...noGrid, activated: true }).pct, 100);
check("…while still saying what is traded away",
  /paid their position percentage/.test(
    wizardState(noGrid).find((s) => s.id === "grid")?.problems[0] ?? ""), true);

// ── Nothing is assumed ──────────────────────────────────────────────────────

check("a missing advance says nothing is assumed",
  /Nothing is assumed on your behalf/.test(
    wizardState({ ...done, maxAdvance: null }).find((s) => s.id === "advance")?.problems[0] ?? ""), true);
check("a missing method says a request would have nowhere to go",
  /nowhere to go/.test(
    wizardState({ ...done, hasContractingMethod: false }).find((s) => s.id === "method")?.problems[0] ?? ""), true);
check("an unactivated carrier says agents cannot select it",
  /cannot select this carrier/.test(
    wizardState({ ...done, activated: false }).find((s) => s.id === "review")?.problems[0] ?? ""), true);

// ── Reachability ────────────────────────────────────────────────────────────

check("the first step is always open", canOpenStep("carrier", blank), true);
// You cannot configure levels for a carrier you have not chosen.
check("nothing else is, before a carrier is chosen", canOpenStep("levels", blank), false);
// …but after that, any order. An owner with the advance terms to hand and not
// the grid should be able to enter them.
check("after that they are reachable in any order",
  WIZARD_STEPS.every((s) => canOpenStep(s, partway)), true);

// ── The wizard does not get its own opinion on readiness ────────────────────
//
// Two answers to "is this carrier ready" is exactly what the status module
// exists to prevent, so the review step asks it rather than deciding.

const facts = toCarrierFacts(noGrid, {
  orgCarrierId: "oc1", carrierName: "Transamerica",
  configuration: { configured: true, reasons: [] },
  positionsOnFallback: ["Training Agent"],
});
check("review hands its facts to the status module",
  carrierState(facts).canActivate, true);
check("…which is the one that flags the fallback",
  carrierState(facts).usesFallback, true);
check("an activated carrier reads as active there",
  carrierState(toCarrierFacts(done, {
    orgCarrierId: "oc1", carrierName: "T",
    configuration: { configured: true, reasons: [] }, positionsOnFallback: [],
  })).status, "active");

// ── The advance ceiling ─────────────────────────────────────────────────────
//
// An agent advanced beyond what the carrier permits is a chargeback nobody
// budgeted for. The same rule holds for the agency default and for a
// per-agent assignment, which is why it is a function and not form validation.

check("the carrier maximum itself is allowed",
  advanceWithinCarrierMax("9_months", "9_months"), true);
check("less than the maximum is allowed",
  advanceWithinCarrierMax("6_months", "9_months"), true);
check("as earned is always allowed",
  advanceWithinCarrierMax("as_earned", "3_months"), true);
check("more than the maximum is refused",
  advanceWithinCarrierMax("12_months", "9_months"), false);
// A carrier with no maximum cannot have anything assigned against it, rather
// than defaulting to permissive.
check("no carrier maximum refuses any advance",
  advanceWithinCarrierMax("6_months", null), false);
check("…but choosing nothing is not an error",
  advanceWithinCarrierMax(null, null), true);
check("a value outside the vocabulary is refused",
  advanceWithinCarrierMax("18_months", "12_months"), false);

check("the refusal names both numbers",
  /at most 9 months.*12 months is more than they allow/s.test(
    advanceRefusal("12_months", "9_months")), true);
check("…and says so plainly when there is no maximum",
  /no maximum advance set yet/.test(advanceRefusal("6_months", null)), true);

check("the options offered stop at the carrier maximum",
  advanceOptionsUpTo("6_months"), ["as_earned", "3_months", "6_months"]);
check("…and are empty when no maximum is set",
  advanceOptionsUpTo(null), []);

// ── The brief's own example ─────────────────────────────────────────────────
//
// Carrier maximum 9 months, agency default 6, and three agents on 6, 9 and as
// earned. All four must be permitted by the same rule.

const MAX = "9_months";
check("the brief's example holds",
  ["6_months", "6_months", "9_months", "as_earned"].map((a) => advanceWithinCarrierMax(a, MAX)),
  [true, true, true, true]);

// ── The step list is not retyped in the UI ──────────────────────────────────

const WIZ = readFileSync(join(process.cwd(), "src/lib/carriers/wizard.ts"), "utf8");
check("the wizard defers readiness to the status module",
  /from "\.\/status"/.test(WIZ), true);
check("…and does not define its own carrier statuses",
  /ready_to_activate|needs_levels/.test(WIZ), false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
