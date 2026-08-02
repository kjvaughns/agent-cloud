/**
 * Where an agent is, and what is wrong.
 *
 * The roster used to show a name, an email and a Configure button. The question
 * anybody actually opens it to answer — *where is this agent right now, and is
 * anything on fire* — took five other screens to answer.
 *
 * Two rules shape everything here.
 *
 * **The stage is derived, never stored.** A stored `stage` column is a second
 * source of truth that drifts: it will happily claim somebody is Active a month
 * after their licence expired. This module recomputes from the underlying facts
 * every time, so when a fact goes away the stage moves back on its own. It is
 * the same reason `agent-onboarding.functions.ts` derives its steps rather than
 * keeping a "step 3 done" flag.
 *
 * **A flag without a reason is a dead end.** "At-Risk" on its own tells you to
 * go and find out why, which is the work it was supposed to save. Every flag
 * carries the sentence you would say out loud.
 */

/** First match wins, so the order is the decision. */
export const LIFECYCLE_STAGES = [
  "terminated", "inactive", "onboarding", "licensed", "contracted", "at_risk", "active",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const STAGE_LABELS: Record<LifecycleStage, string> = {
  terminated: "Terminated",
  inactive: "Inactive",
  onboarding: "Onboarding",
  licensed: "Licensed",
  contracted: "Contracted",
  at_risk: "At risk",
  active: "Active",
};

export type RiskFlag = {
  /** Stable key, so a dismissal can be recorded against it later. */
  key: "no_sales" | "licence_expiring" | "eo_expiring" | "never_sold" | "persistency";
  /** What you would say out loud. Carries the number, not just the category. */
  reason: string;
  severity: "warn" | "critical";
};

/** Everything the derivation needs, already gathered. No I/O in here. */
export type AgentFacts = {
  status: string;
  /** Licences that have not expired. */
  liveLicences: number;
  /** Soonest expiry among live licences, ISO date. */
  nextLicenceExpiry: string | null;
  /** E&O expiry, ISO date, whichever document is furthest out. */
  eoExpiry: string | null;
  eoPresent: boolean;
  /** Carriers with a contract in `active`. */
  activeCarriers: number;
  policiesCount: number;
  /** Most recent submission, ISO timestamp. */
  lastSaleAt: string | null;
  /** When they were first contracted, for the never-sold check. */
  firstContractedAt: string | null;
  /** 13-month persistency as a percentage, or null when there is nothing to measure. */
  persistencyPct: number | null;
};

export type ComplianceLevel = "ok" | "warn" | "bad" | "unknown";

const DAY = 86_400_000;

/** Whole days from now until `iso`. Negative when it is in the past. */
export function daysUntil(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((t - now) / DAY);
}

/** Whole days since `iso`. Null when there is no date. */
export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / DAY);
}

/**
 * The dot on the row.
 *
 * `unknown` is deliberately distinct from `ok`. An agent with no licence record
 * at all is not compliant — we simply have not been told, and colouring that
 * green is the failure mode this is meant to prevent.
 */
export function complianceLevel(f: AgentFacts, now = Date.now()): ComplianceLevel {
  if (f.liveLicences === 0 && !f.eoPresent) return "unknown";

  const lic = daysUntil(f.nextLicenceExpiry, now);
  const eo = daysUntil(f.eoExpiry, now);

  if (f.liveLicences === 0) return "bad";
  if (lic !== null && lic < 0) return "bad";
  if (f.eoPresent && eo !== null && eo < 0) return "bad";
  if (!f.eoPresent) return "warn";

  if (lic !== null && lic <= 45) return "warn";
  if (eo !== null && eo <= 30) return "warn";
  return "ok";
}

/**
 * Why this agent needs attention.
 *
 * Two triggers from the original brief are deliberately absent, because the
 * data to support them does not exist and a flag that cannot fire is worse than
 * no flag:
 *
 *   "Has not logged in for 7+ days" — `profiles.last_active_at` is written by
 *   triggers on inserts to policies, call_logs and sms_messages, never on
 *   login. It measures production, not presence, so this would have silently
 *   restated the no-sales trigger below.
 *
 *   "Outstanding chargeback unresolved for 30+ days" — chargebacks are inferred
 *   from negative rows on commission_schedule. There is no chargeback record,
 *   no resolution state and no link back to the policy that caused it. The
 *   dollar total is derivable; "outstanding for 30 days" is not.
 */
export function riskFlags(f: AgentFacts, now = Date.now()): RiskFlag[] {
  const flags: RiskFlag[] = [];
  if (f.status === "terminated" || f.status === "inactive") return flags;

  // Only for somebody who has produced before. A new agent with no sales is
  // onboarding, not at risk, and saying otherwise buries the real ones.
  const sinceSale = daysSince(f.lastSaleAt, now);
  if (f.policiesCount > 0 && sinceSale !== null && sinceSale >= 14) {
    flags.push({
      key: "no_sales",
      reason: `No submission in ${sinceSale} days`,
      severity: sinceSale >= 30 ? "critical" : "warn",
    });
  }

  const lic = daysUntil(f.nextLicenceExpiry, now);
  if (lic !== null && lic <= 45) {
    flags.push({
      key: "licence_expiring",
      reason: lic < 0
        ? `Licence expired ${Math.abs(lic)} days ago`
        : `Licence expires in ${lic} days`,
      severity: lic < 0 ? "critical" : "warn",
    });
  }

  const eo = daysUntil(f.eoExpiry, now);
  if (f.eoPresent && eo !== null && eo <= 30) {
    flags.push({
      key: "eo_expiring",
      reason: eo < 0 ? `E&O expired ${Math.abs(eo)} days ago` : `E&O expires in ${eo} days`,
      severity: eo < 0 ? "critical" : "warn",
    });
  }

  // Contracted and never wrote anything. The 30-day grace exists because a
  // brand-new contract is not a problem yet.
  const sinceContract = daysSince(f.firstContractedAt, now);
  if (f.activeCarriers > 0 && f.policiesCount === 0 && sinceContract !== null && sinceContract >= 30) {
    flags.push({
      key: "never_sold",
      reason: `Contracted ${sinceContract} days ago, nothing submitted`,
      severity: sinceContract >= 90 ? "critical" : "warn",
    });
  }

  // Null means no eligible policies in the band, which is not 0%. Rendering it
  // as a failure would flag every agent whose book is younger than 13 months.
  if (f.persistencyPct !== null && f.persistencyPct < 78) {
    flags.push({
      key: "persistency",
      reason: `13-month persistency ${Math.round(f.persistencyPct)}%`,
      severity: f.persistencyPct < 70 ? "critical" : "warn",
    });
  }

  return flags;
}

/** First match wins. */
export function lifecycleStage(f: AgentFacts, flags: RiskFlag[]): LifecycleStage {
  if (f.status === "terminated") return "terminated";
  if (f.status === "inactive") return "inactive";
  if (f.liveLicences === 0) return "onboarding";
  if (f.activeCarriers === 0) return "licensed";
  if (f.policiesCount === 0) return "contracted";
  if (flags.length > 0) return "at_risk";
  return "active";
}
