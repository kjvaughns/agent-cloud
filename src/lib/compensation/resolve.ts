/**
 * What an agent earns on a carrier, decided in one place.
 *
 * Two systems had grown up side by side and neither knew about the other:
 *
 *   `agent_commission_levels.assigned_pct`  the legacy per-agent, per-carrier
 *                                           number the commission calculator
 *                                           read, and the only one it read
 *   `agency_levels.base_pct`                the promotion ladder the roster
 *                                           displays as a position pill, and
 *                                           which no calculation has ever
 *                                           consulted
 *
 * So an agency could build its whole ladder — Trainee 60, Agent 70, GA 80 —
 * watch it render on every roster row, and still have commissions computed
 * from a number set somewhere else entirely, or not computed at all. This
 * module is the single answer, and every caller must come through it.
 *
 * ── The order ──
 *
 *   1. An active agent-and-carrier contract override
 *   2. The agency level and carrier mapping
 *   3. The agency level's base percentage
 *   4. Nothing — which is an ERROR, not a default
 *
 * Step 4 is the point. The old calculator fell back to a hard-coded 70 or 75
 * per cent in places and, where it did not, silently wrote no schedule at all.
 * Both are worse than stopping: one pays a number nobody chose, the other
 * leaves an agent wondering why a posted deal earned nothing. A failed
 * resolution names exactly what is missing so the owner can fix it and the
 * agent can be told why.
 *
 * ── Percentages ──
 *
 * The database stores these as whole numbers with a 0–500 check: `80` means
 * 80%, and values above 100 are legitimate (a first-year street-level
 * contract can exceed the premium). Everything here takes and returns that
 * stored form; `asFraction` is the one place the conversion happens, so a
 * calculation cannot accidentally multiply by 80 instead of 0.8. That bug has
 * already happened once in this codebase — the old calculator's
 * `if (pct > 1) pct = pct / 100` guessed at the unit rather than knowing it.
 */

export const ADVANCE_OPTIONS = [
  "as_earned",
  "3_months",
  "6_months",
  "9_months",
  "12_months",
] as const;
export type AdvanceOption = (typeof ADVANCE_OPTIONS)[number];

export const ADVANCE_MONTHS: Record<AdvanceOption, number> = {
  as_earned: 0,
  "3_months": 3,
  "6_months": 6,
  "9_months": 9,
  "12_months": 12,
};

export const ADVANCE_LABELS: Record<AdvanceOption, string> = {
  as_earned: "As earned",
  "3_months": "3 months",
  "6_months": "6 months",
  "9_months": "9 months",
  "12_months": "12 months",
};

export function isAdvanceOption(v: unknown): v is AdvanceOption {
  return typeof v === "string" && (ADVANCE_OPTIONS as readonly string[]).includes(v);
}

/** Stored form (80) → multiplier (0.8). The only place this conversion lives. */
export function asFraction(storedPct: number): number {
  return storedPct / 100;
}

// ── Inputs ──────────────────────────────────────────────────────────────────

/** One rung of the agency's promotion ladder. */
export type AgencyLevel = {
  id: string;
  name: string;
  /** Stored form: 80 means 80%. */
  base_pct: number;
  sort_order: number;
  can_invite: boolean;
  active: boolean;
};

/** An agency level's terms on one carrier. Either field may be absent. */
export type LevelCarrierMapping = {
  agency_level_id: string;
  org_carrier_id: string;
  carrier_pct: number | null;
  advance_option: AdvanceOption | null;
  /**
   * What this rung is called on the carrier's own schedule — "80%", "GA3".
   * Distinct from the agency level's name, and the two are not
   * interchangeable: commission grids are keyed by the carrier's vocabulary,
   * so matching them on "General Agent" would find nothing.
   */
  carrier_level_name?: string | null;
};

/** One agent's own terms on one carrier, when the agency has granted them. */
export type ContractOverride = {
  agent_id: string;
  org_carrier_id: string;
  assigned_pct: number | null;
  advance_option: AdvanceOption | null;
  /** The carrier's own name for this contract's level. */
  commission_level?: string | null;
  /** Only an active contract overrides anything. */
  status: string;
};

/** The agency's setup for one carrier. */
export type AgencyCarrier = {
  org_carrier_id: string;
  enabled: boolean;
  visible_to_agents: boolean;
  requestable_by_agents: boolean;
  available_for_post_deal: boolean;
  default_advance_option: AdvanceOption | null;
};

export type ResolveInput = {
  agentId: string;
  orgCarrierId: string;
  /** The agent's current rung, or null if they have not been placed on one. */
  level: AgencyLevel | null;
  mapping: LevelCarrierMapping | null;
  contract: ContractOverride | null;
  carrier: AgencyCarrier | null;
};

// ── Output ──────────────────────────────────────────────────────────────────

export type PctSource = "contract" | "level_carrier" | "level_base";
export type AdvanceSource = "contract" | "level_carrier" | "carrier_default";

/**
 * Every reason a resolution can fail, as a code plus a sentence an owner can
 * act on. Codes so the UI can group them; sentences so nobody has to guess.
 */
export type ResolveFailure =
  | "carrier_not_configured"
  | "carrier_disabled"
  | "no_agency_level"
  | "no_percentage"
  | "no_advance_option";

export const FAILURE_MESSAGES: Record<ResolveFailure, string> = {
  carrier_not_configured: "This carrier has not been set up for the agency yet.",
  carrier_disabled: "This carrier is turned off for the agency.",
  no_agency_level: "This agent has not been placed on an agency level yet.",
  no_percentage:
    "No compensation percentage resolves for this agent on this carrier — the agency level has no base percentage and there is no carrier mapping or contract override.",
  no_advance_option: "This carrier has no advance option chosen.",
};

export type Resolution =
  | {
      ok: true;
      /** Stored form: 80 means 80%. */
      pct: number;
      pctSource: PctSource;
      advance: AdvanceOption;
      advanceSource: AdvanceSource;
      advanceMonths: number;
      levelId: string;
      levelName: string;
      /**
       * The carrier's name for this level, when anything supplies one. Renewal
       * grids are keyed by it, so it follows the same precedence as the
       * percentage rather than defaulting to the agency's own label.
       */
      carrierLevelName: string | null;
    }
  | { ok: false; failures: ResolveFailure[]; messages: string[] };

const fail = (...failures: ResolveFailure[]): Resolution => ({
  ok: false,
  failures,
  messages: failures.map((f) => FAILURE_MESSAGES[f]),
});

/**
 * The canonical resolution. No caller may compute a percentage any other way.
 *
 * Collects every reason it could not resolve rather than returning the first,
 * because an owner fixing configuration wants the whole list — telling them
 * about the missing advance option only after they have fixed the percentage
 * is two trips for one problem.
 */
export function resolveCompensation(input: ResolveInput): Resolution {
  const { level, mapping, contract, carrier } = input;

  if (!carrier) return fail("carrier_not_configured");
  if (!carrier.enabled) return fail("carrier_disabled");

  const failures: ResolveFailure[] = [];

  // An active contract override outranks everything. A contract that is not
  // active is history, not terms.
  const contractActive = contract?.status === "active";
  const contractPct =
    contractActive && contract?.assigned_pct != null ? Number(contract.assigned_pct) : null;

  let pct: number | null = null;
  let pctSource: PctSource | null = null;

  if (contractPct != null) {
    pct = contractPct;
    pctSource = "contract";
  } else if (!level) {
    // Without a rung there is no mapping to look up and no base to fall back
    // on. Reported separately from "no percentage" because the fix is
    // different: place the agent, rather than configure the carrier.
    failures.push("no_agency_level");
  } else if (mapping?.carrier_pct != null) {
    pct = Number(mapping.carrier_pct);
    pctSource = "level_carrier";
  } else if (level.base_pct != null) {
    pct = Number(level.base_pct);
    pctSource = "level_base";
  } else {
    failures.push("no_percentage");
  }

  // Advance resolves down the same ladder, but its floor is the carrier's own
  // default rather than the level — an advance is a carrier's term, not a
  // rank's.
  const contractAdvance =
    contractActive && contract?.advance_option ? contract.advance_option : null;
  let advance: AdvanceOption | null = null;
  let advanceSource: AdvanceSource | null = null;

  if (contractAdvance) {
    advance = contractAdvance;
    advanceSource = "contract";
  } else if (mapping?.advance_option) {
    advance = mapping.advance_option;
    advanceSource = "level_carrier";
  } else if (carrier.default_advance_option) {
    advance = carrier.default_advance_option;
    advanceSource = "carrier_default";
  } else {
    failures.push("no_advance_option");
  }

  if (
    failures.length > 0 ||
    pct == null ||
    pctSource == null ||
    advance == null ||
    advanceSource == null
  ) {
    return fail(...(failures.length > 0 ? failures : ["no_percentage" as const]));
  }

  return {
    ok: true,
    pct,
    pctSource,
    advance,
    advanceSource,
    advanceMonths: ADVANCE_MONTHS[advance],
    levelId: pctSource === "contract" ? (level?.id ?? "") : level!.id,
    levelName: pctSource === "contract" ? (level?.name ?? "Contract override") : level!.name,
    carrierLevelName:
      (pctSource === "contract" ? contract?.commission_level : null) ??
      mapping?.carrier_level_name ??
      contract?.commission_level ??
      null,
  };
}

/**
 * Is this carrier set up well enough to appear to agents?
 *
 * Configured means: enabled, an advance option chosen, and a percentage that
 * resolves for every ACTIVE level. A full product grid is deliberately not
 * required — the level's base percentage is a legitimate answer, and demanding
 * a grid would keep carriers hidden that are perfectly usable.
 *
 * Returns the reasons rather than a boolean so the owner's setup screen can
 * say which levels are unresolved instead of "not configured".
 */
export function carrierConfiguration(
  carrier: AgencyCarrier | null,
  activeLevels: AgencyLevel[],
  mappings: LevelCarrierMapping[],
): { configured: boolean; reasons: string[] } {
  if (!carrier) return { configured: false, reasons: [FAILURE_MESSAGES.carrier_not_configured] };

  const reasons: string[] = [];
  if (!carrier.enabled) reasons.push(FAILURE_MESSAGES.carrier_disabled);
  if (!carrier.default_advance_option) reasons.push(FAILURE_MESSAGES.no_advance_option);

  // An agency with no levels at all cannot resolve anybody.
  if (activeLevels.length === 0) {
    reasons.push("The agency has no active levels, so no compensation can resolve.");
  }

  const unresolved = activeLevels.filter((lvl) => {
    const m = mappings.find(
      (x) => x.agency_level_id === lvl.id && x.org_carrier_id === carrier.org_carrier_id,
    );
    return m?.carrier_pct == null && lvl.base_pct == null;
  });
  if (unresolved.length > 0) {
    reasons.push(
      `No percentage resolves for ${unresolved.map((l) => l.name).join(", ")} — give the level a base percentage or map it to this carrier.`,
    );
  }

  return { configured: reasons.length === 0, reasons };
}

// ── Year one ────────────────────────────────────────────────────────────────

export type YearOnePlan = {
  /** Annual premium × resolved percentage. */
  yearOneTotal: number;
  /** Monthly premium × advance months × resolved percentage. */
  advanceAmount: number;
  /** What is left, paid as earned. */
  balance: number;
  /** Months over which the balance pays, after the advanced ones. */
  asEarnedMonths: number;
  monthlyAsEarned: number;
};

/**
 * Year one on a monthly-premium policy.
 *
 * Deliberately literal about the spec's arithmetic rather than clever: the
 * advance is what the carrier fronts for `advanceMonths` of premium at the
 * agent's rate, and everything else falls to as-earned over the rest of the
 * year. Carrier-specific caps belong in configured fields, never here — the
 * old calculator had a $600 GTL cap and a 50% split written into the code,
 * which meant a carrier's terms could only be changed by a deploy.
 *
 * `as_earned` is zero advanced months, so the whole year pays monthly. That
 * falls out of the arithmetic rather than needing its own branch.
 */
export function planYearOne(
  monthlyPremium: number,
  pct: number,
  advanceMonths: number,
): YearOnePlan {
  const rate = asFraction(pct);
  const annual = monthlyPremium * 12;
  const yearOneTotal = round2(annual * rate);

  const months = Math.max(0, Math.min(12, advanceMonths));
  const advanceAmount = round2(monthlyPremium * months * rate);
  const balance = round2(yearOneTotal - advanceAmount);
  const asEarnedMonths = 12 - months;

  return {
    yearOneTotal,
    advanceAmount,
    balance,
    asEarnedMonths,
    monthlyAsEarned: asEarnedMonths > 0 ? round2(balance / asEarnedMonths) : 0,
  };
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

// ── Overrides ───────────────────────────────────────────────────────────────

export type OverrideLeg = {
  agentId: string;
  /** Stored form. */
  pct: number;
  /** The spread this person is paid, in stored form. */
  spread: number;
  amount: number;
  depth: number;
};

/**
 * Who gets paid what up the chain.
 *
 * Each person earns the difference between their own percentage and the
 * highest already paid below them — not the difference from the immediate
 * downline. Those are the same number in a well-ordered hierarchy and differ
 * the moment somebody sits above a person on a better contract, which happens
 * whenever an agent negotiates their own terms. Taking the running maximum
 * means the total paid out can never exceed the top percentage in the chain.
 *
 * A non-positive spread pays nothing and is not recorded. It is not an error:
 * an upline on the same level as their downline genuinely earns no override,
 * and writing a zero row would put a payment of nothing in somebody's ledger.
 *
 * The walk covers the whole hierarchy rather than the old fixed five, with a
 * depth cap and a cycle guard that exist because `upline_id` is a plain
 * self-reference the database does not stop from looping.
 */
export function resolveOverrides(
  writingPct: number,
  chain: { agentId: string; pct: number | null }[],
  annualPremium: number,
  maxDepth = 25,
): OverrideLeg[] {
  const legs: OverrideLeg[] = [];
  const seen = new Set<string>();
  let paidUpTo = writingPct;

  for (let i = 0; i < chain.length && i < maxDepth; i++) {
    const link = chain[i];
    if (seen.has(link.agentId)) break;
    seen.add(link.agentId);

    // Somebody with no resolvable percentage is passed over rather than
    // treated as zero: zero would make everyone above them earn the full
    // spread twice.
    if (link.pct == null) continue;

    const spread = link.pct - paidUpTo;
    if (spread > 0) {
      legs.push({
        agentId: link.agentId,
        pct: link.pct,
        spread,
        amount: round2(annualPremium * asFraction(spread)),
        depth: i + 1,
      });
      paidUpTo = link.pct;
    }
  }
  return legs;
}
