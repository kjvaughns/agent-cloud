import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/**
 * "Start from my parent agency's setup."
 *
 * A sub agency created through an invite is seeded automatically, so this is
 * for the ones that predate the behaviour, and for a child that emptied a
 * category and wants the parent's version back. It is the same idempotent
 * copy either way: a category the child has already populated is left alone.
 */
export const inheritParentSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;

    const { data: profile } = await supabase
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    const orgId = profile?.organization_id as string | undefined;
    if (!orgId) throw new Error("There is no agency on your account.");

    const { assertOrgOwner } = await import("@/lib/org-guard");
    await assertOrgOwner(userId, orgId);

    const { seedOrgFromParent, getParentOrgId } = await import(
      "@/lib/agency-seed/seed-from-parent.server"
    );
    const parentOrgId = await getParentOrgId(orgId);
    if (!parentOrgId) throw new Error("Your agency doesn't sit under a parent agency.");

    const counts = await seedOrgFromParent(orgId, parentOrgId);
    return { ok: true, counts };
  });

/**
 * Whether there is anything to carry over — drives the one-line note on Agency
 * settings. Reports only the child's own emptiness plus whether the parent has
 * something there; never the parent's actual configuration.
 */
export const getInheritStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: profile } = await supabase
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    const orgId = profile?.organization_id as string | undefined;
    if (!orgId) return { hasParent: false, parentName: null, missing: [] as string[] };

    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
    const supabaseAdmin = admin as any;

    const { data: org } = await supabaseAdmin
      .from("organizations").select("parent_org_id").eq("id", orgId).maybeSingle();
    const parentOrgId = (org as any)?.parent_org_id as string | null;
    if (!parentOrgId) return { hasParent: false, parentName: null, missing: [] as string[] };

    const { data: parent } = await supabaseAdmin
      .from("organizations").select("name").eq("id", parentOrgId).maybeSingle();

    const CATEGORIES: { table: string; label: string }[] = [
      { table: "agency_levels", label: "levels" },
      { table: "org_carriers", label: "carriers" },
      { table: "commission_grids", label: "comp grids" },
    ];

    const missing: string[] = [];
    for (const c of CATEGORIES) {
      const [{ data: mine }, { data: theirs }] = await Promise.all([
        supabaseAdmin.from(c.table).select("id").eq("organization_id", orgId).limit(1),
        supabaseAdmin.from(c.table).select("id").eq("organization_id", parentOrgId).limit(1),
      ]);
      if (!(mine ?? []).length && (theirs ?? []).length) missing.push(c.label);
    }

    return {
      hasParent: true,
      parentName: (parent as any)?.name ?? "your parent agency",
      missing,
    };
  });
