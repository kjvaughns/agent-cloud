/**
 * Reading production while `production_date` is still pending.
 *
 * Migrations here are applied by hand, so there is a window between this code
 * shipping and 20260814250000 being applied. In that window PostgREST does not
 * know the column, and a filter naming it fails the whole request with 42703 —
 * not a missing field, an error. Every production figure on the dashboard, the
 * leaderboard and the team page would read zero, which is a far worse bug than
 * the one this is fixing.
 *
 * So: run the query against `production_date`; if the column is not there yet,
 * run it again against `posted_at`. The fallback is exactly today's behaviour,
 * which is right for posted deals and wrong for imported books — the same
 * trade the product already lives with, held for a few hours rather than
 * forever.
 *
 * `select("*")` at the call sites for the same reason: naming a column that
 * does not exist in the projection is the same 42703.
 *
 * One helper rather than a try/catch at each of the five call sites, so the
 * fallback cannot be right in four places and forgotten in the fifth. When the
 * migration is applied everywhere this can be deleted and the call sites can
 * name the column directly.
 */

import { PRODUCTION_DATE_COLUMN } from "./source";

/** Postgres `undefined_column`, which is how PostgREST reports it. */
function isMissingColumn(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "42703") return true;
  // PostgREST does not always pass the code through on embedded selects.
  return typeof e.message === "string" && /production_date/.test(e.message);
}

type Result<T> = { data: T[] | null; error: unknown };

/**
 * Run a production query, falling back to `posted_at` if the column is pending.
 *
 * `build` takes the column to window on and returns the finished query, so the
 * caller keeps its own filters, joins and limits and only the date column
 * varies.
 */
export async function selectProduction<T>(
  build: (dateColumn: string) => PromiseLike<Result<T>>,
): Promise<T[]> {
  const first = await build(PRODUCTION_DATE_COLUMN);
  if (!first.error) return first.data ?? [];
  if (!isMissingColumn(first.error)) {
    // A real failure — permissions, a bad range — must not be silently retried
    // into a different answer. Empty is what these call sites already did with
    // a failed read, and it is honest: nothing was read.
    return [];
  }
  const second = await build("posted_at");
  return second.data ?? [];
}
