import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { resolveAgencySettingsAccess } from "@/lib/permissions.functions";

type Ctx = { supabase: any; userId: string };

/**
 * The agency's own settings.
 *
 * Two things were wrong here and they were the same thing twice.
 *
 * **The org was resolved differently from everywhere else.** This read
 * `profiles.organization_id` alone, while the page that calls it resolves
 * membership first, then the profile, then `organizations.owner_id`. An owner
 * whose profile row predates the sync trigger got "No organization found" on a
 * page that had just rendered their agency's name.
 *
 * **The page and this function disagreed about who may save.** The route admits
 * anyone with `canSeeAgency` — owner or delegated admin — and this refused
 * anyone but the owner. So an admin filled in the whole form and was told on
 * submit that only the owner can do this. `resolveAgencySettingsAccess` is now
 * the single answer both sides ask.
 *
 * `slug` stays owner-only, and that is not an oversight. It is globally unique
 * and it decides where traffic goes; a delegated admin changing a colour and a
 * delegated admin moving the agency's subdomain are not the same risk.
 */
export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name:         z.string().min(1).max(100),
      tagline:      z.string().max(80).optional().nullable(),
      accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      // Optional now. A non-owner's form does not send it, and requiring it
      // would mean the client had to echo back a value it may not change —
      // which is how a field nobody edited gets overwritten by a stale copy.
      slug:         z.string().min(2).max(40).regex(/^[a-z0-9-]+$/).optional(),
      logo_url:     z.string().url().optional().nullable(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const { orgId, isOwner, canEdit } = await resolveAgencySettingsAccess(userId);
    if (!orgId) throw new Error("There is no agency on your account to save.");
    if (!canEdit) {
      throw new Error(
        "You don't have permission to change this agency's settings. The agency owner, " +
        "or an admin they've granted access to, can.",
      );
    }

    const patch: Record<string, unknown> = {
      name:         data.name,
      tagline:      data.tagline ?? null,
      accent_color: data.accent_color ?? "#C9A227",
      updated_at:   new Date().toISOString(),
    };

    // `logo_url` is only written when the caller sent one. `undefined` means
    // "not part of this save"; sending null would clear a logo somebody else
    // uploaded, which is what an admin saving the name would otherwise do.
    if (data.logo_url !== undefined) patch.logo_url = data.logo_url;

    if (data.slug !== undefined) {
      if (!isOwner) {
        throw new Error("Only the agency owner can change the subdomain.");
      }
      const { data: existing } = await supabase
        .from("organizations").select("id").eq("slug", data.slug).neq("id", orgId).maybeSingle();
      if (existing) throw new Error("This subdomain is already taken.");
      patch.slug = data.slug;
    }

    const { data: saved, error } = await supabase
      .from("organizations").update(patch).eq("id", orgId).select("id");

    if (error) throw new Error(error.message);
    // Row-level security on `organizations` can filter this out even after the
    // capability check passes, and an update that matches no rows is not an
    // error in Postgres — it would report success and change nothing.
    if (!saved?.length) {
      throw new Error("Your agency's settings could not be saved. Ask the agency owner to try.");
    }
    return { ok: true };
  });
