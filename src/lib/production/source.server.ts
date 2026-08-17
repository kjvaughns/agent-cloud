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
    // ── A failed read is not zero production ──────────────────────────────
    //
    // This returned `[]` here, and the comment claimed that was honest because
    // nothing had been read. It is not honest, because nothing renders it as
    // "nothing was read" — the leaderboard draws `$0 ALP · 0 policies written`,
    // the dashboard draws zeros, and every one of those is a statement about
    // the agency's business rather than about the query.
    //
    // So a broken read and a genuinely quiet month were indistinguishable on
    // screen, which is exactly the position somebody is in when they say "it
    // still shows 0" and there is nothing to look at. Worse, the error object
    // was discarded, so the server logs were empty too.
    //
    // Throwing is the same choice `resolveCompensation` makes about a
    // percentage it cannot resolve: stopping is better than answering with a
    // number nobody chose. The caller's query fails, the screen shows its error
    // state, and the reason is in the logs.
    const e = first.error as { code?: string; message?: string; details?: string } | null;
    console.error("[production] read failed", {
      column: PRODUCTION_DATE_COLUMN,
      code: e?.code,
      message: e?.message,
      details: e?.details,
    });
    throw new Error(
      `Could not read production: ${e?.message ?? "unknown error"}${e?.code ? ` (${e.code})` : ""}`,
    );
  }

  // The column is genuinely absent — the migration has not been applied here —
  // so `posted_at` stands in. Logged rather than silent: this is a temporary
  // state, and one that has been mistaken for the code being wrong.
  console.warn("[production] production_date is missing; windowing on posted_at instead");
  const second = await build("posted_at");
  if (second.error) {
    const e = second.error as { code?: string; message?: string } | null;
    console.error("[production] fallback read failed", { code: e?.code, message: e?.message });
    throw new Error(`Could not read production: ${e?.message ?? "unknown error"}`);
  }
  return second.data ?? [];
}
