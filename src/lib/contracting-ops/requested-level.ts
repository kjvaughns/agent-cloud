/**
 * What level a request is asked at, when nobody typed one in.
 *
 * A request created by an agent — "I have a writing number", "Request
 * contracting" — carried no level at all: `requested_comp_level_id` and
 * `requested_advance_level` were both null on every self-serve request, so the
 * queue said nothing about what was being asked for and the person working it
 * had to go and look up the agent's position by hand.
 *
 * The answer already exists in three joined facts: the agent's agency position
 * (`profiles.agency_level_id`), what that position maps to on this carrier
 * (`agency_level_carrier_mappings`), and the carrier's own ladder
 * (`carrier_comp_levels`). This reads them in that order and stops at the first
 * honest answer.
 *
 * It deliberately does NOT guess. When the agency has not mapped this position
 * to a level on this carrier, the request records the position's own percentage
 * as text and leaves the level id null — the same rule Levels & Positions
 * follows, and for the same reason: handing a request the nearest unrelated
 * contract is worse than saying "this is an 80% position" and letting the
 * person who knows the carrier fill in the rung.
 */
export type RequestedLevel = {
  /** FK into `carrier_comp_levels`, only when the mapping names a real rung. */
  requestedCompLevelId: string | null;
  /** Human label: the carrier's level name, or the position percentage. */
  requestedAdvanceLevel: string | null;
};

const EMPTY: RequestedLevel = { requestedCompLevelId: null, requestedAdvanceLevel: null };

export async function resolveRequestedLevel(
  client: any,
  args: { agentId: string; orgId: string | null; orgCarrierId: string | null },
): Promise<RequestedLevel> {
  const { agentId, orgId, orgCarrierId } = args;
  if (!orgId || !orgCarrierId) return EMPTY;

  const { data: profile } = await client
    .from("profiles")
    .select("agency_level_id")
    .eq("id", agentId)
    .maybeSingle();

  const levelId = (profile?.agency_level_id as string | null) ?? null;
  if (!levelId) return EMPTY;

  const [{ data: position }, { data: mapping }] = await Promise.all([
    client.from("agency_levels").select("name, base_pct").eq("id", levelId).maybeSingle(),
    client
      .from("agency_level_carrier_mappings")
      .select("carrier_level_name, carrier_pct")
      .eq("agency_level_id", levelId)
      .eq("org_carrier_id", orgCarrierId)
      .maybeSingle(),
  ]);

  // The position's own percentage is the fallback label, and it is a real
  // answer rather than a placeholder: it is what the agent is paid at today.
  const basePct = position?.base_pct == null ? null : Number(position.base_pct);
  const fallback = basePct != null && Number.isFinite(basePct)
    ? `${basePct}%`
    : (position?.name ?? null);

  const mappedName = String(mapping?.carrier_level_name ?? "").trim();
  if (!mappedName) return { requestedCompLevelId: null, requestedAdvanceLevel: fallback };

  // Case-insensitive, because a carrier's ladder is typed by hand in one place
  // and mapped by hand in another. A name that matches nothing still travels as
  // the label — the agency named that rung, so it is worth showing.
  const { data: compLevel } = await client
    .from("carrier_comp_levels")
    .select("id")
    .eq("org_carrier_id", orgCarrierId)
    .ilike("level_name", mappedName)
    .maybeSingle();

  return {
    requestedCompLevelId: (compLevel?.id as string | null) ?? null,
    requestedAdvanceLevel: mappedName,
  };
}
