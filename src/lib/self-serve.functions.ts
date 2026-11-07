import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SETUP_STEPS, partnerCodeFor, suiteLinks } from "@/lib/onboarding/setup";

type Ctx = { supabase: any; userId: string };

async function ownedOrg(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin.from("profiles").select("organization_id").eq("id", userId).maybeSingle();
  if (!profile?.organization_id) return { supabaseAdmin, org: null as any };
  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("id, name, slug, owner_id, logo_url, accent_color, plan_type, onboarding_step, onboarding_completed_at, partner_code, suite_activated_at")
    .eq("id", profile.organization_id)
    .maybeSingle();
  return { supabaseAdmin, org: org && org.owner_id === userId ? org : null };
}

export const getSetupState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { org } = await ownedOrg((context as Ctx).userId);
    if (!org) return { needsSetup: false as const, org: null };
    return {
      needsSetup: !org.onboarding_completed_at,
      org,
      steps: SETUP_STEPS.filter((s) => org.plan_type === "agency" || s.key !== "team"),
      suite: org.partner_code ? suiteLinks(org.partner_code) : null,
    };
  });

export const saveSetupStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    step: z.number().int().min(0).max(10),
    name: z.string().trim().min(1).max(80).optional(),
    logo_url: z.string().url().max(500).nullable().optional(),
    accent_color: z.string().max(40).nullable().optional(),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{3,40}$/).optional(),
    finish: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as Ctx).userId;
    const { supabaseAdmin, org } = await ownedOrg(userId);
    if (!org) throw new Error("Only the workspace owner can run setup");
    const patch: Record<string, any> = { onboarding_step: Math.max(org.onboarding_step ?? 0, data.step) };
    for (const k of ["name", "logo_url", "accent_color", "slug"] as const) if (data[k] !== undefined) patch[k] = data[k];
    if (data.finish) patch.onboarding_completed_at = new Date().toISOString();
    const { error } = await supabaseAdmin.from("organizations").update(patch as any).eq("id", org.id);
    if (error) throw new Error(error.message.includes("duplicate") ? "That web address is taken — try another." : error.message);
    await supabaseAdmin.from("funnel_events").insert({
      event: data.finish ? "setup_completed" : `setup_step_${data.step}`, user_id: userId, organization_id: org.id,
    });
    return { ok: true };
  });

export const activateAgencySuite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = (context as Ctx).userId;
    const { supabaseAdmin, org } = await ownedOrg(userId);
    if (!org) throw new Error("Only the workspace owner can turn on the Agency Suite");
    const code = org.partner_code ?? partnerCodeFor(org.slug);
    await supabaseAdmin.from("organizations")
      .update({ partner_code: code, suite_activated_at: org.suite_activated_at ?? new Date().toISOString() })
      .eq("id", org.id);
    await supabaseAdmin.from("funnel_events").insert({ event: "suite_activated", user_id: userId, organization_id: org.id });
    return suiteLinks(code);
  });

export const trackFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ event: z.enum(["checkout_opened", "paid", "first_deal"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as Ctx).userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin.from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    await supabaseAdmin.from("funnel_events").insert({ event: data.event, user_id: userId, organization_id: p?.organization_id ?? null });
    return { ok: true };
  });

export const getFunnelReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const since = new Date(Date.now() - data.days * 86400000).toISOString();
    // RLS only returns rows to platform admins.
    const { data: rows, error } = await supabase.from("funnel_events").select("event, user_id").gte("created_at", since).limit(20000);
    if (error) throw new Error(error.message);
    const users = new Map<string, Set<string>>();
    for (const r of rows ?? []) {
      if (!users.has(r.event)) users.set(r.event, new Set());
      users.get(r.event)!.add(r.user_id ?? "anon");
    }
    return Object.fromEntries([...users].map(([k, v]) => [k, v.size])) as Record<string, number>;
  });

/** Saves everything the /start builder collected, after the account exists. */
export const applyBuilderSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    accent_color: z.string().max(40).nullable().optional(),
    carriers: z.array(z.string().max(60)).max(40).default([]),
    teamSize: z.number().int().min(1).max(5000).optional(),
    monthlyGoal: z.number().int().min(0).max(100000000).optional(),
    documentName: z.string().max(200).optional(),
    activateSuite: z.boolean().default(false),
    logoPath: z.string().max(400).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const userId = (context as Ctx).userId;
    const { supabaseAdmin, org } = await ownedOrg(userId);
    if (!org) throw new Error("Only the workspace owner can finish setup");
    const patch: Record<string, any> = { onboarding_completed_at: new Date().toISOString(), onboarding_step: 99 };
    if (data.accent_color && /^#[0-9a-f]{6}$/i.test(data.accent_color)) patch.accent_color = data.accent_color;
    // Copy the onboarding logo (private, per-user) into the agency's branding bucket.
    if (data.logoPath && data.logoPath.startsWith(`${userId}/`)) {
      const { data: blob } = await supabaseAdmin.storage.from("onboarding-uploads").download(data.logoPath);
      if (blob) {
        const name = data.logoPath.split("/").pop()!.replace(/^logo-\d+-/, "");
        const dest = `${org.id}/logo-${Date.now()}-${name}`;
        const up = await supabaseAdmin.storage.from("org-branding").upload(dest, blob, { contentType: blob.type || undefined, upsert: true });
        if (!up.error) {
          const { data: signed } = await supabaseAdmin.storage.from("org-branding").createSignedUrl(dest, 60 * 60 * 24 * 365 * 10);
          if (signed?.signedUrl) patch.logo_url = signed.signedUrl;
        }
      }
    }
    let suite = null as ReturnType<typeof suiteLinks> | null;
    if (data.activateSuite) {
      const code = org.partner_code ?? partnerCodeFor(org.slug);
      patch.partner_code = code;
      patch.suite_activated_at = org.suite_activated_at ?? new Date().toISOString();
      suite = suiteLinks(code);
    }
    const { error } = await supabaseAdmin.from("organizations").update(patch as any).eq("id", org.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("funnel_events").insert({
      event: "builder_completed", user_id: userId, organization_id: org.id,
      meta: { carriers: data.carriers, teamSize: data.teamSize, monthlyGoal: data.monthlyGoal, documentName: data.documentName },
    } as any);
    return { ok: true, suite };
  });
