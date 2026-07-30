import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { assertOrgOwner, getMyPrimaryOrgId } from "@/lib/org-guard";

const supabaseAdmin = _admin as any;

type Ctx = { supabase: any; userId: string };

/**
 * White Label applications.
 *
 * Not a checkout. White Label needs a domain, DNS records, brand assets and a
 * setup conversation, so an agency applies and a human confirms before any
 * money moves — taking payment for a domain nobody has checked is available
 * is the wrong order.
 */

export type WhiteLabelApplication = {
  id: string;
  brand_name: string;
  tagline: string | null;
  desired_domain: string | null;
  accent_color: string | null;
  agent_count: string | null;
  timeline: string | null;
  notes: string | null;
  status: "submitted" | "in_review" | "approved" | "live" | "declined" | "withdrawn";
  review_notes: string | null;
  created_at: string;
};

const OPEN = ["submitted", "in_review", "approved"];

export const getWhiteLabelStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) {
      return { eligible: false, reason: "no_org" as const, org: null, application: null };
    }

    const [{ data: org }, { data: apps }] = await Promise.all([
      supabaseAdmin
        .from("organizations")
        .select("id, name, tagline, slug, accent_color, logo_url, owner_id, plan_type, subscription_status")
        .eq("id", orgId)
        .maybeSingle(),
      supabaseAdmin
        .from("white_label_applications")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const application = (apps ?? [])[0] ?? null;
    const isOwner = org?.owner_id === userId;

    // Each of these is a different conversation, so they are distinguished
    // rather than collapsed into one "not eligible".
    const reason =
      !isOwner ? ("not_owner" as const)
      : org?.plan_type === "white_label" ? ("already_live" as const)
      : org?.plan_type === "solo" ? ("solo_plan" as const)
      : org?.subscription_status !== "active" ? ("inactive_subscription" as const)
      : null;

    return {
      eligible: reason === null,
      reason,
      org: org
        ? {
            id: org.id,
            name: org.name,
            tagline: org.tagline,
            slug: org.slug,
            accent_color: org.accent_color,
            logo_url: org.logo_url,
            plan_type: org.plan_type,
            subscription_status: org.subscription_status,
          }
        : null,
      application: application as WhiteLabelApplication | null,
    };
  });

const ApplySchema = z.object({
  brand_name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(80).nullable().optional(),
  desired_domain: z
    .string()
    .trim()
    .max(120)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Enter a domain like app.youragency.com")
    .nullable()
    .optional(),
  accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
  agent_count: z.string().trim().max(40).nullable().optional(),
  timeline: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const applyForWhiteLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ApplySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("No organization on your account");
    await assertOrgOwner(userId, orgId);

    const { data: org } = await supabaseAdmin
      .from("organizations").select("plan_type, subscription_status").eq("id", orgId).maybeSingle();

    if (org?.plan_type === "white_label") throw new Error("Your agency is already on White Label.");
    if (org?.plan_type === "solo") {
      throw new Error("White Label requires the Agency Plan. Upgrade first, then apply.");
    }
    if (org?.subscription_status !== "active") {
      throw new Error("Your Agency Plan needs to be active before applying.");
    }

    const { data: existing } = await supabaseAdmin
      .from("white_label_applications")
      .select("id, status")
      .eq("organization_id", orgId)
      .in("status", OPEN)
      .limit(1);

    if (existing?.length) {
      throw new Error("You already have an application in progress.");
    }

    const { data: app, error } = await supabaseAdmin
      .from("white_label_applications")
      .insert({ ...data, organization_id: orgId, submitted_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Tell platform staff, and give them something that will not be forgotten.
    try {
      const { data: admins } = await supabaseAdmin
        .from("user_roles").select("user_id").eq("role", "super_admin");
      for (const a of admins ?? []) {
        await supabaseAdmin.from("notifications").insert({
          user_id: a.user_id,
          title: "New White Label application",
          description: `${data.brand_name}${data.desired_domain ? ` — ${data.desired_domain}` : ""}`,
          type: "sales",
        });
        await supabaseAdmin.from("tasks").insert({
          title: `Review White Label application: ${data.brand_name}`,
          description: [data.desired_domain, data.timeline, data.notes].filter(Boolean).join("\n"),
          assigned_to: a.user_id,
          created_by: a.user_id,
          priority: "high",
        });
      }
    } catch {
      // The application is saved; a notification failure must not lose it.
    }

    return { ok: true, id: app.id as string };
  });

export const withdrawWhiteLabelApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("No organization");
    await assertOrgOwner(userId, orgId);

    // Through the RLS-bound client: the update policy already restricts this
    // to an owner and to applications that are still open.
    const { error } = await supabase
      .from("white_label_applications")
      .update({ status: "withdrawn" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
