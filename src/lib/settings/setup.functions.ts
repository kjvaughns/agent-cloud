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

/**
 * The five things an owner is asked at the top of Agency settings.
 *
 * Coarser than the contracting checklist on purpose: this answers "can my
 * agents use this yet", and each unfinished line names the tab that fixes it.
 * It reuses the same facts the checklist reads, so the strip and the list
 * cannot disagree about whether the agency is ready.
 */
export const getAgencySetupProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return { available: false as const, items: [] };

    const [{ data: org }, { data: levels }, { data: carriers }, { data: methods }] =
      await Promise.all([
        supabase.from("organizations").select("name, logo_url, accent_color").eq("id", orgId).limit(1),
        supabase.from("agency_levels").select("id, base_pct").eq("organization_id", orgId).eq("active", true),
        supabase.from("org_carriers").select("*").eq("organization_id", orgId),
        supabase.from("org_carrier_methods").select("id").eq("organization_id", orgId),
      ]);

    const orgRow = (org ?? [])[0] as any;
    const levelRows = (levels ?? []) as any[];
    const carrierRows = (carriers ?? []) as any[];
    const enabled = carrierRows.filter((c) => c.enabled !== false);

    const profileDone = Boolean(orgRow?.name) && Boolean(orgRow?.logo_url);
    const levelsDone = levelRows.length > 0 && levelRows.every((l) => l.base_pct != null);
    const carrierDone = enabled.length > 0;
    const methodDone = ((methods ?? []) as any[]).length > 0;
    const advancesDone =
      carrierDone && enabled.every((c) => Boolean(c.default_advance_option));
    const readyForAgents =
      profileDone && levelsDone && carrierDone && methodDone && advancesDone &&
      enabled.some((c) => c.visible_to_agents !== false);

    const items = [
      {
        id: "profile",
        label: "Agency profile complete",
        done: profileDone,
        tab: "general",
        missing: !orgRow?.name
          ? "Your agency still needs a name."
          : "Add a logo so your agents see your brand, not ours.",
      },
      {
        id: "levels",
        label: "Levels created",
        done: levelsDone,
        tab: "levels",
        missing: levelRows.length === 0
          ? "No positions yet, so nobody has a rung to be paid from."
          : "One or more positions have no base percentage.",
      },
      {
        id: "carriers",
        label: "At least one carrier configured",
        done: carrierDone,
        tab: "carriers",
        missing: carrierRows.length === 0
          ? "No carriers added yet."
          : "Every carrier you have added is switched off.",
      },
      {
        id: "method",
        label: "Contracting method ready",
        done: methodDone && advancesDone,
        tab: "carriers",
        missing: !methodDone
          ? "No carrier has a submission method, so staff have no route to send a contract."
          : "One or more active carriers have no advance option chosen.",
      },
      {
        id: "ready",
        label: "Agency ready for agents",
        done: readyForAgents,
        tab: "contracting",
        missing: "Finish the steps above, and make at least one carrier visible to agents.",
      },
    ];

    return { available: true as const, items };
  });

