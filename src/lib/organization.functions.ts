import { createServerFn } from "@tanstack/start-client-core";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Ctx = { supabase: any; userId: string };

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name:         z.string().min(1).max(100),
      tagline:      z.string().max(80).optional().nullable(),
      accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      slug:         z.string().min(2).max(40).regex(/^[a-z0-9-]+$/),
      logo_url:     z.string().url().optional().nullable(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!(profile as any)?.organization_id) throw new Error("No organization found");

    const orgId = (profile as any).organization_id;

    const { data: org } = await supabase
      .from("organizations")
      .select("owner_id")
      .eq("id", orgId)
      .maybeSingle();

    const { data: superAdminRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();

    if ((org as any)?.owner_id !== userId && !superAdminRow) {
      throw new Error("Only the agency owner can update these settings");
    }

    const { data: existing } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", data.slug)
      .neq("id", orgId)
      .maybeSingle();
    if (existing) throw new Error("This subdomain is already taken");

    const { error } = await supabase
      .from("organizations")
      .update({
        name:         data.name,
        tagline:      data.tagline ?? null,
        accent_color: data.accent_color ?? "#C9A227",
        slug:         data.slug,
        logo_url:     data.logo_url ?? null,
        updated_at:   new Date().toISOString(),
      })
      .eq("id", orgId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
