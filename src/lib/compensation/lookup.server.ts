import {
  resolveCompensation,
  carrierConfiguration,
  isAdvanceOption,
  type AgencyLevel,
  type LevelCarrierMapping,
  type ContractOverride,
  type AgencyCarrier,
  type Resolution,
} from "@/lib/compensation/resolve";

/**
 * Fetching the four facts the resolver needs, and nothing else.
 *
 * The decision lives in `resolve.ts` and is pure so it can be tested against
 * every edge without a database. This is the boring half: read the agent's
 * rung, the level-and-carrier mapping, any active contract override, and the
 * agency's carrier setup, then hand all four over.
 *
 * Kept deliberately separate so that adding a source later means changing one
 * query here and one branch there, rather than hunting for the six places a
 * percentage used to be looked up.
 */

type Client = any;

/** Everything the resolver needs for one agent on one carrier. */
export async function loadResolutionInputs(
  supabase: Client,
  agentId: string,
  orgCarrierId: string,
): Promise<{
  level: AgencyLevel | null;
  mapping: LevelCarrierMapping | null;
  contract: ContractOverride | null;
  carrier: AgencyCarrier | null;
  carrierId: string | null;
}> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_level_id, organization_id")
    .eq("id", agentId)
    .maybeSingle();

  const { data: oc } = await supabase
    .from("org_carriers")
    // select("*") rather than naming the columns: they arrive with
    // 20260814210000, and PostgREST rejects the entire select with 42703 when
    // one is missing. Every read below tolerates absence.
    .select("*")
    .eq("id", orgCarrierId)
    .maybeSingle();

  const [levelRes, mappingRes, contractRes] = await Promise.all([
    profile?.agency_level_id
      ? supabase
          .from("agency_levels")
          .select("id, name, base_pct, sort_order, can_invite, active")
          .eq("id", profile.agency_level_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    profile?.agency_level_id
      ? supabase
          .from("agency_level_carrier_mappings")
          .select("*")
          .eq("agency_level_id", profile.agency_level_id)
          .eq("org_carrier_id", orgCarrierId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    oc?.carrier_id
      ? supabase
          .from("agent_commission_levels")
          .select("*")
          .eq("agent_id", agentId)
          .eq("carrier_id", oc.carrier_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    level: (levelRes.data as AgencyLevel) ?? null,
    mapping: (mappingRes.data as LevelCarrierMapping) ?? null,
    // The legacy row is keyed on carrier_id, not org_carrier_id. Reshaped here
    // rather than in the resolver so the pure module never has to know that
    // the old table and the new one disagree about what identifies a carrier.
    contract: contractRes.data
      ? {
          agent_id: agentId,
          org_carrier_id: orgCarrierId,
          assigned_pct: (contractRes.data as any).assigned_pct ?? null,
          advance_option: isAdvanceOption((contractRes.data as any).advance_option)
            ? (contractRes.data as any).advance_option
            : null,
          status: (contractRes.data as any).status ?? "active",
        }
      : null,
    carrier: oc
      ? {
          org_carrier_id: oc.id,
          enabled: oc.enabled !== false,
          visible_to_agents: oc.visible_to_agents !== false,
          requestable_by_agents: oc.requestable_by_agents !== false,
          available_for_post_deal: oc.available_for_post_deal !== false,
          default_advance_option: isAdvanceOption(oc.default_advance_option)
            ? oc.default_advance_option
            : null,
        }
      : null,
    carrierId: oc?.carrier_id ?? null,
  };
}

/** The one call every consumer makes. */
export async function resolveForAgent(
  supabase: Client,
  agentId: string,
  orgCarrierId: string,
): Promise<Resolution> {
  const inputs = await loadResolutionInputs(supabase, agentId, orgCarrierId);
  return resolveCompensation({ agentId, orgCarrierId, ...inputs });
}

/**
 * Which of an agency's carriers are set up well enough to offer agents.
 *
 * One batched pass rather than a resolution per carrier per level: an agency
 * with 30 carriers and 6 levels would otherwise be 180 round trips to paint a
 * settings page.
 */
export async function agencyCarrierConfiguration(
  supabase: Client,
  orgId: string,
): Promise<Map<string, { configured: boolean; reasons: string[] }>> {
  const [{ data: carriers }, { data: levels }, { data: mappings }] = await Promise.all([
    supabase
      .from("org_carriers")
      // Same pending-column tolerance as above.
      .select("*")
      .eq("organization_id", orgId),
    supabase
      .from("agency_levels")
      .select("id, name, base_pct, sort_order, can_invite, active")
      .eq("organization_id", orgId)
      .eq("active", true),
    supabase.from("agency_level_carrier_mappings").select("*").eq("organization_id", orgId),
  ]);

  const activeLevels = (levels ?? []) as AgencyLevel[];
  const maps = (mappings ?? []) as LevelCarrierMapping[];
  const out = new Map<string, { configured: boolean; reasons: string[] }>();

  for (const c of (carriers ?? []) as any[]) {
    out.set(
      c.id,
      carrierConfiguration(
        {
          org_carrier_id: c.id,
          enabled: c.enabled !== false,
          visible_to_agents: c.visible_to_agents !== false,
          requestable_by_agents: c.requestable_by_agents !== false,
          available_for_post_deal: c.available_for_post_deal !== false,
          default_advance_option: isAdvanceOption(c.default_advance_option)
            ? c.default_advance_option
            : null,
        },
        activeLevels,
        maps,
      ),
    );
  }
  return out;
}

/**
 * The upline chain, each link with its own resolved percentage.
 *
 * Walks the whole hierarchy rather than the five levels the old calculator
 * stopped at — an agency six deep simply did not pay its owner. Depth-capped
 * and cycle-guarded because `profiles.upline_id` is a plain self-reference
 * that nothing in the database stops from looping.
 *
 * A link whose compensation does not resolve carries a null percentage rather
 * than being dropped: the override maths skips them, which is different from
 * treating them as zero, and the distinction decides whether the person above
 * them earns their own spread or somebody else's too.
 */
export async function loadUplineChain(
  supabase: Client,
  agentId: string,
  orgCarrierId: string,
  maxDepth = 25,
): Promise<{ agentId: string; pct: number | null }[]> {
  const chain: { agentId: string; pct: number | null }[] = [];
  const seen = new Set<string>([agentId]);
  let cursor = agentId;

  for (let depth = 0; depth < maxDepth; depth++) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("upline_id")
      .eq("id", cursor)
      .maybeSingle();
    const uplineId: string | undefined = profile?.upline_id ?? undefined;
    if (!uplineId || seen.has(uplineId)) break;
    seen.add(uplineId);

    const resolution = await resolveForAgent(supabase, uplineId, orgCarrierId);
    chain.push({ agentId: uplineId, pct: resolution.ok ? resolution.pct : null });
    cursor = uplineId;
  }
  return chain;
}

/**
 * Record — or clear — why a policy could not be paid.
 *
 * The old calculator wrote a console warning and queued the policy silently.
 * Nobody reads a server log, so an agent posted a deal, saw nothing, and had
 * no way to find out why. One open issue per policy, upserted, so a retry
 * refreshes the reason instead of stacking another copy of it.
 */
export async function recordSetupIssue(
  supabase: Client,
  opts: {
    policyId: string;
    agentId: string;
    orgId: string | null;
    orgCarrierId: string | null;
    resolution: Resolution;
  },
): Promise<void> {
  const { policyId, agentId, orgId, orgCarrierId, resolution } = opts;

  // Wrapped, and deliberately silent to the caller. This table arrives with
  // 20260814210000 and code ships before migrations apply here — but more than
  // that, recording *why* a deal could not be paid must never be the thing
  // that stops the deal being recorded. The policy is already written by the
  // time this runs.
  try {
    if (resolution.ok) {
      await supabase
        .from("commission_setup_issues")
        .update({ resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("policy_id", policyId)
        .is("resolved_at", null);
      return;
    }

    await supabase.from("commission_setup_issues").upsert(
      {
        policy_id: policyId,
        agent_id: agentId,
        organization_id: orgId,
        org_carrier_id: orgCarrierId,
        failures: resolution.failures,
        messages: resolution.messages,
        resolved_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "policy_id" },
    );
  } catch (e: any) {
    console.error("[compensation] could not record setup issue:", e?.message);
  }
}
