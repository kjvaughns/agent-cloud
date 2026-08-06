/**
 * Screening AI-drafted client messages before an agent sends one.
 *
 * ── Why this is a feature and not a nicety ──────────────────────────────────
 *
 * Life insurance advertising is regulated at state level under each state's
 * adoption of the NAIC Unfair Trade Practices Act, and 25 states plus DC have
 * now adopted the NAIC Model Bulletin on the use of AI by insurers. Carriers
 * push those governance obligations downstream to distribution: the agency
 * signs an agreement promising its producers' communications comply, and the
 * agency is the one fined when they do not.
 *
 * An AI that drafts client messages is, without this, a machine for generating
 * that liability at scale. With it, the same AI is evidence of a control. That
 * difference is what an agency principal is buying — which is a different
 * buyer, and a different conversation, from the agent who wants a faster draft.
 *
 * ── Deterministic, deliberately ────────────────────────────────────────────
 *
 * A compliance screen that returns different answers for the same text on two
 * runs is not a control, it is a second opinion. Everything here is a pattern
 * with a citation-shaped reason attached, so a screen result can be shown to a
 * carrier auditor and reproduced by them.
 *
 * The rules err toward flagging. A false flag costs an agent one glance at a
 * sentence they then send anyway; a missed one is a market-conduct finding.
 * That asymmetry is the opposite of the carrier matcher's, where a wrong guess
 * writes bad data silently — worth saying, because both are "confidence"
 * problems and they want opposite defaults.
 *
 * ── What this is not ───────────────────────────────────────────────────────
 *
 * Not legal advice, and not a substitute for the carrier's own advertising
 * review. It catches the sentences that get agencies fined most often. An
 * agency with a compliance officer should still have one.
 */

export type Severity = "block" | "warn";

export type ComplianceRule = {
  id: string;
  /** What the message must not say. */
  pattern: RegExp;
  severity: Severity;
  /** Shown to the agent, in their language rather than a regulator's. */
  reason: string;
  /** What to say instead. Concrete, because "be careful" is not actionable. */
  instead: string;
};

/**
 * The rules.
 *
 * Ordered by how often each one actually appears in a market-conduct finding
 * rather than alphabetically, so the first flag an agent sees on a message
 * with several problems is the one most likely to matter.
 *
 * Every pattern is word-bounded. An unbounded `/free/` matches "freedom" and
 * "carefree", and a screen that cries wolf gets switched off, which is worse
 * than not having one.
 */
export const RULES: ComplianceRule[] = [
  {
    id: "guaranteed_return",
    pattern: /\b(guarantee[ds]?|guaranteed)\b[^.!?]{0,40}\b(return|returns|growth|gains?|interest|yield|performance)\b/i,
    severity: "block",
    reason:
      "Illustrated growth on a life policy is not guaranteed. Describing a return as guaranteed is a misrepresentation under every state's unfair trade practices act.",
    instead:
      "Name the guaranteed minimum if the product has one, and say clearly that anything above it is illustrated and not guaranteed.",
  },
  {
    id: "cannot_lose",
    pattern: /\b(can'?t|cannot|never|no way to)\b[^.!?]{0,25}\blose\b[^.!?]{0,25}\b(money|value|principal|anything)\b/i,
    severity: "block",
    reason:
      "\"You can't lose money\" ignores cost of insurance, surrender charges and lapse. Policy value can and does go down.",
    instead:
      "Explain the floor the product actually has, and that charges are deducted from value regardless of index performance.",
  },
  {
    id: "investment",
    pattern: /\b(invest|investment|investing|investor)\b/i,
    severity: "block",
    reason:
      "A life policy is not a security. Calling it an investment can constitute offering an unregistered security and is prohibited in most states unless you hold the appropriate registration.",
    instead: "Call it a policy, coverage, or a cash-value life insurance product.",
  },
  {
    id: "tax_free",
    pattern: /\btax[-\s]?free\b/i,
    severity: "warn",
    reason:
      "Policy loans and withdrawals are only tax-advantaged while the policy stays in force and within limits. A lapsed or MEC policy can produce a taxable event.",
    instead:
      "Say \"tax-advantaged\" and add that it depends on the policy staying in force — and that you are not giving tax advice.",
  },
  {
    id: "free_insurance",
    pattern: /\bfree\b[^.!?]{0,20}\b(insurance|coverage|policy|protection|benefit)\b|\b(insurance|coverage|policy)\b[^.!?]{0,15}\bfor free\b/i,
    severity: "block",
    reason:
      "Describing insurance as free is specifically prohibited by the NAIC model unfair trade practices act. Every policy has a cost.",
    instead: "If you mean a no-cost quote or a complimentary review, say that instead.",
  },
  {
    id: "guaranteed_approval",
    pattern: /\bguaranteed\b[^.!?]{0,25}\b(approval|acceptance|issue|coverage|qualif\w*)\b|\b(everyone|anyone|all)\b[^.!?]{0,20}\bqualifies?\b/i,
    severity: "block",
    reason:
      "Unless the product is genuinely guaranteed-issue, promising approval misstates the underwriting the client will actually go through.",
    instead:
      "Say what the underwriting involves — no exam, a few health questions — rather than promising the outcome.",
  },
  {
    id: "government_backing",
    pattern: /\b(government|federal(?:ly)?|state)[-\s]?(approved|backed|guaranteed|endorsed|sponsored|program)\b|\bFDIC\b/i,
    severity: "block",
    reason:
      "Implying government endorsement or backing of a private insurance product is prohibited, and life insurance is not FDIC insured.",
    instead:
      "If you mean the state guaranty association, name it and describe its limits accurately.",
  },
  {
    id: "illustration_as_fact",
    pattern: /\b(you'?ll|you will|this will|it will)\b[^.!?]{0,30}\b(have|be worth|grow to|accumulate|earn)\b[^.!?]{0,20}\$[\d,]+/i,
    severity: "warn",
    reason:
      "Stating an illustrated value as what will happen presents non-guaranteed numbers as fact. This is the single most common illustration finding.",
    instead:
      "Say \"the illustration shows\" or \"based on current assumptions\", and note that actual results will differ.",
  },
  {
    id: "urgency_pressure",
    pattern: /\b(rates?|prices?|premiums?)\b[^.!?]{0,25}\b(go(?:ing)? up|increase|rise)\b[^.!?]{0,20}\b(tomorrow|today|this week|soon|immediately)\b|\bact now\b|\blast chance\b|\bexpires? (?:today|tomorrow|tonight)\b/i,
    severity: "warn",
    reason:
      "Manufactured urgency is a high-pressure sales tactic that draws complaints, and the deadline is rarely real.",
    instead: "If a rate really does change on a date, name the date and the reason.",
  },
  {
    id: "fear_appeal",
    pattern: /\b(your (?:family|kids?|children|wife|husband|spouse))\b[^.!?]{0,40}\b(destitute|homeless|on the street|nothing|penniless|suffer)\b/i,
    severity: "warn",
    reason:
      "Fear-based appeals about a client's family draw complaints and read badly if the message is ever produced in a dispute.",
    instead: "State the coverage gap in numbers and let the client draw the conclusion.",
  },
  {
    id: "disparagement",
    pattern: /\b(term (?:insurance|life|policies)|whole life|competitors?|other (?:agents?|carriers?|companies))\b[^.!?]{0,30}\b(waste|rip[-\s]?off|scam|worthless|throwing (?:your )?money)\b/i,
    severity: "warn",
    reason:
      "Disparaging another product or carrier is an unfair trade practice, and the comparison is usually incomplete.",
    instead: "Compare on the facts that matter to this client — cost, duration, cash value — without the verdict.",
  },
  {
    id: "unqualified_rating",
    pattern: /\b(best|top|number one|#1|strongest|safest)\b[^.!?]{0,20}\b(carrier|company|insurer|policy|product|rate)\b/i,
    severity: "warn",
    reason:
      "Superlatives about a carrier need substantiation. Financial-strength ratings should be named with the rating agency and the date.",
    instead: "Cite the actual rating — \"A+ (Superior) from AM Best\" — rather than a superlative.",
  },
];

export type Finding = {
  ruleId: string;
  severity: Severity;
  reason: string;
  instead: string;
  /** The text that triggered it, so the agent can see what to change. */
  matched: string;
  /** Character offset into the screened message. */
  index: number;
};

export type ScreenResult = {
  findings: Finding[];
  /** True when nothing is a `block`. Warnings do not stop a send. */
  passed: boolean;
  /** True when at least one rule fired at any severity. */
  flagged: boolean;
};

/**
 * Screen one message.
 *
 * Warnings do not block. An agent who reads the note and sends anyway has made
 * a decision, and the audit log records that they made it — which is worth more
 * to an agency than a screen so strict that people route around it.
 *
 * Blocks do stop the send, because every one of them is a sentence that is
 * wrong on the facts rather than merely unwise.
 */
export function screenMessage(text: string | null | undefined): ScreenResult {
  const body = (text ?? "").trim();
  if (!body) return { findings: [], passed: true, flagged: false };

  const findings: Finding[] = [];
  for (const rule of RULES) {
    // Non-global regexes, matched once each: the first instance is what the
    // agent needs to see, and a message that says "investment" four times
    // should produce one finding rather than four.
    const m = body.match(rule.pattern);
    if (!m || m.index === undefined) continue;
    findings.push({
      ruleId: rule.id,
      severity: rule.severity,
      reason: rule.reason,
      instead: rule.instead,
      matched: m[0],
      index: m.index,
    });
  }

  return {
    findings,
    passed: !findings.some((f) => f.severity === "block"),
    flagged: findings.length > 0,
  };
}

/** One line for a list row. */
export function summariseScreen(r: ScreenResult): string {
  if (!r.flagged) return "No compliance issues found.";
  const blocks = r.findings.filter((f) => f.severity === "block").length;
  const warns = r.findings.length - blocks;
  return [
    blocks ? `${blocks} blocking issue${blocks === 1 ? "" : "s"}` : null,
    warns ? `${warns} to review` : null,
  ].filter(Boolean).join(" · ");
}

/**
 * The screening rules as a version string.
 *
 * Recorded alongside every screened message so an audit can tell which ruleset
 * a decision was made under. Derived from the rule ids rather than hand-bumped,
 * because a version somebody has to remember to increment is a version that is
 * wrong exactly when it matters.
 */
export function rulesetVersion(): string {
  return `v1:${RULES.length}:${RULES.map((r) => r.id).join(",").length}`;
}
