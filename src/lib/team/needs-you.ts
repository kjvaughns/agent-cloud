/**
 * The two lists an agency owner actually needs on arrival.
 *
 * An owner has two jobs with people: get them selling, and keep them selling.
 * Everything else on the Team page is reference material you go looking for;
 * these two are the reason you opened it. So they sit at the top, and they are
 * derived from roster rows that are already on the wire — no second query.
 *
 * Both are pure so the thresholds can be tested rather than eyeballed. The
 * numbers below are the whole policy:
 */

import type { LifecycleStage } from "@/lib/team-roster";

/**
 * Days without a posted deal before an active agent counts as going quiet.
 *
 * Thirty rather than fourteen: the roster's own alerts already nudge at 14 days
 * of inactivity, and a list that repeats a nudge you have seen is a list you
 * stop reading. This is the slower, more serious signal — somebody who was
 * selling and has stopped.
 */
export const QUIET_AFTER_DAYS = 30;

/**
 * Stages that mean "cannot sell yet". Deliberately not `!== "active"`:
 * `inactive` and `terminated` are settled states, not people waiting on you,
 * and `at_risk` is somebody who IS selling and belongs in the other list.
 */
const PRE_ACTIVE: LifecycleStage[] = ["onboarding", "licensed", "contracted"];

/** Just the fields these two decisions read. */
export type NeedsYouRow = {
  id: string;
  stage: LifecycleStage;
  status: string;
  days_since_sale: number | null;
  missing?: string[] | null;
  policies_count?: number | null;
};

/**
 * Agents who cannot sell yet, and what each is waiting on.
 *
 * `missing` comes from the same completeness the agent sees on their own
 * profile, so the owner chasing them and the agent being chased are reading
 * one list rather than two that disagree.
 */
export function gettingReady<T extends NeedsYouRow>(rows: T[]): T[] {
  return rows.filter(
    (r) => r.status !== "terminated" && r.status !== "imported" && PRE_ACTIVE.includes(r.stage),
  );
}

/**
 * Agents who were selling and have gone quiet.
 *
 * Requires a sale to have happened at all: somebody who has never sold is not
 * "slipping", they are still getting ready, and putting them here would double
 * -count them into both lists and make neither trustworthy. `days_since_sale`
 * is null for them, which is why the null check is not merely defensive.
 */
export function goingQuiet<T extends NeedsYouRow>(rows: T[], afterDays = QUIET_AFTER_DAYS): T[] {
  return rows.filter(
    (r) =>
      r.status === "active" &&
      !PRE_ACTIVE.includes(r.stage) &&
      r.stage !== "terminated" &&
      r.days_since_sale != null &&
      r.days_since_sale >= afterDays,
  );
}

/**
 * Longest-quiet first. The person who stopped selling three months ago needs
 * the call more than the one who stopped last week.
 */
export function byQuietest<T extends NeedsYouRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (b.days_since_sale ?? 0) - (a.days_since_sale ?? 0));
}

/** Least complete first — whoever is furthest from selling needs the most help. */
export function byLeastReady<T extends NeedsYouRow & { completion_pct?: number | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.completion_pct ?? 0) - (b.completion_pct ?? 0));
}
