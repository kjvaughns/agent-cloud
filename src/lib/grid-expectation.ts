/**
 * What the comp grid says the agent should have been paid.
 *
 * ── The thing nobody was checking ──────────────────────────────────────────
 *
 * There are two numbers in this system that are supposed to be the same
 * number, and nothing has ever compared them:
 *
 *   `commission_grids.year_1_pct`      — what the agency's grid says a level
 *                                        earns on this carrier's product
 *   `agent_commission_levels.assigned_pct` — what the agent is actually paid
 *
 * `commission-calculator.ts` builds every schedule from the second one:
 * `yr1Total = annualPremium * levelPct`, where `levelPct` is `assigned_pct`.
 * The grid's `year_1_pct` is displayed, edited, imported and used to decide
 * which levels an agent may *look* at — and never once consulted to compute
 * money.
 *
 * So an agency whose grid says a Foresters term at Level 90 pays 90%, with an
 * agent whose `assigned_pct` reads 0.75, generates every schedule at 75%,
 * reconciles every statement against 75%, and reports no variance at all. The
 * carrier pays what the contract says; the platform expected something else;
 * and because the platform is comparing its own expectation against the
 * carrier, the fifteen points go unnoticed on every policy that agent writes.
 *
 * That is not a stale-snapshot problem, which is what I expected to find. The
 * grid was never in the calculation.
 *
 * ── What this module is for ────────────────────────────────────────────────
 *
 * A third opinion on every reconciled line: what the *contract* says, next to
 * what the platform scheduled and what the carrier paid. Three numbers rather
 * than two, because with two you cannot tell which of them is wrong.
 *
 * Pure. Every lookup happens in the caller; this decides what the numbers mean.
 */

export type GridExpectationInput = {
  /** Annualised premium on the policy. */
  annualPremium: number | null;
  /** `agent_commission_levels.assigned_pct` — 0.75 or 75, both are seen. */
  assignedPct: number | null;
  /** `commission_grids.year_1_pct` for this agent's level. */
  gridYear1Pct: number | null;
  /** Sum of `commission_schedule` for the policy — what we told the agent. */
  scheduled: number | null;
  /** What the carrier's statement actually paid, signed. */
  paid: number;
};

export type GridFinding =
  /** The grid and the agent's assigned level disagree. Affects every policy. */
  | "rate_mismatch"
  /** No schedule was ever generated — the line reconciles against nothing. */
  | "no_schedule"
  /** Nothing to compare against: no grid row for this level, or no premium. */
  | "no_grid"
  /** The carrier paid materially less than the contract says. */
  | "underpaid"
  /** The carrier paid materially more. Worth knowing — it usually comes back. */
  | "overpaid"
  /** Everything agrees. */
  | "ok";

export type GridExpectation = {
  finding: GridFinding;
  /** Annual premium × the grid's rate, when both are known. */
  gridExpected: number | null;
  /** paid − gridExpected. */
  gridVariance: number | null;
  /** Both rates as fractions, for the explanation. */
  assignedPct: number | null;
  gridPct: number | null;
  /** One sentence, written for an agency principal rather than a log. */
  explanation: string;
};

/**
 * Percentages arrive both ways and always have.
 *
 * `assigned_pct` is stored as a fraction in some rows and as a whole number in
 * others — `commission-calculator.ts` carries the same `if (pct > 1) pct / 100`
 * line for the same reason. `commission_grids.year_1_pct` is a whole number by
 * convention (its Zod schema allows 0–300).
 *
 * The threshold is 1 rather than 1.5 or 2 because a real commission rate of
 * exactly 1.0 would be 100%, and reading that as 1% would be the more damaging
 * mistake of the two — it under-reports rather than over-reports, and an
 * under-report is what stays hidden.
 */
export function asFraction(pct: number | null | undefined): number | null {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null;
  if (pct < 0) return null;
  return pct > 1 ? pct / 100 : pct;
}

/** Rates this close are the same rate written differently. */
const RATE_EPSILON = 0.005;

/** Below this, a money difference is rounding, not a finding. */
const MONEY_EPSILON = 1;

/**
 * A payment can legitimately differ from the annual expectation by a lot,
 * because a statement line is one payment and the expectation is a year of
 * them. So "underpaid" is only claimed when the gap is large enough that no
 * split explains it — a fifth of the annual figure or more.
 *
 * This is deliberately conservative. A false "the carrier underpaid you" sends
 * an agency to argue with a carrier and be wrong, which costs more than the
 * finding is worth.
 */
const MATERIAL_SHARE = 0.2;

export function gridExpectation(input: GridExpectationInput): GridExpectation {
  const assigned = asFraction(input.assignedPct);
  const grid = asFraction(input.gridYear1Pct);
  const premium = input.annualPremium;

  const base = {
    assignedPct: assigned,
    gridPct: grid,
    gridExpected: null as number | null,
    gridVariance: null as number | null,
  };

  // The finding that outranks everything else, because it is systematic rather
  // than per-line: if these two disagree, every schedule for this agent on this
  // carrier is wrong, and the per-line variances are all measured from the
  // wrong baseline. Reported before any money comparison, since the money
  // comparison would otherwise be arguing about the consequence.
  if (assigned !== null && grid !== null && Math.abs(assigned - grid) > RATE_EPSILON) {
    const gridExpected = premium === null ? null : round2(premium * grid);
    return {
      ...base,
      gridExpected,
      gridVariance: gridExpected === null ? null : round2(input.paid - gridExpected),
      finding: "rate_mismatch",
      explanation:
        `The comp grid says this level earns ${pct(grid)}, but this agent is set to ${pct(assigned)}. ` +
        `Every schedule for this agent on this carrier is built at ${pct(assigned)}, so the variances ` +
        `below are measured against the wrong number.`,
    };
  }

  if (input.scheduled === null) {
    return {
      ...base,
      finding: "no_schedule",
      explanation:
        "No commission schedule was ever generated for this policy, so there is nothing to " +
        "reconcile against. That happens when the policy has no carrier or no effective date, " +
        "or when the agent had no assigned level when it was posted.",
    };
  }

  if (grid === null || premium === null) {
    return {
      ...base,
      finding: "no_grid",
      explanation: grid === null
        ? "No comp grid row for this agent's level on this carrier and product, so the contract rate is unknown."
        : "No annual premium on this policy, so the contract rate cannot be applied to anything.",
    };
  }

  const gridExpected = round2(premium * grid);
  const gridVariance = round2(input.paid - gridExpected);
  const material = Math.max(MONEY_EPSILON, Math.abs(gridExpected) * MATERIAL_SHARE);

  if (gridVariance < -material) {
    return {
      ...base, gridExpected, gridVariance,
      finding: "underpaid",
      explanation:
        `The contract rate of ${pct(grid)} on ${money(premium)} of annual premium comes to ` +
        `${money(gridExpected)}. This statement paid ${money(input.paid)}.`,
    };
  }

  if (gridVariance > material) {
    return {
      ...base, gridExpected, gridVariance,
      finding: "overpaid",
      explanation:
        `This paid ${money(input.paid)} against a contract expectation of ${money(gridExpected)}. ` +
        `Overpayments are usually recovered later as a chargeback, so it is worth knowing about now.`,
    };
  }

  return {
    ...base, gridExpected, gridVariance,
    finding: "ok",
    explanation: `Paid in line with the contract rate of ${pct(grid)}.`,
  };
}

/**
 * The findings worth acting on, most systematic first.
 *
 * A rate mismatch is one problem affecting many lines, so it is collapsed to
 * one entry per agent-and-carrier rather than repeated per line — an agency
 * principal needs to see "this agent's rate is wrong" once, not four hundred
 * times.
 */
export function rankFindings(findings: GridFinding[]): GridFinding[] {
  const order: GridFinding[] = ["rate_mismatch", "underpaid", "no_schedule", "overpaid", "no_grid", "ok"];
  return [...new Set(findings)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** Does this finding deserve a task? */
export function isActionable(f: GridFinding): boolean {
  return f === "rate_mismatch" || f === "underpaid" || f === "no_schedule";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(fraction: number): string {
  // Trailing zeros dropped, because "90%" and "90.00%" are the same statement
  // and the second reads like a computed number nobody chose.
  return `${Number((fraction * 100).toFixed(2))}%`;
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
