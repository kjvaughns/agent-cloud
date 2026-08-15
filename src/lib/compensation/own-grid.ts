/**
 * An agency's own grid rows shadow the shared defaults.
 *
 * A carrier can carry two sets of `commission_grids` rows for the same
 * products: the shared library defaults (`organization_id is null`) and the
 * agency's own (`organization_id = the org`). Saving from the editor writes
 * the agency's own set and — correctly — cannot delete the shared one, which
 * every other agency reads.
 *
 * So a carrier whose grid started life as the shared default ends up with both
 * sets after the first save, and every reader that took the union showed the
 * old shared rates alongside the edited ones. From the owner's side that reads
 * as "Save grid did nothing": the numbers they typed are in the database, and
 * the screen still shows the carrier's stock figures.
 *
 * The rule is per carrier, not per row: once an agency has authored anything
 * for a carrier, that authored grid is the grid. Falling back row by row would
 * resurrect a product the agency deliberately removed.
 */
export function preferOwnGridRows<T extends { carrier_id?: string | null; organization_id?: string | null }>(
  rows: T[],
): T[] {
  const ownedCarriers = new Set<string>();
  for (const r of rows) {
    if (r.organization_id) ownedCarriers.add(String(r.carrier_id ?? ""));
  }
  if (!ownedCarriers.size) return rows;
  return rows.filter((r) => r.organization_id || !ownedCarriers.has(String(r.carrier_id ?? "")));
}
