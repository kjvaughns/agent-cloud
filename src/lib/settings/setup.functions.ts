/**
 * Where an agency's contracting setup actually stands.
 *
 * Every piece of this has existed and been reachable: Carriers, Levels &
 * Positions, Comp Grids, How contracting works. What did not exist was
 * anything saying which to do first, or whether the result works — so an owner
 * could set up three carriers, never choose an advance option, and find out
 * weeks later when a posted deal earned nothing.
 *
 * The verdict comes from `agencyCarrierConfiguration`, which was written for
 * exactly this ("so the owner's setup screen can say which levels are
 * unresolved") and had no caller. Reusing it is what stops this screen and Post
 * a Deal disagreeing about whether a carrier can pay.
 *
 * Read-only. Three selects and the pure evaluator; nothing here writes, and in
 * particular it does not call `recordSetupIssue`, which is for a deal that has
 * already been posted.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getMyPrimaryOrgId } from "@/lib/org-guard";
import { agencyCarrierConfiguration } from "@/lib/compensation/lookup.server";
import { evaluateSetup, progress, nextStep, isReady, type SetupFacts } from "./contracting-checklist";

type Ctx = { supabase: any; userId: string };

export const getContractingSetupStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) {
      return { available: false as const, steps: [], progress: { done: 0, total: 0, pct: 0 }, next: null, ready: false };
    }

    const [{ data: carriers }, { data: levels }, { data: grids }] = await Promise.all([
      // `select("*")` throughout: the five control columns arrive with
      // 20260814210000 and naming one PostgREST does not know fails the whole
      // select rather than omitting a field.
      supabase.from("org_carriers").select("*, carriers(name)").eq("organization_id", orgId),
      supabase
        .from("agency_levels")
        .select("id, name, base_pct, active")
        .eq("organization_id", orgId)
        .eq("active", true),
      supabase.from("commission_grids").select("carrier_id").eq("organization_id", orgId),
    ]);

    const configuration = await agencyCarrierConfiguration(supabase, orgId);

    const facts: SetupFacts = {
      carriers: ((carriers ?? []) as any[]).map((c) => ({
        id: c.id,
        carrier_id: c.carrier_id ?? null,
        name: c.carriers?.name ?? "Carrier",
        // `!== false` throughout: before the migration these columns are
        // absent, and absent must read as the permissive default the product
        // has always had rather than as "switched off".
        enabled: c.enabled !== false,
        visible_to_agents: c.visible_to_agents !== false,
        available_for_post_deal: c.available_for_post_deal !== false,
        // Deliberately NOT defaulted. "Not chosen" is a real state and is the
        // one the checklist exists to surface; defaulting it to as-earned
        // would be exactly the silent assumption the resolver refuses to make.
        default_advance_option: c.default_advance_option ?? null,
      })),
      levels: ((levels ?? []) as any[]).map((l) => ({
        id: l.id,
        name: l.name,
        base_pct: l.base_pct ?? null,
      })),
      configuration,
      carriersWithGrids: new Set(
        ((grids ?? []) as any[]).map((g) => String(g.carrier_id)).filter(Boolean),
      ),
    };

    const steps = evaluateSetup(facts);
    return {
      available: true as const,
      steps,
      progress: progress(steps),
      next: nextStep(steps),
      ready: isReady(steps),
    };
  });
