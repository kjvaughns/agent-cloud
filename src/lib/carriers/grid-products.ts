/**
 * A carrier's real product names, from the comp grid.
 *
 * ── Why this is a module and not two copies ──
 *
 * "Which products does this carrier sell?" has two answers in the schema and
 * only one of them is any good. `org_carriers.product_types` is a free-text
 * list somebody typed into carrier setup, and it is empty for almost every
 * agency. `commission_grids.product_name` is the name each *rate row* is keyed
 * on — "Trendsetter Super", "FE Express" — and it is the only one that makes
 * the age bands, state exceptions and level columns reachable, because those
 * rows are what a deal is priced from.
 *
 * The Pipeline drawer learned to prefer the grid; Post a Deal did not, and
 * leaned on `getCarrierDealOptions` instead — a call that never matched a row
 * (it was handed a `carriers.id` where it wanted an `org_carriers.id`) and
 * failed into the generic eight-item catalogue without saying so. Two screens
 * asking the same question, one of them answering it, and the difference
 * invisible because the fallback looks like a real list of products.
 *
 * So both list functions call this. The next screen that needs a product
 * dropdown calls it too, rather than growing a third opinion.
 */

import { preferOwnGridRows } from "@/lib/compensation/own-grid";

/**
 * Grid product names for every carrier the agency can read, keyed on
 * `carriers.id`.
 *
 * ── A failed read is not "this carrier has no grid" ──
 *
 * This threw nothing and checked nothing before: a `commission_grids` error
 * left the map empty, and an empty map is indistinguishable on screen from an
 * agency that has never uploaded a grid — both draw the generic list. That is
 * the same shape of lie `selectProduction` used to tell when it answered a
 * broken query with `[]` and the leaderboard drew "$0".
 *
 * Both callers already throw when their own `org_carriers` read fails, so
 * throwing here matches the contract the surrounding function already has: the
 * dropdown shows its error state instead of a plausible wrong answer.
 */
export async function gridProductsByCarrier(
  supabase: any,
  orgId: string,
): Promise<Map<string, string[]>> {
  const { data, error } = await supabase
    .from("commission_grids")
    .select("carrier_id, product_name, organization_id")
    .or(`organization_id.eq.${orgId},organization_id.is.null`);
  if (error) {
    console.error("[grid-products] read failed", {
      orgId,
      code: (error as any)?.code,
      message: (error as any)?.message,
    });
    throw new Error(`Could not read the comp grid: ${(error as any)?.message ?? "unknown error"}`);
  }

  // The agency's own rows shadow the shared library per carrier — the same
  // rule pricing uses, so the dropdown cannot offer a product the rate lookup
  // has already decided to ignore.
  const byCarrier = new Map<string, Set<string>>();
  for (const row of preferOwnGridRows((data ?? []) as any[])) {
    const name = row.product_name ? String(row.product_name).trim() : "";
    if (!name) continue;
    const key = String(row.carrier_id ?? "");
    if (!key) continue;
    if (!byCarrier.has(key)) byCarrier.set(key, new Set());
    byCarrier.get(key)!.add(name);
  }

  const out = new Map<string, string[]>();
  for (const [carrierId, names] of byCarrier) {
    out.set(carrierId, [...names].sort((a, b) => a.localeCompare(b)));
  }
  return out;
}
