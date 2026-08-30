/**
 * The agency's own email switch.
 *
 * `sendTransactionalEmail` has always asked two questions before sending:
 * does the agency send email at all (`organization_settings.emails_enabled`),
 * and does this person still want this category (`may_notify`). The second was
 * reachable from the notifications screen. The first was not reachable from
 * anywhere — it defaults to false, and every organization in the database sat
 * at false — so every announcement email was logged `org_emails_disabled` and
 * nothing ever left the app. A consent gate nobody can open is not a consent
 * gate, it is an outage with a reason attached.
 *
 * Owner-gated, matching the write policy on `organization_settings`. Exempt
 * categories (password resets, invitations) are unaffected by anything here —
 * that is the point of the exemption.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId } from "@/lib/org-guard";
import { CONFIGURABLE_CATEGORIES, type EmailCategory } from "@/lib/email/categories";

const supabaseAdmin = _admin as any;

type Ctx = { supabase: any; userId: string };

export type OrgEmailSettings = {
  available: boolean;
  canEdit: boolean;
  emailsEnabled: boolean;
  /** Every configurable category, with absence read as on. */
  categories: Record<string, boolean>;
};

function normalizeCategories(stored: unknown): Record<string, boolean> {
  const raw = (stored ?? {}) as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const c of CONFIGURABLE_CATEGORIES) out[c] = raw[c] !== false;
  return out;
}

export const getOrgEmailSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OrgEmailSettings> => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) {
      return { available: false, canEdit: false, emailsEnabled: false, categories: normalizeCategories(null) };
    }

    const [{ data: org }, { data: settings }] = await Promise.all([
      supabaseAdmin.from("organizations").select("owner_id").eq("id", orgId).maybeSingle(),
      supabaseAdmin
        .from("organization_settings")
        .select("emails_enabled, email_categories")
        .eq("organization_id", orgId)
        .maybeSingle(),
    ]);

    return {
      available: true,
      canEdit: org?.owner_id === userId,
      emailsEnabled: settings?.emails_enabled === true,
      categories: normalizeCategories(settings?.email_categories),
    };
  });

const UpdateSchema = z.object({
  emailsEnabled: z.boolean().optional(),
  categories: z.record(z.string(), z.boolean()).optional(),
});

export const updateOrgEmailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("You are not in an agency.");

    const { data: org } = await supabaseAdmin
      .from("organizations").select("owner_id").eq("id", orgId).maybeSingle();
    if (org?.owner_id !== userId) {
      throw new Error("Only the agency owner can change email settings.");
    }

    const { data: existing } = await supabaseAdmin
      .from("organization_settings")
      .select("emails_enabled, email_categories")
      .eq("organization_id", orgId)
      .maybeSingle();

    // Merged rather than replaced: the panel sends one switch at a time, and a
    // whole-object write would silently reset every category it did not name.
    const categories = { ...normalizeCategories(existing?.email_categories) };
    for (const [k, v] of Object.entries(data.categories ?? {})) {
      if ((CONFIGURABLE_CATEGORIES as string[]).includes(k)) categories[k as EmailCategory] = v;
    }

    const { error } = await supabaseAdmin.from("organization_settings").upsert(
      {
        organization_id: orgId,
        emails_enabled: data.emailsEnabled ?? existing?.emails_enabled === true,
        email_categories: categories,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" },
    );
    if (error) throw new Error(error.message);

    return { ok: true as const };
  });
