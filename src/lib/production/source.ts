/**
 * What "production" means, decided once.
 *
 * Every screen that answers "how much did they write" reads this, and until
 * this module existed each answered separately.
 *
 * ── The rule ──
 *
 *   Production = SUM(annual_premium) over `production_date`,
 *                for policies whose status counts.
 *
 * ── The date ──
 *
 * `policies.production_date`, added by 20260814250000: `effective_date` when
 * it precedes `posted_at`, and `posted_at` otherwise.
 *
 * It exists because `posted_at` is right for a deal posted through the product
 * and nonsense for an imported one. Two import paths stamp
 * `posted_at = now()`, so an agency importing four hundred policies written
 * over three years got four hundred policies dated the afternoon of the
 * import: every one of those months read zero on the leaderboard while the
 * book of business — which has no date window — showed them correctly the
 * whole time. That is the contradiction this repairs.
 *
 * A policy whose effective date comes AFTER it was posted is an ordinary
 * forward-dated sale and keeps `posted_at`. Windowing those on effective_date
 * is the separate bug that made the dashboard chart disagree with the tiles
 * above it; the rule only ever moves a date backwards, so it cannot return.
 *
 * ── Which statuses count ──
 *
 * A policy that was withdrawn, never taken, or that the carrier does not write
 * is not production: no business was placed and none ever will be. Those three
 * are excluded everywhere.
 *
 * Everything else counts, including lapsed and cancelled. Those policies were
 * genuinely written — the premium was real and the commission was advanced —
 * and quietly netting them out of production would make production and
 * retention impossible to reconcile. Retention is the separate number for what
 * survived, with its own screen.
 *
 * Pure, so the definition can be exercised without a database, and so no
 * caller can drift from it by accident.
 */

export type ProductionRow = {
  annual_premium?: number | string | null;
  /** The canonical date. See the header. */
  production_date?: string | null;
  /**
   * Read only as a fallback for a row loaded before 20260814250000 applied.
   * Never preferred over `production_date`, and never over `posted_at` for a
   * forward-dated sale — the migration already decided that.
   */
  posted_at?: string | null;
  effective_date?: string | null;
  agent_id?: string | null;
  status?: string | null;
};

export type Tally = {
  premium: number;
  policies: number;
  /** Of that premium, how much is on the books. */
  placed: number;
};

export const ZERO_TALLY: Tally = { premium: 0, policies: 0, placed: 0 };

/**
 * The column every production window filters on.
 *
 * Exported as a string so a server function can name it in a PostgREST filter
 * and a check script can assert that nothing filters on anything else.
 */
export const PRODUCTION_DATE_COLUMN = "production_date" as const;

/**
 * Statuses that are not production, and never will be.
 *
 * `withdrawn` — the application was pulled before it was placed.
 * `not_taken`  — issued, and the client declined to take it.
 * `carrier_na` — the carrier does not write this; there is no policy.
 *
 * Deliberately NOT here: `lapsed` and `cancelled`. Those were placed, the
 * premium was real and the commission was advanced. Netting them out would
 * make production and retention impossible to reconcile.
 */
export const NON_PRODUCTION_STATUSES = ["withdrawn", "not_taken", "carrier_na"] as const;

/** Does this policy count towards production at all? */
export function countsAsProduction(row: ProductionRow): boolean {
  const s = row.status;
  if (!s) return true;
  return !(NON_PRODUCTION_STATUSES as readonly string[]).includes(s);
}

/**
 * Placed premium: production that actually made it onto the books.
 *
 * A separate figure from production, and both are wanted side by side — the
 * gap between them is how much of what somebody wrote is still standing.
 */
export const PLACED_STATUSES = ["active", "issued_not_paid"] as const;

export function isPlaced(row: ProductionRow): boolean {
  return (PLACED_STATUSES as readonly string[]).includes(row.status ?? "");
}

/**
 * When a policy counted as production.
 *
 * Null for a row with no `posted_at`, which is not zero: an unposted policy is
 * not production yet, and treating a missing date as the epoch would park it
 * in whatever the earliest bucket happens to be.
 */
export function productionDate(row: ProductionRow): string | null {
  // `posted_at` is the fallback for a row read before the column existed, not
  // an alternative definition: the migration's rule is already baked into
  // `production_date` for every row that has one.
  return row.production_date ?? row.posted_at ?? null;
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
  // An ineligible status is in no window: it is not production at any date.
  if (!countsAsProduction(row)) return false;
  const d = productionDate(row);
  if (!d) return false;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

/** Total premium across rows, with no windowing. Ineligible rows count zero. */
export function sumPremium(rows: ProductionRow[]): number {
  return rows.reduce((acc, r) => acc + (countsAsProduction(r) ? premiumOf(r) : 0), 0);
}

/** Premium that actually placed, for the figure beside production. */
export function sumPlaced(rows: ProductionRow[]): number {
  return rows.reduce((acc, r) => acc + (isPlaced(r) ? premiumOf(r) : 0), 0);
}

/**
 * Placed premium as a share of production.
 *
 * Null rather than zero when nothing was produced: a person who wrote nothing
 * has no retention rate, and drawing 0% would read as "everything lapsed".
 */
export function placementRate(rows: ProductionRow[]): number | null {
  const produced = sumPremium(rows);
  if (produced <= 0) return null;
  return sumPlaced(rows) / produced;
}

/** Premium and policy count together, which is what every KPI tile wants. */
export function tally(rows: ProductionRow[]): Tally {
  return rows.filter(countsAsProduction).reduce<Tally>(
    (acc, r) => ({
      premium: acc.premium + premiumOf(r),
      policies: acc.policies + 1,
      placed: acc.placed + (isPlaced(r) ? premiumOf(r) : 0),
    }),
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
    if (!countsAsProduction(r)) continue;
    const prev = out.get(id) ?? { ...ZERO_TALLY };
    out.set(id, {
      premium: prev.premium + premiumOf(r),
      policies: prev.policies + 1,
      placed: prev.placed + (isPlaced(r) ? premiumOf(r) : 0),
    });
  }
  return out;
}
