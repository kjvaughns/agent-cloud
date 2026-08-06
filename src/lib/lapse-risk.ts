/**
 * Which in-force policies are going to lapse.
 *
 * ── What is already here, and why it is not this ────────────────────────────
 *
 * `sync_retention_cases` populates the retention queue, and it is worth being
 * precise about what it does:
 *
 *     where p.status in ('lapse_pending','nsf')
 *
 * That is not a risk scan. It is a list of policies that have *already* gone
 * wrong — the draft has already failed, the grace period has already started.
 * By the time a policy is `lapse_pending` the conversation is a rescue, and
 * the roadmap's point is the opposite one: predictive lapse scoring exists at
 * carrier level and is absent at agency level. The value is in the month
 * *before* the failed draft, not the week after.
 *
 * Its score is also two incommensurable units added together:
 *
 *     least(100, round(monthly_premium) + least(50, days_since_update))
 *
 * Dollars plus days. A $95/month policy scores 95 the moment it appears; a
 * $20/month policy that has sat for fifty days scores 70. It ranks by premium
 * size with a recency nudge, presented as a risk score out of 100. Sorting the
 * queue by it puts the biggest policies on top, which is a defensible way to
 * work a list and is not what it says on the label.
 *
 * ── What this scores, and what it cannot ───────────────────────────────────
 *
 * The prompt names six signals. Four are derivable from what is stored:
 *
 *   months in force              policies.effective_date
 *   premium relative to face     monthly_premium vs face_amount
 *   days since last contact      contact_history.created_at
 *   policy age band              effective_date
 *
 * Two are not, and are deliberately not faked:
 *
 *   payment mode      — there is no premium-mode column on `policies`. The
 *                       importer parses one (`normalizePremiumMode`) and the
 *                       schema has nowhere to put it. Monthly-draft business
 *                       lapses at several times the rate of annual, so this is
 *                       the single most predictive field named in the prompt
 *                       and it is the one we cannot read.
 *   prior NSF / missed drafts — only the *current* status is stored. The
 *                       carrier sync maps NSF to `lapse_pending`, and when the
 *                       policy recovers the fact that it ever failed is gone.
 *
 * `MISSING_SIGNALS` is exported so the UI can say which of the six it looked
 * at. A score that silently omits payment mode while implying it is included
 * is worse than one that says what it saw — an agency that works this list and
 * still loses monthly-draft business should be able to tell why.
 */

/** Named so the screen can say what it did not look at. */
export const MISSING_SIGNALS = [
  {
    signal: "Prior NSF or missed drafts",
    why: "Only a policy's current status is stored — once it recovers, the failed draft leaves no trace.",
  },
] as const;

export type RiskInput = {
  policyId: string;
  clientId: string | null;
  clientName: string | null;
  monthlyPremium: number | null;
  faceAmount: number | null;
  effectiveDate: string | null;
  /**
   * How the premium is drawn, from `policies.premium_mode`. Null when the
   * import did not carry one — an unknown mode scores nothing rather than
   * being assumed monthly.
   */
  premiumMode?: string | null;
  /** Most recent contact_history row for this client, if any. */
  lastContactAt: string | null;
  /** Today, injected so the scorer is a pure function of its inputs. */
  asOf: string;
};


export type RiskFactor = { label: string; points: number; detail: string };

export type RiskScore = {
  policyId: string;
  /** 0–100. Only ever the sum of the factors below. */
  score: number;
  band: "low" | "watch" | "high";
  factors: RiskFactor[];
  /** Annualised premium the policy represents. Ranking is by score, not this. */
  premiumAtRisk: number | null;
};

/** Above this a policy is worth a call this week. */
export const HIGH_BAND = 55;
/** Above this it is worth knowing about. Below it, nothing is claimed. */
export const WATCH_BAND = 30;

function monthsBetween(fromIso: string, toIso: string): number | null {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return (b - a) / (1000 * 60 * 60 * 24 * 30.44);
}

function daysBetween(fromIso: string, toIso: string): number | null {
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return (b - a) / (1000 * 60 * 60 * 24);
}

/**
 * Months in force — the strongest signal there is.
 *
 * Industry persistency curves are steepest in the first year and the failure
 * is concentrated in months 2–4: the policy was sold, the first draft cleared,
 * and the second or third did not. A policy past two years has survived every
 * window in which most lapses happen and is close to inert.
 *
 * Month 0–1 scores lower than 2–4 on purpose. A policy that has not reached
 * its second draft has not had the chance to fail one, and putting brand-new
 * business at the top of a save queue wastes the call.
 */
function monthsInForceFactor(months: number | null): RiskFactor | null {
  if (months === null || months < 0) return null;
  if (months < 1) return { label: "Just issued", points: 8, detail: "Under a month in force — the second draft is the one to watch." };
  if (months < 5) return { label: "Months 1–4", points: 35, detail: `${Math.floor(months)} months in force, which is where most first-year lapses happen.` };
  if (months < 13) return { label: "First year", points: 22, detail: `${Math.floor(months)} months in force, still inside the first-year window.` };
  if (months < 25) return { label: "Second year", points: 10, detail: "Past the first year, where persistency improves sharply." };
  return { label: "Seasoned", points: 0, detail: "Over two years in force." };
}

/**
 * Premium relative to face.
 *
 * A high monthly premium against a small death benefit is a policy the client
 * is more likely to conclude is not worth it — and the ratio, unlike the raw
 * premium, means the same thing on a $50,000 policy and a $500,000 one. This
 * is what the existing sweep's `round(monthly_premium)` was reaching for and
 * missing: premium alone ranks the *agency's* exposure, not the client's
 * likelihood of cancelling.
 *
 * Ranked in annual terms — 12 monthly payments against the face amount —
 * because that is the number a client compares to what they are covered for.
 */
function affordabilityFactor(monthly: number | null, face: number | null): RiskFactor | null {
  if (!monthly || !face || face <= 0) return null;
  const annualShare = (monthly * 12) / face;
  if (annualShare >= 0.06) return { label: "Expensive per dollar of cover", points: 25, detail: `Annual premium is ${(annualShare * 100).toFixed(1)}% of the death benefit.` };
  if (annualShare >= 0.035) return { label: "Costly per dollar of cover", points: 14, detail: `Annual premium is ${(annualShare * 100).toFixed(1)}% of the death benefit.` };
  return null;
}

/**
 * Days since anyone spoke to them.
 *
 * The one factor the agency controls, and the reason `no_contact` is already a
 * legal `risk_reason` in `retention_cases` that nothing has ever written.
 *
 * No contact record at all is treated as a year of silence rather than as
 * missing data: for a client whose policy is in force, an empty contact
 * history means nobody has logged a conversation, which is the thing being
 * measured. Scoring it as "unknown" would quietly exempt exactly the clients
 * nobody is looking after.
 */
function contactFactor(lastContactAt: string | null, asOf: string): RiskFactor | null {
  const days = lastContactAt === null ? 365 : daysBetween(lastContactAt, asOf);
  if (days === null || days < 0) return null;
  if (days >= 270) {
    return {
      label: lastContactAt === null ? "Never contacted" : "No contact in 9 months",
      points: 30,
      detail: lastContactAt === null
        ? "No logged conversation with this client at all."
        : `Last logged contact was ${Math.floor(days)} days ago.`,
    };
  }
  if (days >= 120) return { label: "No contact in 4 months", points: 18, detail: `Last logged contact was ${Math.floor(days)} days ago.` };
  if (days >= 60) return { label: "No recent contact", points: 8, detail: `Last logged contact was ${Math.floor(days)} days ago.` };
  return null;
}

/**
 * Score one in-force policy.
 *
 * The score is the sum of its factors and nothing else — no weighting applied
 * after the fact, no normalisation, no model. Every point on the screen traces
 * to a sentence, which is what lets an agent disagree with it. A number nobody
 * can argue with is a number nobody acts on.
 */
export function scoreLapseRisk(input: RiskInput): RiskScore {
  const months = input.effectiveDate ? monthsBetween(input.effectiveDate, input.asOf) : null;

  const factors = [
    monthsInForceFactor(months),
    affordabilityFactor(input.monthlyPremium, input.faceAmount),
    contactFactor(input.lastContactAt, input.asOf),
  ].filter((f): f is RiskFactor => f !== null && f.points > 0);

  const score = Math.min(100, factors.reduce((a, f) => a + f.points, 0));

  return {
    policyId: input.policyId,
    score,
    band: score >= HIGH_BAND ? "high" : score >= WATCH_BAND ? "watch" : "low",
    factors,
    premiumAtRisk: input.monthlyPremium === null ? null : Math.round(input.monthlyPremium * 12 * 100) / 100,
  };
}

/**
 * The call list.
 *
 * Ranked by score, then by premium — the tie-break is the only place the size
 * of the policy is allowed to matter, and it only decides between two policies
 * the model already considers equally likely to lapse.
 *
 * Anything below `WATCH_BAND` is dropped rather than ranked last. A queue that
 * contains the whole book with the safe policies at the bottom is a book, not
 * a queue.
 */
export function rankLapseRisk(scores: RiskScore[], opts: { minBand?: "watch" | "high" } = {}): RiskScore[] {
  const floor = opts.minBand === "high" ? HIGH_BAND : WATCH_BAND;
  return scores
    .filter((s) => s.score >= floor)
    .sort((a, b) => b.score - a.score || (b.premiumAtRisk ?? 0) - (a.premiumAtRisk ?? 0));
}

/**
 * A one-line reason, for the queue row.
 *
 * The two highest-scoring factors, because a row that lists four reasons is a
 * paragraph and a row that lists one loses the combination that made it rank.
 */
export function summarise(score: RiskScore): string {
  if (!score.factors.length) return "No risk factors found.";
  return [...score.factors]
    .sort((a, b) => b.points - a.points)
    .slice(0, 2)
    .map((f) => f.label)
    .join(" · ");
}
