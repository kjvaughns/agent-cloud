import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";

const supabaseAdmin = _admin as any;
type Ctx = { supabase: any; userId: string };

/**
 * The terms of a parent/child agency relationship.
 *
 * Reads and writes run on the RLS-bound client: `agency_relationships` lets
 * a parent's admins manage rows where they are the parent, and a child's
 * admins read (only) their own row. The admin client appears solely to
 * decorate rows with org names/logos — organization metadata, not another
 * org's data.
 *
 * Direction of trust, stated once: the parent owns the toggles. A child can
 * see whether it is being counted and can change nothing. Nothing here ever
 * returns a parent's production, its other children, or its settings.
 */

/** The table may not exist yet — code ships before the migration is applied. */
const MISSING_TABLE = "42P01";

export const listSubAgencies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: profile } = await supabase
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    const orgId = profile?.organization_id;
    if (!orgId) return { children: [] };

    const { data: rows, error } = await (supabase as any)
      .from("agency_relationships")
      .select("id, child_org_id, include_production, allow_sales_feed, status, effective_date")
      .eq("parent_org_id", orgId)
      .neq("status", "terminated")
      .order("created_at", { ascending: true });
    if (error) {
      if (error.code === MISSING_TABLE) return { children: [], pendingMigration: true };
      throw new Error(error.message);
    }

    const ids = (rows ?? []).map((r: any) => r.child_org_id);
    const { data: orgs } = ids.length
      ? await supabaseAdmin.from("organizations").select("id, name, logo_url").in("id", ids)
      : { data: [] };
    const byId = new Map(((orgs ?? []) as any[]).map((o) => [o.id, o]));

    return {
      children: (rows ?? []).map((r: any) => ({
        ...r,
        name: byId.get(r.child_org_id)?.name ?? "Sub-agency",
        logo_url: byId.get(r.child_org_id)?.logo_url ?? null,
      })),
    };
  });

const UpdateSchema = z.object({
  id: z.string().uuid(),
  include_production: z.boolean().optional(),
  allow_sales_feed: z.boolean().optional(),
  status: z.enum(["active", "paused", "terminated"]).optional(),
});

export const updateSubAgency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { id, ...patch } = data;
    if (Object.keys(patch).length === 0) throw new Error("Nothing to change.");

    // RLS is the authority: only a parent-org admin can touch the row. The
    // row-count assert turns a silent RLS no-op into an honest error instead
    // of a toast claiming success.
    const { data: updated, error } = await (supabase as any)
      .from("agency_relationships")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) throw new Error("That sub-agency is not yours to manage.");
    return { ok: true };
  });

/** The child's view: who my parent is, and whether I'm being counted. */
export const getMyParentAgency = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: profile } = await supabase
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    const orgId = profile?.organization_id;
    if (!orgId) return { parent: null };

    const { data: row, error } = await (supabase as any)
      .from("agency_relationships")
      .select("parent_org_id, include_production, allow_sales_feed, status")
      .eq("child_org_id", orgId)
      .neq("status", "terminated")
      .maybeSingle();
    if (error && error.code !== MISSING_TABLE) throw new Error(error.message);
    if (!row) return { parent: null };

    const { data: org } = await supabaseAdmin
      .from("organizations").select("name").eq("id", row.parent_org_id).maybeSingle();
    return {
      parent: {
        name: org?.name ?? "your parent agency",
        include_production: row.include_production,
        allow_sales_feed: row.allow_sales_feed,
        status: row.status,
      },
    };
  });
