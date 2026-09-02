/**
 * Carriers the agency is already writing, but has never set up here.
 *
 * An imported book names carriers the agency never configured. Those policies
 * still pay — provisionally, off the agent's agency position — but until the
 * carrier exists in the directory nothing prices them on the carrier's own
 * schedule. The owner had no way to see that list; it lived only in server logs
 * and a hidden issues table. This is that list, ordered by how much premium is
 * riding on it.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getMyPrimaryOrgId } from "@/lib/org-guard";

export type SuggestedCarrier = {
  carrierId: string;
  name: string;
  policies: number;
  annualPremium: number;
  agents: number;
};

export const listSuggestedCarriers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return [] as SuggestedCarrier[];

    const [{ data: configured }, { data: policies }] = await Promise.all([
      supabase.from("org_carriers").select("carrier_id").eq("organization_id", orgId),
      supabase
        .from("policies")
        .select("carrier_id, agent_id, annual_premium, monthly_premium, carriers(name)")
        .eq("organization_id", orgId)
        .not("carrier_id", "is", null),
    ]);

    const have = new Set(((configured ?? []) as any[]).map((c) => c.carrier_id).filter(Boolean));

    const byCarrier = new Map<string, SuggestedCarrier & { _agents: Set<string> }>();
    for (const p of (policies ?? []) as any[]) {
      if (!p.carrier_id || have.has(p.carrier_id)) continue;
      const entry =
        byCarrier.get(p.carrier_id) ??
        {
          carrierId: p.carrier_id,
          name: p.carriers?.name ?? "Carrier",
          policies: 0,
          annualPremium: 0,
          agents: 0,
          _agents: new Set<string>(),
        };
      entry.policies += 1;
      // An imported row sometimes carries only the monthly figure; annualising
      // it keeps the ranking honest rather than reading as zero premium.
      entry.annualPremium +=
        Number(p.annual_premium ?? 0) || Number(p.monthly_premium ?? 0) * 12 || 0;
      if (p.agent_id) entry._agents.add(p.agent_id);
      byCarrier.set(p.carrier_id, entry);
    }

    return Array.from(byCarrier.values())
      .map(({ _agents, ...rest }) => ({ ...rest, agents: _agents.size }))
      .sort((a, b) => b.annualPremium - a.annualPremium) as SuggestedCarrier[];
  });
