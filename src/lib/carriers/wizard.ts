/**
 * Adding a carrier, as seven steps that can be left and come back to.
 *
 * ── Why a machine and not a form ──
 *
 * The brief asks for a guided flow that saves after every step. That rules out
 * one long form, and it also rules out a wizard that holds everything in
 * memory until a final submit — an owner who gets three steps in, goes to find
 * the carrier's contracting email and comes back must not start again.
 *
 * So each step names what it needs, whether it is satisfied, and whether it
 * may be skipped. Progress is derived from the saved record rather than from
 * anything this module remembers, which is what makes a reload harmless.
 *
 * ── The one place this disagrees with a naive reading ──
 *
 * Step 3, the grid, is optional. The brief says a carrier may be activated
 * without a complete product grid as long as every active position resolves
 * through a carrier level or the position percentage. An agency that has to
 * finish a forty-page grid before writing any business will not use the
 * product, so the grid step can be left and returned to, and `carrierState`
 * marks what is being traded away.
 */

import type { CarrierFacts } from "./status";

export const WIZARD_STEPS = [
  "carrier",
  "details",
  "grid",
  "levels",
  "advance",
  "method",
  "review",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export const STEP_TITLE: Record<WizardStep, string> = {
  carrier: "Choose a carrier",
  details: "Basic carrier settings",
  grid: "Add the compensation grid",
  levels: "Review carrier levels",
  advance: "Set advance options",
  method: "Set the contracting method",
  review: "Review and activate",
};

export const STEP_PURPOSE: Record<WizardStep, string> = {
  carrier: "Pick one from the library, or add your own.",
  details: "How your agency reaches this carrier.",
  grid: "Upload what they pay. You can do this later.",
  levels: "The contract levels this carrier offers.",
  advance: "The most this carrier advances, and your default.",
  method: "Where paperwork goes.",
  review: "What agents will see.",
};

/**
 * Steps an owner may pass without completing.
 *
 * Only the grid. Everything else is either identifying the carrier or a thing
 * `carrierState` will refuse activation without, and offering to skip a step
 * that blocks the end of the flow wastes somebody's time twice.
 */
export const OPTIONAL_STEPS: readonly WizardStep[] = ["grid"];

/** What has been saved so far. Assembled from the record, never remembered. */
export type WizardProgress = {
  /** A carrier has been chosen or created. */
  carrierChosen: boolean;
  /** Anything beyond the name — a website, an email, a product list. */
  detailsEntered: boolean;
  gridRowCount: number;
  levelCount: number;
  maxAdvance: string | null;
  hasContractingMethod: boolean;
  /** Whether the owner has already switched it on. */
  activated: boolean;
};

export type StepState = {
  id: WizardStep;
  title: string;
  purpose: string;
  status: "done" | "current" | "todo" | "optional";
  /** What is missing, in words. Empty when nothing is. */
  problems: string[];
};

function satisfied(step: WizardStep, p: WizardProgress): boolean {
  switch (step) {
    case "carrier": return p.carrierChosen;
    case "details": return p.detailsEntered;
    case "grid": return p.gridRowCount > 0;
    case "levels": return p.levelCount > 0;
    case "advance": return Boolean(p.maxAdvance);
    case "method": return p.hasContractingMethod;
    case "review": return p.activated;
  }
}

function problemsFor(step: WizardStep, p: WizardProgress): string[] {
  if (satisfied(step, p)) return [];
  switch (step) {
    case "carrier":
      return ["Choose a carrier from the library, or add one that is not listed."];
    case "details":
      return ["Add at least the website or contracting email, so staff know where to go."];
    case "grid":
      return [
        "No grid uploaded yet. You can activate without one — agents will be paid " +
        "their position percentage until you add it.",
      ];
    case "levels":
      return ["Add the contract levels this carrier offers. Positions get mapped to these."];
    case "advance":
      return ["Choose the most this carrier advances. Nothing is assumed on your behalf."];
    case "method":
      return ["Choose how paperwork reaches this carrier, or a request has nowhere to go."];
    case "review":
      return ["Not activated yet. Agents cannot select this carrier until you do."];
  }
}

/**
 * Every step, with the first unsatisfied one marked current.
 *
 * The grid reads `optional` rather than `todo` when it is the only thing left,
 * so an owner is not shown an outstanding task they were told they could skip.
 */
export function wizardState(p: WizardProgress): StepState[] {
  let currentTaken = false;
  return WIZARD_STEPS.map((id) => {
    const done = satisfied(id, p);
    const optional = OPTIONAL_STEPS.includes(id);
    let status: StepState["status"];
    if (done) {
      status = "done";
    } else if (!currentTaken && !optional) {
      status = "current";
      currentTaken = true;
    } else {
      status = optional ? "optional" : "todo";
    }
    return { id, title: STEP_TITLE[id], purpose: STEP_PURPOSE[id], problems: problemsFor(id, p), status };
  });
}

/** The step to open, or null when there is nothing left to do. */
export function nextStep(p: WizardProgress): WizardStep | null {
  return wizardState(p).find((s) => s.status === "current")?.id ?? null;
}

/** How far along, counting only the steps that must be done. */
export function wizardProgress(p: WizardProgress): { done: number; total: number; pct: number } {
  const required = WIZARD_STEPS.filter((s) => !OPTIONAL_STEPS.includes(s));
  const done = required.filter((s) => satisfied(s, p)).length;
  return { done, total: required.length, pct: Math.round((done / required.length) * 100) };
}

/**
 * May the owner reach this step yet?
 *
 * Forward only in the sense that matters: you cannot configure levels for a
 * carrier you have not chosen. Everything after the first two is reachable in
 * any order, because an owner who has the advance terms to hand and not the
 * grid should be able to enter them.
 */
export function canOpenStep(step: WizardStep, p: WizardProgress): boolean {
  if (step === "carrier") return true;
  return p.carrierChosen;
}

/**
 * The facts `carrierState` needs, from what the wizard has saved.
 *
 * The wizard does not decide whether a carrier may go live — `carrierState`
 * does, and the review step shows its answer. Two opinions on "is this ready"
 * is exactly what the status module exists to prevent.
 */
export function toCarrierFacts(
  p: WizardProgress,
  base: Pick<CarrierFacts, "orgCarrierId" | "carrierName" | "configuration" | "positionsOnFallback">,
): CarrierFacts {
  return {
    ...base,
    enabled: p.activated,
    archived: false,
    levelCount: p.levelCount,
    gridRowCount: p.gridRowCount,
    unreviewedGridRowCount: 0,
    maxAdvance: p.maxAdvance,
    hasContractingMethod: p.hasContractingMethod,
  };
}

/**
 * An agency default advance may not exceed what the carrier permits.
 *
 * Checked here rather than only in the form, because the same rule applies
 * when staff assign an advance to an individual agent — and an agent advanced
 * beyond what the carrier allows is a chargeback nobody budgeted for.
 */
const ADVANCE_ORDER = ["as_earned", "3_months", "6_months", "9_months", "12_months"] as const;

export function advanceWithinCarrierMax(
  chosen: string | null | undefined,
  carrierMax: string | null | undefined,
): boolean {
  if (!chosen) return true;
  if (!carrierMax) return false;
  const c = ADVANCE_ORDER.indexOf(chosen as (typeof ADVANCE_ORDER)[number]);
  const m = ADVANCE_ORDER.indexOf(carrierMax as (typeof ADVANCE_ORDER)[number]);
  if (c < 0 || m < 0) return false;
  return c <= m;
}

export function advanceRefusal(chosen: string, carrierMax: string | null): string {
  if (!carrierMax) {
    return "This carrier has no maximum advance set yet, so an advance cannot be assigned.";
  }
  return (
    `This carrier advances at most ${carrierMax.replace(/_/g, " ")}. ` +
    `${chosen.replace(/_/g, " ")} is more than they allow.`
  );
}

/** The advances an agency may offer, given the carrier's maximum. */
export function advanceOptionsUpTo(carrierMax: string | null | undefined): string[] {
  if (!carrierMax) return [];
  const m = ADVANCE_ORDER.indexOf(carrierMax as (typeof ADVANCE_ORDER)[number]);
  if (m < 0) return [];
  return ADVANCE_ORDER.slice(0, m + 1) as unknown as string[];
}
