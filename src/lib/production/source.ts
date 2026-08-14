/**
 * What "production" means, decided once.
 *
 * Every screen in the product that answers "how much did they write" was
 * answering it separately, and one of them was answering it differently.
 *
 * ── The rule ──
 *
 *   Production = SUM(policies.annual_premium) over `posted_at`,
 *                with no status filter.
 *
 * Two halves, both deliberate.
 *
 * **The date is `posted_at`, not `effective_date`.** The live
 * `get_dashboard_metrics` (migration 20260715120000) windows on `posted_at`,
 * and so does the roster, the leaderboard and the scope rollup. A superseded
 * 2026-06-05 version of that function used `COALESCE(effective_date,
 * posted_at)` and called it `biz_date`; the July rewrite dropped it, but the
 * dashboard's production chart kept a hand-written copy of the old formula,
 * with a comment saying it matched the RPC. It had not matched since July.
 *
 * The consequence was visible and wrong: an agent posts a deal today with an
 * effective date next month. The KPI tiles count it today. The chart directly
 * beneath them puts it in next month's bucket — and if that is past the end of
 * the range, drops it entirely. Two numbers, one screen, same agent, same
 * window, disagreeing. A back-dated policy fell the other way.
 *
 * Whether `effective_date` is the *better* business date is a real question
 * and not this module's to answer. What is not defensible is one screen using
 * each. If it ever changes, it changes here and every surface moves together.
 *
 * **No status filter.** A policy counts whatever became of it. Production is
 * what somebody wrote, not what survived — retention is a separate number with
 * its own screen, and quietly netting lapses out of production would make the
 * two impossible to reconcile. `get_dashboard_metrics` has always worked this
 * way; the book of business totals the same way for the same reason.
 *
 * Pure, so the definition can be exercised without a database, and so no
 * caller can drift from it by accident.
 */

export type ProductionRow = {
  annual_premium?: number | string | null;
  posted_at?: string | null;
  /** Present on some reads. Deliberately unused — see the note above. */
  effective_date?: string | null;
  agent_id?: string | null;
};

export type Tally = { premium: number; policies: number };

export const ZERO_TALLY: Tally = { premium: 0, policies: 0 };

/**
 * The column every production window filters on.
 *
 * Exported as a string so a server function can name it in a PostgREST filter
 * and a check script can assert that nothing filters on anything else.
 */
export const PRODUCTION_DATE_COLUMN = "posted_at" as const;

/**
 * When a policy counted as production.
 *
 * Null for a row with no `posted_at`, which is not zero: an unposted policy is
 * not production yet, and treating a missing date as the epoch would park it
 * in whatever the earliest bucket happens to be.
 */
export function productionDate(row: ProductionRow): string | null {
  return row.posted_at ?? null;
}

/** One policy's contribution. Missing or unparseable premium is zero, not NaN. */
export function premiumOf(row: ProductionRow): number {
  const n = Number(row.annual_premium ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Is this policy inside the window?
 *
 * ISO strings compare correctly as strings when both carry a timezone, which
 * is how they are stored and how PostgREST returns them. A null bound is open
 * on that side; a row with no production date is never in range.
 *
 * The end is INCLUSIVE, matching the `.lte("posted_at", rangeEnd)` the
 * leaderboard and the scope rollup already send — a range whose end is the
 * last instant of a day must include that day.
 */
export function inWindow(row: ProductionRow, start: string | null, end: string | null): boolean {
  const d = productionDate(row);
  if (!d) return false;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

/** Total premium across rows, with no windowing. */
export function sumPremium(rows: ProductionRow[]): number {
  return rows.reduce((acc, r) => acc + premiumOf(r), 0);
}

/** Premium and policy count together, which is what every KPI tile wants. */
export function tally(rows: ProductionRow[]): Tally {
  return rows.reduce<Tally>(
    (acc, r) => ({ premium: acc.premium + premiumOf(r), policies: acc.policies + 1 }),
    { ...ZERO_TALLY },
  );
}

/** The same, restricted to a window. */
export function tallyInWindow(
  rows: ProductionRow[],
  start: string | null,
  end: string | null,
): Tally {
  return tally(rows.filter((r) => inWindow(r, start, end)));
}

/**
 * Per-agent totals, for a leaderboard or a roster column.
 *
 * Rows with no `agent_id` are skipped rather than pooled under a blank key —
 * an unattributed policy belongs to nobody, and a phantom leaderboard entry
 * is worse than a missing one.
 */
export function tallyByAgent(rows: ProductionRow[]): Map<string, Tally> {
  const out = new Map<string, Tally>();
  for (const r of rows) {
    const id = r.agent_id;
    if (!id) continue;
    const prev = out.get(id) ?? { ...ZERO_TALLY };
    out.set(id, { premium: prev.premium + premiumOf(r), policies: prev.policies + 1 });
  }
  return out;
}
