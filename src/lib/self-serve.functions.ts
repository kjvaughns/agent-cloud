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
    invites: z.array(z.string().email().max(200)).max(50).default([]),
    documentPaths: z.array(z.object({ name: z.string().max(200), path: z.string().max(400) })).max(10).default([]),
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
    await seedBuilderData(supabaseAdmin, userId, org, data);
    await supabaseAdmin.from("funnel_events").insert({
      event: "builder_completed", user_id: userId, organization_id: org.id,
      meta: { carriers: data.carriers, teamSize: data.teamSize, monthlyGoal: data.monthlyGoal, documentName: data.documentName },
    } as any);
    return { ok: true, suite };
  });

/** Carriers, team invites and documents chosen during signup land in the real workspace. Each part is idempotent. */
async function seedBuilderData(
  admin: any, userId: string, org: { id: string; name?: string | null },
  data: { carriers: string[]; invites: string[]; documentPaths: { name: string; path: string }[] },
) {
  // Carriers → agency carrier list (match the shared catalog by name).
  if (data.carriers.length) {
    const { data: cats } = await admin.from("carriers").select("id,name").eq("active", true).is("owner_organization_id", null);
    const want = new Set(data.carriers.map((c) => c.trim().toLowerCase()));
    const ids = (cats ?? []).filter((c: any) => want.has(String(c.name).trim().toLowerCase())).map((c: any) => c.id);
    if (ids.length) {
      const { data: have } = await admin.from("org_carriers").select("carrier_id").eq("organization_id", org.id);
      const existing = new Set((have ?? []).map((r: any) => r.carrier_id));
      const rows = ids.filter((id: string) => !existing.has(id)).map((carrier_id: string) => ({ organization_id: org.id, carrier_id, created_by: userId }));
      if (rows.length) {
        const { error } = await admin.from("org_carriers").insert(rows);
        if (error) console.error("[builder] carriers", error.message);
      }
    }
  }

  // Team invites → personal invite links + invite email.
  if (data.invites.length) {
    const { data: owner } = await admin.from("profiles").select("first_name,last_name,email").eq("id", userId).maybeSingle();
    const inviterName = [owner?.first_name, owner?.last_name].filter(Boolean).join(" ") || undefined;
    const { queueEmail, APP_ORIGIN } = await import("@/lib/email/send.server");
    for (const raw of Array.from(new Set(data.invites.map((e) => e.trim().toLowerCase())))) {
      if (raw === String(owner?.email ?? "").toLowerCase()) continue;
      const { data: dupe } = await admin.from("invitation_links").select("id").eq("organization_id", org.id).eq("new_agent_email", raw).neq("status", "revoked").maybeSingle();
      if (dupe) continue;
      const token = crypto.randomUUID();
      const { error } = await admin.from("invitation_links").insert({
        created_by: userId, name: `Invite for ${raw}`, token, new_agent_email: raw,
        upline_id: userId, organization_id: org.id, is_reusable: false, carrier_assignments: [],
      });
      if (error) { console.error("[builder] invite", error.message); continue; }
      await queueEmail({
        template: "agent-invited", to: raw, profileId: null, category: "transactional", key: `agent-invited:${token}`,
        data: { inviterName, orgName: org.name ?? undefined, inviteUrl: `${APP_ORIGIN}/join/${token}` },
      } as any).catch((e: any) => console.error("[builder] invite email", e?.message));
    }
  }

  // Documents → owner's producer documents (license/E&O/other).
  for (const doc of data.documentPaths) {
    if (!doc.path.startsWith(`${userId}/`)) continue;
    const n = doc.name.toLowerCase();
    const docType = /e\s*&\s*o|errors|omission|\beo\b/.test(n) ? "eo_certificate" : /pdb|license|licence/.test(n) ? "pdb_report" : "other_document";
    const { data: exists } = await admin.from("producer_documents").select("id").eq("agent_id", userId).eq("doc_type", docType).maybeSingle();
    if (exists) continue;
    const { data: blob } = await admin.storage.from("onboarding-uploads").download(doc.path);
    if (!blob) continue;
    const dest = `${userId}/${docType}/${Date.now()}_${doc.name.replace(/[^\w.\- ]/g, "_")}`;
    const up = await admin.storage.from("agent-documents").upload(dest, blob, { contentType: blob.type || undefined, upsert: true });
    if (up.error) { console.error("[builder] doc upload", up.error.message); continue; }
    const { error } = await admin.from("producer_documents").insert({
      agent_id: userId, organization_id: org.id, uploaded_by: userId, doc_type: docType, file_url: dest, file_name: doc.name, review_status: "uploaded",
    });
    if (error) console.error("[builder] doc row", error.message);
  }
}
