/**
 * Which capabilities Nova Pro actually gates.
 *
 * ── One list, on purpose ───────────────────────────────────────────────────
 *
 * Before this, `requireNovaPro` was called from exactly one place in the
 * codebase — `createAutomation` — while the settings page advertised five
 * features. What a subscription buys was therefore a thing you could only
 * learn by grepping, and the answer disagreed with the marketing.
 *
 * So the gated set lives here, as data, with the reasoning attached to each
 * entry. Changing what is paid is one line in one file and it shows up in a
 * diff. Scattering `requireNovaPro` calls across a dozen server functions
 * would work and would be unreviewable.
 *
 * ── Why reconciliation is not on the list ──────────────────────────────────
 *
 * Commission reconciliation existed before this work and was free. It was
 * improved — the parser stopped reading chargebacks as payments, matching and
 * a comp-grid check were added — but improving a free feature does not make it
 * paid. Prompt 14's own rules forbid silently converting a previously-free
 * feature, and that rule is right: an agency that has been reconciling
 * statements for months should not find the button behind a paywall one
 * morning.
 *
 * It is also the best possible trial: "$4,180 unmatched across your
 * statements" is a sentence about their own book, and no marketing copy
 * competes with it.
 *
 * The three below are new. They have never shipped free, so gating them takes
 * nothing away from anyone.
 */

export type NovaFeature = "lapse_scan" | "compliance_screen" | "review_prep";

export type GatedFeature = {
  id: NovaFeature;
  label: string;
  /** Shown on the upsell card. What the agent gets, in their terms. */
  pitch: string;
  /** Where in the product this feature is reached, for the preview link. */
  path: string;
};

export const GATED: Record<NovaFeature, GatedFeature> = {
  lapse_scan: {
    id: "lapse_scan",
    label: "Lapse-risk scan",
    pitch: "Ranks your in-force book by how likely each policy is to lapse, before the draft fails.",
    path: "/retention",
  },
  compliance_screen: {
    id: "compliance_screen",
    label: "Compliance screening",
    pitch: "Checks every AI-drafted client message against advertising rules, and keeps the record.",
    path: "/ai-assistant",
  },
  review_prep: {
    id: "review_prep",
    label: "Policy review prep",
    pitch: "Finds the coverage gaps in a client's book and writes the agenda before the meeting.",
    path: "/clients",
  },
};

export const GATED_IDS = Object.keys(GATED) as NovaFeature[];

/**
 * Free capabilities that are adjacent enough to be mistaken for paid ones.
 *
 * Listed rather than merely absent, because "is reconciliation included?" is a
 * question a salesperson will be asked and the answer needs to be somewhere
 * other than this comment.
 */
export const EXPLICITLY_FREE = [
  {
    label: "Commission reconciliation",
    why: "It existed before Nova Pro and stays free. Upload a statement, match it against your book, see the variances.",
  },
  {
    label: "The Nova assistant",
    why: "Asking Nova questions about your book is free for everyone.",
  },
] as const;

/** One real run of each gated feature, free, so the output speaks for itself. */
export const FREE_TRIAL_RUNS = 1;

/**
 * How long a new account has to take it.
 *
 * Not a countdown shown as pressure — it exists so a trial run means something
 * about a book somebody is actually working, rather than being banked
 * indefinitely against a book they imported and abandoned.
 */
export const TRIAL_WINDOW_DAYS = 14;

export type AccessMode = "subscribed" | "trial" | "trial_used" | "trial_expired" | "free";

export type Access = {
  allowed: boolean;
  mode: AccessMode;
  /** Trial runs left on this feature. Null when subscribed. */
  runsLeft: number | null;
  /** One sentence, for the card. Never scare-tactic phrasing. */
  message: string;
};

/**
 * Decide access from facts the caller has already fetched.
 *
 * Pure, so the decision is testable without a database — and so the same
 * function can answer "may I?" before the work and "what do I show?" after.
 */
export function resolveAccess(input: {
  novaProStatus: string | null;
  /** Trial runs already taken on THIS feature. */
  runsUsed: number;
  accountCreatedAt: string | null;
  asOf: string;
  /** True when the usage table could not be read. See the note below. */
  usageUnknown?: boolean;
}): Access {
  const subscribed = input.novaProStatus === "active" || input.novaProStatus === "grace_period";
  if (subscribed) {
    return { allowed: true, mode: "subscribed", runsLeft: null, message: "" };
  }

  // The table is a pending migration. Failing OPEN is the deliberate choice:
  // blocking would deny somebody a feature because an audit table was late,
  // and the cost of an extra free run is a free run.
  if (input.usageUnknown) {
    return {
      allowed: true,
      mode: "trial",
      runsLeft: FREE_TRIAL_RUNS,
      message: "Running this one on us.",
    };
  }

  const withinWindow = (() => {
    if (!input.accountCreatedAt) return true;
    const created = Date.parse(input.accountCreatedAt);
    const now = Date.parse(input.asOf);
    if (Number.isNaN(created) || Number.isNaN(now)) return true;
    return (now - created) / 86_400_000 <= TRIAL_WINDOW_DAYS;
  })();

  const runsLeft = Math.max(0, FREE_TRIAL_RUNS - input.runsUsed);

  if (runsLeft > 0 && withinWindow) {
    return {
      allowed: true,
      mode: "trial",
      runsLeft,
      message: `Running this one on us — ${runsLeft} free ${runsLeft === 1 ? "run" : "runs"} on your own book.`,
    };
  }

  if (runsLeft > 0 && !withinWindow) {
    return {
      allowed: false,
      mode: "trial_expired",
      runsLeft,
      message: "The free run is for the first two weeks. Nova Pro turns it back on.",
    };
  }

  return {
    allowed: false,
    mode: "trial_used",
    runsLeft: 0,
    // No confirmshaming, no "keep doing it by hand". Says what it is.
    message: "You've had your free run of this. Nova Pro runs it whenever you like.",
  };
}

// ── Contextual placements ──────────────────────────────────────────────────

/**
 * Where an upsell card may appear, and what it says there.
 *
 * The rule from the prompt, and it is the right one: never interrupt. Every
 * placement is an inline card in a view the user is already looking at, shown
 * at the moment they feel the thing it solves. None of these is a modal, an
 * interstitial, or anything that sits over work in progress.
 *
 * `id` is what the instrumentation counts, so a placement converting below the
 * floor can be identified and removed rather than argued about.
 */
export type Placement = {
  id: string;
  feature: NovaFeature;
  /** The moment. Written as the condition, so the caller cannot misplace it. */
  when: string;
  headline: string;
  body: string;
};

export const PLACEMENTS: Placement[] = [
  {
    id: "reconciliation_after_upload",
    feature: "lapse_scan",
    when: "A statement has just been reconciled by hand",
    headline: "That statement is reconciled. What about the policies still paying?",
    body: "Nova Pro ranks your in-force book by lapse risk every morning, so the save happens before the draft fails rather than after.",
  },
  {
    id: "policy_went_lapse_pending",
    feature: "lapse_scan",
    when: "A policy in this agent's book has moved to lapse_pending",
    headline: "This one is already in grace.",
    body: "Nova Pro scores the book before that happens — months in force, time since the last conversation, premium against cover.",
  },
  {
    id: "book_over_fifty",
    feature: "lapse_scan",
    when: "The agent's in-force book passes 50 policies",
    headline: "Fifty policies is more than a morning's read.",
    body: "Nova Pro ranks them by lapse risk and gives you the top of the list, with the reason for each.",
  },
  {
    id: "third_manual_task",
    feature: "lapse_scan",
    when: "The agent has created three follow-up tasks by hand this week",
    headline: "Three follow-ups typed out this week.",
    body: "Nova Pro creates these from the risk scan, one per client, with the reason already written.",
  },
  {
    id: "client_review_opened",
    feature: "review_prep",
    when: "A client detail view is opened on somebody with more than one policy",
    headline: "Preparing for a review?",
    body: "Nova Pro reads the whole book — term conversion deadlines, missing beneficiaries, gaps against income — and writes the agenda.",
  },
  {
    id: "draft_generated",
    feature: "compliance_screen",
    when: "An AI draft has been generated for a client",
    headline: "Sending AI-drafted messages to clients?",
    body: "Nova Pro screens each one against advertising rules and keeps an immutable record of what it said — which is what a carrier asks for.",
  },
];

export function placement(id: string): Placement | null {
  return PLACEMENTS.find((p) => p.id === id) ?? null;
}

/**
 * A placement converting below this is noise and should be deleted.
 *
 * From the prompt, and worth keeping as a constant rather than a habit: the
 * point of instrumenting an upsell is to be able to kill it, and a threshold
 * nobody wrote down is a threshold nobody enforces.
 */
export const MIN_CONVERSION_RATE = 0.005;

/** Should this placement be retired? Needs enough impressions to mean anything. */
export function shouldRetire(stats: { impressions: number; conversions: number }): boolean {
  if (stats.impressions < 200) return false;
  return stats.conversions / stats.impressions < MIN_CONVERSION_RATE;
}
