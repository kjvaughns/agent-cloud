/**
 * The carrier catalogue, in the shape `matchCarrier` wants.
 *
 * Built in one place because it is built from three: the `carriers` table, the
 * `naic_code` column and the `carrier_aliases` table, and the last two arrive
 * with migrations applied by hand. Every caller has to degrade the same way —
 * naming a column the database does not have yet fails the whole select rather
 * than just that field, so an alias table that has not landed must cost the
 * aliases and nothing else.
 *
 * `admin-import.functions.ts` grew its own copy of this first. This is that
 * copy, moved somewhere the import page can reach it too.
 */

import type { CarrierRecord } from "./carrier-match";

/**
 * @param db Any Supabase-shaped client. The caller decides whether that is the
 *   service-role client or the signed-in user's — the carrier catalogue is
 *   agency-wide reference data either way.
 */
export async function buildCarrierIndex(db: any): Promise<CarrierRecord[]> {
  // `*` rather than a column list: `naic_code` is a pending migration.
  const { data: carrierRows } = await db.from("carriers").select("*");

  let aliasRows: any[] = [];
  try {
    const { data } = await db.from("carrier_aliases").select("carrier_id, alias");
    aliasRows = data ?? [];
  } catch {
    // The alias table is pending. Names and NAIC codes still resolve.
    aliasRows = [];
  }

  const byCarrier = new Map<string, string[]>();
  for (const a of aliasRows) {
    const list = byCarrier.get(a.carrier_id) ?? [];
    list.push(a.alias);
    byCarrier.set(a.carrier_id, list);
  }

  return (carrierRows ?? []).map((c: any) => ({
    id: c.id as string,
    name: String(c.name ?? ""),
    naicCode: c.naic_code ?? null,
    aliases: byCarrier.get(c.id) ?? [],
  }));
}
