/**
 * What a carrier offers, and what a deal on it needs before it can be priced.
 *
 * ── Why this exists ──
 *
 * `commission_grids` has carried products and age bands since the first
 * schema, and Post a Deal has never read them. So an agent picked a product
 * from a free list that had nothing to do with what the agency configured, and
 * every deal priced at the agent's flat level percentage regardless of what
 * the carrier actually pays at that age.
 *
 * This returns the products the agency configured for one carrier, and which
 * of age, state and tobacco class that carrier's grid actually varies on —
 * derived from the grid rather than configured separately, because the grid is
 * what decides. A carrier with no age bands must not make an agent enter a
 * date of birth to satisfy a form.
 *
 * ── Read-only ──
 *
 * Three selects and two pure functions. Nothing here writes, and nothing here
 * decides a percentage: `resolveCompensation` does that, and is given the same
 * rows.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getMyPrimaryOrgId } from "@/lib/org-guard";
import { requirementsFor, type GridRow } from "@/lib/compensation/grid-rule";

type Ctx = { supabase: any; userId: string };

/**
 * Rows for one carrier, in the shape the selector wants.
 *
 * `select("*")`: `state_code` and `risk_class` arrive with 20260815070000, and
 * naming a column PostgREST does not know fails the whole select rather than
 * omitting the field. Before that migration both read as null, which is
 * exactly "applies everywhere" — today's behaviour.
 */
export async function loadGridRows(
  supabase: any,
  orgId: string,
  carrierId: string,
): Promise<GridRow[]> {
  const { data } = await supabase
    .from("commission_grids")
    .select("*")
    .eq("carrier_id", carrierId)
    .or(`organization_id.eq.${orgId},organization_id.is.null`);

  return ((data ?? []) as any[]).map((r) => ({
    id: String(r.id),
    levelName: r.level_name ?? null,
    productName: r.product_name ?? "",
    ageMin: r.age_group_min ?? null,
    ageMax: r.age_group_max ?? null,
    year1Pct: r.year_1_pct ?? null,
    years2to5Pct: r.years_2_5_pct ?? null,
    years6PlusPct: r.years_6_plus_pct ?? null,
    stateCode: r.state_code ?? null,
    riskClass: r.risk_class ?? null,
  }));
}

export const getCarrierDealOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orgCarrierId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) {
      return { available: false as const, products: [], needsAge: false, needsState: false, needsRisk: false };
    }

    // RLS-bound read: an agent asking about a carrier in another agency gets
    // nothing back rather than a shaped-but-empty answer.
    const { data: oc } = await supabase
      .from("org_carriers")
      .select("id, carrier_id, organization_id")
      .eq("id", data.orgCarrierId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!oc?.carrier_id) {
      return { available: false as const, products: [], needsAge: false, needsState: false, needsRisk: false };
    }

    // The carrier's own name for this agent's level. The grid is keyed on it,
    // not on the agency's label for the rung.
    const [{ data: contract }, { data: profile }] = await Promise.all([
      supabase
        .from("agent_commission_levels")
        .select("commission_level")
        .eq("agent_id", userId)
        .eq("carrier_id", oc.carrier_id)
        .maybeSingle(),
      supabase.from("profiles").select("agency_level_id").eq("id", userId).maybeSingle(),
    ]);

    let levelName: string | null = contract?.commission_level ?? null;
    if (!levelName && profile?.agency_level_id) {
      const { data: mapping } = await supabase
        .from("agency_level_carrier_mappings")
        .select("carrier_level_name")
        .eq("organization_id", orgId)
        .eq("agency_level_id", profile.agency_level_id)
        .eq("org_carrier_id", oc.id)
        .maybeSingle();
      levelName = mapping?.carrier_level_name ?? null;
    }

    const rows = await loadGridRows(supabase, orgId, oc.carrier_id);
    const req = requirementsFor(rows, levelName);

    return {
      available: true as const,
      carrierLevelName: levelName,
      /**
       * Empty is a legitimate answer, not an error. An agency with no grid
       * pays from the level percentage, and the form falls back to its own
       * product list rather than refusing to let anybody post a deal.
       */
      products: req.products,
      needsAge: req.needsAge,
      needsState: req.needsState,
      needsRisk: req.needsRisk,
    };
  });
