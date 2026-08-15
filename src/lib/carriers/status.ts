/**
 * What state a carrier is in, and what is stopping it going live.
 *
 * ── Why this is a module and not a badge in a component ──
 *
 * Four screens need the same answer and were each about to compute it: the
 * Carriers tab, the last step of Add Carrier, the activation toggle, and the
 * setup progress at the top of Agency Settings. Four opinions on "is this
 * carrier ready" is how a product ends up telling an owner it is ready on one
 * screen and not on another.
 *
 * ── Why the reasons come from the resolver ──
 *
 * `carrierConfiguration` in `@/lib/compensation/resolve` already decides
 * whether a carrier can pay, and Post a Deal already shows an agent its
 * sentences. This module orders those into a lifecycle; it does not
 * re-diagnose. A setup screen that disagreed with the deal screen about
 * whether a carrier works would be worse than no setup screen.
 *
 * ── The one judgement call in here ──
 *
 * A carrier may be activated without a complete product grid, so long as every
 * active position can resolve *something* — through a confirmed carrier level
 * or through the position's own percentage. That is deliberate and comes from
 * the brief: an agency that has to finish a 40-page grid before writing any
 * business will simply not use the product. `usesFallback` marks it so the
 * owner is told what they are trading away rather than discovering it later.
 */

/** The lifecycle, in the order an owner walks it. */
export const CARRIER_STATUSES = [
  "draft",
  "needs_grid_review",
  "needs_advance",
  "needs_contracting_method",
  "ready_to_activate",
  "active",
  "inactive",
  "archived",
] as const;

export type CarrierStatus = (typeof CARRIER_STATUSES)[number];

export const STATUS_LABEL: Record<CarrierStatus, string> = {
  draft: "Draft",
  needs_grid_review: "Needs grid review",
  needs_advance: "Needs advance",
  needs_contracting_method: "Needs contracting method",
  ready_to_activate: "Ready to activate",
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
};

/**
 * Everything the status depends on. Deliberately flat and plain: the caller
 * assembles it from whatever tables it already reads, and this module never
 * queries.
 */
export type CarrierFacts = {
  orgCarrierId: string;
  carrierName: string;
  /** The owner's on/off switch. Not the same as "ready". */
  enabled: boolean;
  archived: boolean;
  /**
   * How many levels this carrier is known to have, by name.
   *
   * Counted from either source: an active row in `carrier_comp_levels`, or a
   * level named on the uploaded comp grid. A grid is keyed by the carrier's own
   * level vocabulary, so an agency that has uploaded one has already said what
   * the levels are — requiring them to be retyped into a second table before
   * the carrier may be activated asks for the same fact twice.
   */
  levelCount: number;
  /** Grid rows — product/age-band rates. Zero is allowed; see `usesFallback`. */
  gridRowCount: number;
  /** Rows the extraction flagged and nobody has confirmed yet. */
  unreviewedGridRowCount: number;
  /** The highest advance this carrier permits, or null if never chosen. */
  maxAdvance: string | null;
  /** At least one contracting method configured. */
  hasContractingMethod: boolean;
  /** The resolver's verdict, passed through rather than recomputed. */
  configuration: { configured: boolean; reasons: string[] };
  /** Active agency positions that resolve only via their own percentage. */
  positionsOnFallback: string[];
};

export type CarrierState = {
  status: CarrierStatus;
  label: string;
  /** Plain sentences. Empty when nothing is wrong. */
  problems: string[];
  /** Whether the owner may flip the switch on right now. */
  canActivate: boolean;
  /** True when compensation resolves, but only through position percentages. */
  usesFallback: boolean;
};

/**
 * A carrier that has never been configured at all.
 *
 * Kept distinct from the named blocking steps because "you have not started"
 * and "you started and stopped" want different words, and an owner scanning a
 * list needs to tell a placeholder from a job half done.
 */
function isUntouched(f: CarrierFacts): boolean {
  return (
    f.levelCount === 0 &&
    f.gridRowCount === 0 &&
    !f.maxAdvance &&
    !f.hasContractingMethod
  );
}

/**
 * The blocking steps, in the order the wizard asks for them.
 *
 * Order matters: an owner told to choose an advance before defining a single
 * carrier level is being sent to a screen with nothing on it.
 */
function firstBlocker(f: CarrierFacts): { status: CarrierStatus; problem: string } | null {
  // Carrier levels are NOT a blocker, and used to be the first one.
  //
  // This module's own header says a carrier may go live so long as every active
  // position can resolve something, through a carrier level or through the
  // position's own percentage — and then the first thing it did was refuse to
  // activate a carrier with no levels, while the resolver was perfectly happy
  // paying everybody their position percentage. So an owner was told a carrier
  // "needs levels" when nothing was broken, no screen said what would change if
  // they added them, and there was no way past it.
  //
  // What levels actually buy is product and age specific rates. That is a
  // trade-off, not a fault, and `usesFallback` already exists to state it in the
  // one place a trade-off belongs. A missing level that genuinely stops somebody
  // being paid is a different thing, and `configuration` already catches it —
  // reported in the resolver's own words rather than as a step name.
  if (f.unreviewedGridRowCount > 0) {
    return {
      status: "needs_grid_review",
      problem:
        `${f.unreviewedGridRowCount} extracted rate${f.unreviewedGridRowCount === 1 ? "" : "s"} ` +
        `on ${f.carrierName} ${f.unreviewedGridRowCount === 1 ? "has" : "have"} not been ` +
        `confirmed. Nothing extracted is used until you review it.`,
    };
  }
  if (!f.maxAdvance) {
    return {
      status: "needs_advance",
      problem:
        `No advance option is chosen for ${f.carrierName}. Nothing is assumed on your ` +
        `behalf, so a deal posted here cannot say what it will pay.`,
    };
  }
  if (!f.hasContractingMethod) {
    return {
      status: "needs_contracting_method",
      problem:
        `${f.carrierName} has no contracting method, so a request has nowhere to go. ` +
        `Choose how paperwork reaches this carrier.`,
    };
  }
  return null;
}

/**
 * Where a carrier stands, and what to say about it.
 *
 * `archived` and `inactive` are checked first because they are states an owner
 * chose. Telling somebody their archived carrier "needs levels" would be
 * answering a question they did not ask.
 */
export function carrierState(f: CarrierFacts): CarrierState {
  // A carrier with no levels at all is on the fallback for everybody, whether
  // or not any position happens to have a mapping row — there is nothing to map
  // to. Folding it in here rather than leaving it as a blocker is the whole
  // point: it is a trade-off the owner should see, stated once, on a carrier
  // that works.
  const noLevels = f.levelCount === 0;
  const usesFallback = noLevels || f.positionsOnFallback.length > 0;

  const fallbackNote = !usesFallback
    ? []
    : noLevels
      ? [
          `No contract levels are recorded for ${f.carrierName}, so every position ` +
            `pays its own percentage here. Add the levels this carrier offers, or ` +
            `upload its comp grid — either names them — to pay product and age ` +
            `specific rates instead.`,
        ]
      : [
          `Compensation for ${f.positionsOnFallback.join(", ")} falls back to the ` +
            `position percentage on this carrier. Product and age specific rates will ` +
            `not apply until a carrier level is mapped.`,
        ];

  if (f.archived) {
    return {
      status: "archived",
      label: STATUS_LABEL.archived,
      problems: [],
      canActivate: false,
      usesFallback,
    };
  }

  const blocker = firstBlocker(f);

  // The resolver's own sentences, never restated in this module's words — minus
  // the one that says the carrier is switched off. Being off is what the switch
  // itself expresses, not a setup fault: counting it as one made switching a
  // carrier off unconfigure it, which then withheld the switch that would turn
  // it back on.
  const resolverProblems = f.configuration.configured
    ? []
    : f.configuration.reasons.filter((r) => r !== FAILURE_MESSAGES.carrier_disabled);
  const configured = f.configuration.configured || resolverProblems.length === 0;

  if (blocker) {
    return {
      status: isUntouched(f) ? "draft" : blocker.status,
      label: isUntouched(f) ? STATUS_LABEL.draft : STATUS_LABEL[blocker.status],
      problems: [blocker.problem, ...resolverProblems],
      canActivate: false,
      usesFallback,
    };
  }

  // Setup is complete but the resolver still cannot pay somebody. That is not
  // a missing step — it is a mapping that does not add up — so it keeps the
  // resolver's words rather than getting a step name.
  if (!configured) {
    return {
      status: "needs_grid_review",
      label: STATUS_LABEL.needs_grid_review,
      problems: resolverProblems,
      canActivate: false,
      usesFallback,
    };
  }

  if (f.enabled) {
    return {
      status: "active",
      label: STATUS_LABEL.active,
      problems: fallbackNote,
      canActivate: false,
      usesFallback,
    };
  }

  // Everything resolves and the owner has simply not switched it on. Whether
  // that reads as "ready to activate" or "inactive" depends on whether they
  // have ever had it on — but nothing here can tell those apart, and guessing
  // wrong in the direction of "ready" is the harmless one: it offers a switch
  // rather than implying somebody turned it off.
  return {
    status: "ready_to_activate",
    label: STATUS_LABEL.ready_to_activate,
    problems: fallbackNote,
    canActivate: true,
    usesFallback,
  };
}

/** Only these can be picked in Post a Deal, contract requests and pipeline. */
export function isSelectableByAgents(s: CarrierState): boolean {
  return s.status === "active";
}

/**
 * Delete removes; archive keeps. The difference is whether anything points at
 * it.
 *
 * Getting this backwards loses an agency's commission history, so the rule is
 * conservative: any related record at all means archive.
 */
export type CarrierUsage = {
  contracts: number;
  policies: number;
  requests: number;
  commissionRecords: number;
  /** Configuration the delete takes with it. Optional: older callers omit it. */
  gridRows?: number;
  compLevels?: number;
  mappings?: number;
  methods?: number;
};

export function removalMode(u: CarrierUsage): "delete" | "archive" {
  const related = u.contracts + u.policies + u.requests + u.commissionRecords;
  return related > 0 ? "archive" : "delete";
}

export function removalExplanation(name: string, u: CarrierUsage): string {
  if (removalMode(u) === "delete") {
    // Name the setup being destroyed. A carrier with no history can still have
    // an afternoon of grid work behind it, and "cannot be undone" alone does
    // not tell the owner what they are about to lose.
    const setup: string[] = [];
    if (u.gridRows) setup.push(`${u.gridRows} grid row${u.gridRows === 1 ? "" : "s"}`);
    if (u.compLevels) setup.push(`${u.compLevels} comp level${u.compLevels === 1 ? "" : "s"}`);
    if (u.mappings) setup.push(`${u.mappings} position mapping${u.mappings === 1 ? "" : "s"}`);
    if (u.methods) setup.push(`${u.methods} submission method${u.methods === 1 ? "" : "s"}`);
    const also = setup.length ? ` Its ${setup.join(", ")} will be deleted with it.` : "";
    return (
      `${name} has no contracts, policies, requests or commission records, so it can ` +
      `be deleted permanently.${also} This cannot be undone.`
    );
  }

  const parts: string[] = [];
  if (u.policies) parts.push(`${u.policies} polic${u.policies === 1 ? "y" : "ies"}`);
  if (u.contracts) parts.push(`${u.contracts} contract${u.contracts === 1 ? "" : "s"}`);
  if (u.requests) parts.push(`${u.requests} request${u.requests === 1 ? "" : "s"}`);
  if (u.commissionRecords) {
    parts.push(`${u.commissionRecords} commission record${u.commissionRecords === 1 ? "" : "s"}`);
  }
  return (
    `${name} is attached to ${parts.join(", ")}, so it will be archived rather than ` +
    `deleted. Archived carriers stay on their history, stop appearing to agents, and ` +
    `can be restored.`
  );
}

/** The two counts the Carriers tab header shows. */
export function summarise(states: CarrierState[]): { active: number; needsSetup: number } {
  return {
    active: states.filter((s) => s.status === "active").length,
    needsSetup: states.filter(
      (s) => s.status !== "active" && s.status !== "archived" && s.status !== "inactive",
    ).length,
  };
}
