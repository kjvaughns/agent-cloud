/**
 * The gate in front of the three paid capabilities, and the counter behind it.
 *
 * `requireNovaPro` throws. That is right for `createAutomation`, where the
 * alternative is writing a row somebody has not paid for — but wrong for a
 * feature we want free users to try exactly once, because the answer there is
 * not yes-or-no, it is "yes, and this was your one".
 *
 * So: `checkNovaFeature` returns the decision, `consumeNovaTrial` records the
 * run. Two calls rather than one, deliberately — a feature that fails
 * partway should not have burned the trial, so the run is only recorded once
 * the work has actually produced something.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveAccess, GATED_IDS, type NovaFeature } from "@/lib/nova-features";

type Ctx = { supabase: any; userId: string };

const FeatureSchema = z.object({
  feature: z.enum(["lapse_scan", "compliance_screen", "review_prep"]),
});

/**
 * May this person use this feature, and on what basis?
 *
 * Exported as a plain function as well as a server function, because the
 * feature handlers themselves need to call it and one `createServerFn` calling
 * another does not carry the middleware context — the mistake that would have
 * made `createTasksForGridFindings` silently return nothing.
 */
export async function checkAccess(supabase: any, userId: string, feature: NovaFeature) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("nova_pro_status, created_at")
    .eq("id", userId)
    .maybeSingle();

  const status = (profile as any)?.nova_pro_status ?? null;

  // Subscribers never touch the usage table. Nothing to count, and no reason
  // to make a paid feature depend on a pending migration.
  if (status === "active" || status === "grace_period") {
    return resolveAccess({
      novaProStatus: status, runsUsed: 0,
      accountCreatedAt: null, asOf: new Date().toISOString(),
    });
  }

  let runsUsed = 0;
  let usageUnknown = false;
  try {
    const { count, error } = await (supabase as any)
      .from("nova_feature_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("feature", feature);
    if (error) usageUnknown = true;
    else runsUsed = count ?? 0;
  } catch {
    usageUnknown = true;
  }

  return resolveAccess({
    novaProStatus: status,
    runsUsed,
    accountCreatedAt: (profile as any)?.created_at ?? null,
    asOf: new Date().toISOString(),
    usageUnknown,
  });
}

/**
 * Record that the free run happened.
 *
 * Called by the feature *after* it has produced a result, not before. A scan
 * that fell over on a database error should not have cost somebody their one
 * look at their own book.
 *
 * Silent on failure, and that is consistent with the gate failing open: if the
 * table is not there, the run is not counted, and the worst case is a second
 * free run.
 */
export async function recordTrialRun(supabase: any, userId: string, feature: NovaFeature) {
  try {
    await (supabase as any)
      .from("nova_feature_usage")
      .insert({ user_id: userId, feature });
  } catch {
    // See above.
  }
}

/** The gate, for the client — so a panel can show the card before doing work. */
export const checkNovaFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FeatureSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    return checkAccess(supabase, userId, data.feature as NovaFeature);
  });

/**
 * Every gated feature's state at once.
 *
 * One round trip for the whole nav, so a locked-feature badge does not cost
 * three requests per page load.
 */
export const novaFeatureStates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const entries = await Promise.all(
      GATED_IDS.map(async (id) => [id, await checkAccess(supabase, userId, id)] as const),
    );
    return Object.fromEntries(entries) as Record<NovaFeature, Awaited<ReturnType<typeof checkAccess>>>;
  });

/**
 * Instrumentation.
 *
 * Fire-and-forget by design: an analytics write must never be able to fail a
 * render or block a click. The whole point of counting is to find the
 * placements that convert below the floor and delete them, and a counter that
 * can break the page it measures would not survive to do that.
 */
export const recordUpsellEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      placement: z.string().min(1).max(80),
      event: z.enum(["impression", "dismissal", "click", "conversion"]),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    try {
      await (supabase as any).from("upsell_events").insert({
        user_id: userId,
        placement: data.placement,
        event: data.event,
      });
    } catch {
      // Pending migration, or anything else. Never surfaced.
    }
    return { ok: true };
  });

/**
 * Conversion rate per placement, for deciding what to delete.
 *
 * Platform admins only, enforced by the table's own RLS rather than here — a
 * check in this handler would be a second opinion about a policy that already
 * exists, and two gates that can disagree is worse than one.
 */
export const upsellPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    try {
      const { data, error } = await (supabase as any)
        .from("upsell_events")
        .select("placement, event")
        .limit(50_000);
      if (error) return { placements: [], available: false };

      const by = new Map<string, { impressions: number; dismissals: number; clicks: number; conversions: number }>();
      for (const row of data ?? []) {
        const rec = by.get(row.placement) ?? { impressions: 0, dismissals: 0, clicks: 0, conversions: 0 };
        if (row.event === "impression") rec.impressions++;
        else if (row.event === "dismissal") rec.dismissals++;
        else if (row.event === "click") rec.clicks++;
        else if (row.event === "conversion") rec.conversions++;
        by.set(row.placement, rec);
      }

      const { shouldRetire } = await import("@/lib/nova-features");
      return {
        available: true,
        placements: [...by.entries()]
          .map(([id, s]) => ({
            id, ...s,
            rate: s.impressions ? s.conversions / s.impressions : 0,
            retire: shouldRetire(s),
          }))
          .sort((a, b) => b.impressions - a.impressions),
      };
    } catch {
      return { placements: [], available: false };
    }
  });
