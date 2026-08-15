/**
 * The sale date: when the business was written.
 *
 * Production, the dashboard and the leaderboard all window on
 * `policies.production_date`. Until it could be set by hand, a policy typed in
 * today counted in today's month even when it was sold two years ago, so an
 * imported or hand-entered book made every past month read zero. This is the
 * one place that converts between the date input the agent sees (`YYYY-MM-DD`)
 * and the timestamp the column holds.
 */

/**
 * Midday UTC, deliberately.
 *
 * Midnight in a `date`-to-`timestamptz` cast lands in the previous day for
 * every timezone west of UTC, which would push a sale on the 1st into the
 * previous month for a US agency — the exact off-by-one-month error this
 * feature exists to remove. Midday cannot cross a day boundary anywhere.
 */
export function saleDateToTimestamp(value: string): string {
  return new Date(`${value}T12:00:00Z`).toISOString();
}

/** A timestamp back to the `YYYY-MM-DD` a date input expects. */
export function timestampToSaleDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** Today, for a date input's value and its `max` — the future is not production. */
export function todaySaleDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "counts in March 2025", for the hint beside the field. */
export function saleMonthLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
