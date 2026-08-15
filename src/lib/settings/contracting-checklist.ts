/**
 * Setting up contracting, as one list with an order.
 *
 * The pieces all exist and each has its own screen: Carriers, Levels &
 * Positions, Comp Grids, Submission templates, How contracting works. What
 * does not exist is anything saying which to do first, or whether the result
 * works.
 *
 * So an owner sets up three carriers, never picks an advance option, and finds
 * out weeks later when a posted deal earns nothing — which is the failure this
 * whole milestone exists to stop. The information needed to warn them was
 * available the entire time.
 *
 * ── The messages are not written here ──
 *
 * `carrierConfiguration` in `compensation/resolve.ts` already decides whether
 * a carrier can pay and says exactly why not, in sentences an owner can act
 * on — it is what Post a Deal and My Contracts already show. This module
 * arranges those answers into steps; it does not invent a second opinion about
 * what is wrong. A checklist that disagreed with the deal screen would be
 * worse than no checklist.
 *
 * Pure, so every state of a half-configured agency can be exercised without a
 * database.
 */

export const SETUP_STEPS = [
  "carriers",
  "levels",
  "mappings",
  "advances",
  "test",
  "publish",
] as const;

export type SetupStepId = (typeof SETUP_STEPS)[number];

export type StepStatus = "done" | "blocked" | "todo";

export type SetupStep = {
  id: SetupStepId;
  title: string;
  /** What this step is for, in one line. */
  purpose: string;
  status: StepStatus;
  /** Exactly what is wrong, from the resolver. Empty when the step is done. */
  problems: string[];
  /** Where to go and fix it. */
  href: string;
};

/** What the checklist needs to know. Every field comes from a table. */
export type SetupFacts = {
  /** Every carrier the agency has added, enabled or not. */
  carriers: {
    /** The `org_carriers` row id, which is what the resolver keys on. */
    id: string;
    /** The underlying catalog carrier, which is what a comp grid keys on. */
    carrier_id: string | null;
    name: string;
    enabled: boolean;
    visible_to_agents: boolean;
    available_for_post_deal: boolean;
    default_advance_option: string | null;
  }[];
  /** Active rungs only — an inactive one cannot pay anybody. */
  levels: { id: string; name: string; base_pct: number | null }[];
  /**
   * Per carrier id, the verdict from `carrierConfiguration`. Passed in rather
   * than computed, so this module and the deal screen cannot disagree.
   */
  configuration: Map<string, { configured: boolean; reasons: string[] }>;
  /**
   * Catalog carrier ids with at least one comp grid.
   *
   * Keyed on `carrier_id`, not the org_carriers id: `commission_grids` records
   * the carrier, and comparing the two would have matched nothing and reported
   * every carrier as missing a grid.
   */
  carriersWithGrids: Set<string>;
};

const HREF: Record<SetupStepId, string> = {
  carriers: "/settings/carriers",
  levels: "/settings/levels",
  mappings: "/settings/comp-grids",
  advances: "/settings/carriers",
  test: "/settings/contracting",
  publish: "/settings/carriers",
};

/**
 * Evaluate the six steps against what the agency has actually set up.
 *
 * A step is `blocked` when an earlier one is not done — an owner told to
 * "choose advance options" before adding a carrier is being sent to an empty
 * screen. `todo` means it is next and possible.
 */
export function evaluateSetup(facts: SetupFacts): SetupStep[] {
  const enabled = facts.carriers.filter((c) => c.enabled);
  const steps: SetupStep[] = [];

  // ── 1. Carriers ──
  const carriersDone = enabled.length > 0;
  steps.push({
    id: "carriers",
    title: "Choose your carriers",
    purpose: "Which carriers this agency writes with.",
    status: carriersDone ? "done" : "todo",
    problems: carriersDone
      ? []
      : facts.carriers.length > 0
        ? ["Every carrier you have added is switched off, so none can be written."]
        : ["No carriers added yet."],
    href: HREF.carriers,
  });

  // ── 2. Levels ──
  const levelsDone = facts.levels.length > 0;
  const levelsWithoutPct = facts.levels.filter((l) => l.base_pct == null);
  steps.push({
    id: "levels",
    title: "Create your positions",
    purpose: "The ladder every agent sits on, and what each rung pays.",
    status: levelsDone && levelsWithoutPct.length === 0 ? "done" : "todo",
    problems: !levelsDone
      ? ["No positions created yet, so nobody has a level to be paid from."]
      : levelsWithoutPct.length > 0
        ? [
            `${levelsWithoutPct.map((l) => l.name).join(", ")} ${
              levelsWithoutPct.length === 1 ? "has" : "have"
            } no base percentage, so a deal written on that position resolves nothing.`,
          ]
        : [],
    href: HREF.levels,
  });

  // ── 3. Mappings and grids ──
  //
  // The resolver's own verdict, minus the two problems that belong to their
  // own steps below. Repeating "no advance option" here would make the list
  // read as four problems when there is one.
  const mappingProblems = enabled.flatMap((c) => {
    const v = facts.configuration.get(c.id);
    if (!v || v.configured) return [];
    return v.reasons
      .filter((r) => !/advance/i.test(r))
      .map((r) => `${c.name}: ${r}`);
  });
  const missingGrids = enabled.filter(
    (c) => !c.carrier_id || !facts.carriersWithGrids.has(c.carrier_id),
  );
  steps.push({
    id: "mappings",
    title: "Review mappings and grids",
    purpose: "What each position earns with each carrier.",
    status: !carriersDone || !levelsDone
      ? "blocked"
      : mappingProblems.length === 0 ? "done" : "todo",
    problems: [
      ...mappingProblems,
      // A missing grid is worth saying and is not a blocker: the ladder can
      // pay without one. Naming it as a problem alongside things that stop a
      // deal paying would overstate it.
      ...(missingGrids.length > 0
        ? [`No comp grid uploaded for ${missingGrids.map((c) => c.name).join(", ")} — the position percentages still apply.`]
        : []),
    ],
    href: HREF.mappings,
  });

  // ── 4. Advance options ──
  //
  // Deliberately its own step. This is the one an agency skips, and the
  // resolver refuses to guess it — guessing an advance term is exactly the
  // silent default the whole compensation rewrite exists to remove.
  const noAdvance = enabled.filter((c) => !c.default_advance_option);
  steps.push({
    id: "advances",
    title: "Choose advance options",
    purpose: "How much of year one each carrier fronts.",
    status: !carriersDone ? "blocked" : noAdvance.length === 0 ? "done" : "todo",
    problems: noAdvance.length > 0
      ? [
          `No advance option chosen for ${noAdvance.map((c) => c.name).join(", ")}. ` +
          `Nothing is assumed on your behalf, so a deal on those carriers cannot work out what to advance.`,
        ]
      : [],
    href: HREF.advances,
  });

  // ── 5. The configuration test ──
  //
  // Not a separate opinion: a carrier passes when the resolver says it is
  // configured. The value is in saying so before a deal proves it.
  const failing = enabled.filter((c) => !facts.configuration.get(c.id)?.configured);
  steps.push({
    id: "test",
    title: "Run a configuration test",
    purpose: "Check a deal would actually pay, before one is written.",
    status: !carriersDone || !levelsDone
      ? "blocked"
      : failing.length === 0 ? "done" : "todo",
    problems: failing.length > 0
      ? [`${failing.length} of ${enabled.length} carriers would not pay a deal today.`]
      : [],
    href: HREF.test,
  });

  // ── 6. Publish ──
  const publishable = enabled.filter((c) => facts.configuration.get(c.id)?.configured);
  const unpublished = publishable.filter(
    (c) => !c.visible_to_agents || !c.available_for_post_deal,
  );
  steps.push({
    id: "publish",
    title: "Publish to your agents",
    purpose: "Make the carriers your agents can see and post deals against.",
    status: publishable.length === 0
      ? "blocked"
      : unpublished.length === 0 ? "done" : "todo",
    problems: unpublished.length > 0
      ? [
          `${unpublished.map((c) => c.name).join(", ")} ${unpublished.length === 1 ? "is" : "are"} ` +
          `set up but not yet visible to agents or available on Post a Deal.`,
        ]
      : [],
    href: HREF.publish,
  });

  return steps;
}

/**
 * How far along, for the progress indicator.
 *
 * Blocked steps count against the total rather than being excluded — an owner
 * three steps in should see three of six, not three of three.
 */
export function progress(steps: SetupStep[]): { done: number; total: number; pct: number } {
  const done = steps.filter((s) => s.status === "done").length;
  const total = steps.length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** The first step worth doing, which is what the page should point at. */
export function nextStep(steps: SetupStep[]): SetupStep | null {
  return steps.find((s) => s.status === "todo") ?? null;
}

/** Is the agency ready to let agents write business? */
export function isReady(steps: SetupStep[]): boolean {
  return steps.every((s) => s.status === "done");
}
