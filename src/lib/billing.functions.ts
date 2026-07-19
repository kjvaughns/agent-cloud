import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import {
  getStripe, isStripeConfigured, PRICE_IDS, PRICING, NOVA_LIMITS, NON_BILLABLE_PROFILE_STATUSES,
} from "@/lib/billing/stripe";

// Generated DB types predate the monetization migration; cast until regenerated.
const supabaseAdmin = _admin as any;

type Ctx = { supabase: any; userId: string };

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getOwnedOrg(supabase: any, userId: string) {
  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("owner_id", userId)
    .maybeSingle();
  if (!org) throw new Error("You don't own an organization");
  return org;
}

/**
 * Billable seats = org members whose status grants workspace access.
 * The agency owner never consumes a seat — the 15 included seats apply to
 * managers, staff, and agents only.
 */
async function countBillableSeats(orgId: string, ownerId: string | null): Promise<number> {
  let q = supabaseAdmin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .not("status", "in", `(${NON_BILLABLE_PROFILE_STATUSES.join(",")})`);
  if (ownerId) q = q.neq("id", ownerId);
  const { count } = await q;
  return count ?? 0;
}

/** Per-user seat breakdown so owners can see exactly who consumes seats. */
export const getSeatBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const org = await getOwnedOrg(supabase, userId);
    const { data: members } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, email, status, created_at")
      .eq("organization_id", org.id)
      .neq("id", org.owner_id ?? userId)
      .order("created_at");
    const ids = (members ?? []).map((m: any) => m.id);
    const { data: roles } = ids.length
      ? await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids)
      : { data: [] as any[] };
    const roleByUser = new Map<string, string>();
    for (const r of roles ?? []) if (!roleByUser.has(r.user_id)) roleByUser.set(r.user_id, r.role);
    return {
      rows: (members ?? []).map((m: any) => ({
        ...m,
        role: roleByUser.get(m.id) ?? "agent",
        billable: !NON_BILLABLE_PROFILE_STATUSES.includes(m.status ?? "pending"),
      })),
    };
  });

async function ensureStripeCustomerForOrg(org: any, email: string | null): Promise<string> {
  if (org.stripe_customer_id) return org.stripe_customer_id;
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: org.name,
    email: email ?? undefined,
    metadata: { organization_id: org.id, kind: "organization" },
  });
  await supabaseAdmin.from("organizations").update({ stripe_customer_id: customer.id }).eq("id", org.id);
  return customer.id;
}

async function ensureStripeCustomerForProfile(profile: any): Promise<string> {
  if (profile.stripe_customer_id) return profile.stripe_customer_id;
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || undefined,
    email: profile.email ?? undefined,
    metadata: { profile_id: profile.id, kind: "agent" },
  });
  await supabaseAdmin.from("profiles").update({ stripe_customer_id: customer.id }).eq("id", profile.id);
  return customer.id;
}

function appOrigin(): string {
  return process.env.APP_ORIGIN || "https://useagentcloud.com";
}

// ── Billing overview (agency owner) ──────────────────────────────────────────

export const getBillingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const org = await getOwnedOrg(supabase, userId);
    const seatCount = await countBillableSeats(org.id, org.owner_id ?? userId);
    const overageSeats = Math.max(0, seatCount - PRICING.includedSeats);

    // Nova subscribers in this org (any active source), excluding the owner —
    // owners never earn partner commission on their own subscription.
    const { data: novaSubs } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, nova_pro_status, nova_pro_source")
      .eq("organization_id", org.id)
      .in("nova_pro_status", ["active", "grace_period", "past_due"]);
    const commissionEligible = (novaSubs ?? []).filter(
      (p: any) => p.id !== userId && p.nova_pro_status === "active",
    ).length;
    const rate = Number(org.nova_partner_commission_rate ?? PRICING.novaPartnerRate);
    const monthlyCommission = commissionEligible * PRICING.novaPro * rate;

    const assignedSeats = (novaSubs ?? []).filter((p: any) => p.nova_pro_source === "agency").length;

    const whiteLabel = org.plan_type === "white_label";
    const base = PRICING.agencyBase + overageSeats * PRICING.seatOverage
      + (org.nova_seats_purchased ?? 0) * PRICING.novaPro
      + (whiteLabel ? PRICING.whiteLabelMonthly : 0);

    return {
      configured: isStripeConfigured(),
      org: {
        id: org.id,
        name: org.name,
        plan_type: org.plan_type ?? "agency",
        subscription_status: org.subscription_status ?? "inactive",
        current_period_end: org.subscription_current_period_end,
        nova_seats_purchased: org.nova_seats_purchased ?? 0,
      },
      seats: {
        active: seatCount,
        included: PRICING.includedSeats,
        overage: overageSeats,
        overageCost: overageSeats * PRICING.seatOverage,
      },
      nova: {
        subscribers: (novaSubs ?? []).length,
        assignedSeats,
        commissionEligible,
        rate,
        monthlyCommission,
        ytd: Number(org.nova_partner_commission_ytd ?? 0),
      },
      pricing: PRICING,
      estimatedMonthlyTotal: base - monthlyCommission,
    };
  });

// ── Nova seat management (agency owner) ──────────────────────────────────────

export const listNovaSeatAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const org = await getOwnedOrg(supabase, userId);
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, email, nova_pro_status, nova_pro_source")
      .eq("organization_id", org.id)
      .order("first_name");
    return { agents: data ?? [], seatsPurchased: org.nova_seats_purchased ?? 0 };
  });

export const assignNovaSeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ agent_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const org = await getOwnedOrg(supabase, userId);

    const { data: agent } = await supabaseAdmin
      .from("profiles")
      .select("id, organization_id, nova_pro_status, nova_pro_source")
      .eq("id", data.agent_id)
      .maybeSingle();
    if (!agent || agent.organization_id !== org.id) throw new Error("Agent is not in your organization");

    // Personal subscription takes precedence — hold the agency seat in reserve.
    if (agent.nova_pro_status === "active" && agent.nova_pro_source === "personal") {
      throw new Error("This agent has a personal Nova Pro subscription — the seat would sit in reserve. Remove is automatic if they cancel.");
    }

    const { count: assigned } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.id)
      .eq("nova_pro_source", "agency")
      .in("nova_pro_status", ["active", "grace_period", "past_due"]);
    if ((assigned ?? 0) >= (org.nova_seats_purchased ?? 0)) {
      throw new Error("All purchased Nova seats are assigned. Purchase more seats first.");
    }

    await supabaseAdmin.from("profiles").update({
      nova_pro_status: "active",
      nova_pro_source: "agency",
      nova_pro_activated_at: new Date().toISOString(),
      nova_pro_expires_at: null,
      nova_usage_reset_at: new Date().toISOString(),
    }).eq("id", data.agent_id);

    await supabaseAdmin.from("notifications").insert({
      user_id: data.agent_id,
      title: "Nova AI Pro activated",
      description: "Your agency has assigned you a Nova Pro seat. Automations, retention alerts, and advanced Nova features are now unlocked.",
      type: "billing",
    });
    return { ok: true };
  });

export const unassignNovaSeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ agent_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const org = await getOwnedOrg(supabase, userId);

    const { data: agent } = await supabaseAdmin
      .from("profiles")
      .select("id, organization_id, nova_pro_source")
      .eq("id", data.agent_id)
      .maybeSingle();
    if (!agent || agent.organization_id !== org.id) throw new Error("Agent is not in your organization");
    if (agent.nova_pro_source !== "agency") throw new Error("This agent's Nova Pro is not an agency seat");

    // 48-hour grace period: features stay on, phone number NOT deprovisioned.
    const expires = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    await supabaseAdmin.from("profiles").update({
      nova_pro_status: "grace_period",
      nova_pro_expires_at: expires,
    }).eq("id", data.agent_id);

    await supabaseAdmin.from("notifications").insert({
      user_id: data.agent_id,
      title: "Your agency's Nova Pro subscription has ended",
      description: "Subscribe personally within 48 hours to keep access — your phone number and automations continue uninterrupted during the grace period.",
      type: "billing",
    });
    return { ok: true, grace_until: expires };
  });

// ── Nova Pro status (individual agent) ───────────────────────────────────────

export const getNovaProStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: p } = await supabase
      .from("profiles")
      .select("nova_pro_status, nova_pro_source, nova_pro_phone_number, nova_pro_expires_at, nova_usage_calls_minutes, nova_usage_sms, nova_usage_ai_queries, nova_usage_automations, nova_usage_reset_at")
      .eq("id", userId)
      .maybeSingle();
    return {
      configured: isStripeConfigured(),
      status: p?.nova_pro_status ?? "inactive",
      source: p?.nova_pro_source ?? null,
      phone: p?.nova_pro_phone_number ?? null,
      graceUntil: p?.nova_pro_expires_at ?? null,
      usage: {
        calls_minutes: p?.nova_usage_calls_minutes ?? 0,
        sms: p?.nova_usage_sms ?? 0,
        ai_queries: p?.nova_usage_ai_queries ?? 0,
        automations: p?.nova_usage_automations ?? 0,
        resetAt: p?.nova_usage_reset_at ?? null,
      },
      limits: NOVA_LIMITS,
      price: PRICING.novaPro,
    };
  });

// ── Checkout + portal sessions ───────────────────────────────────────────────

const CheckoutSchema = z.object({
  product: z.enum(["agency_plan", "nova_pro_personal", "nova_seats", "white_label", "solo_agent"]),
  quantity: z.number().int().min(1).max(500).optional().default(1),
});

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CheckoutSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    if (!isStripeConfigured()) throw new Error("Billing is not configured yet. Add the Stripe keys to enable checkout.");
    const stripe = getStripe();
    const origin = appOrigin();

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

    if (data.product === "nova_pro_personal") {
      const price = PRICE_IDS.nova_pro_agent();
      if (!price) throw new Error("Nova Pro price is not configured");
      const customer = await ensureStripeCustomerForProfile(profile);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer,
        line_items: [{ price, quantity: 1 }],
        success_url: `${origin}/settings/nova-pro?success=1`,
        cancel_url: `${origin}/settings/nova-pro`,
        metadata: { kind: "nova_personal", profile_id: userId },
        subscription_data: { metadata: { kind: "nova_personal", profile_id: userId } },
      });
      return { url: session.url };
    }

    if (data.product === "solo_agent") {
      const price = PRICE_IDS.solo_agent_plan();
      if (!price) throw new Error("Solo plan price is not configured");
      const customer = await ensureStripeCustomerForProfile(profile);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer,
        line_items: [{ price, quantity: 1 }],
        success_url: `${origin}/dashboard?solo=1`,
        cancel_url: `${origin}/signup/agent`,
        metadata: { kind: "solo", profile_id: userId },
        subscription_data: { metadata: { kind: "solo", profile_id: userId } },
      });
      return { url: session.url };
    }

    // Org-level products
    const org = await getOwnedOrg(supabase, userId);
    const customer = await ensureStripeCustomerForOrg(org, profile?.email ?? null);

    if (data.product === "agency_plan") {
      const price = PRICE_IDS.agency_plan();
      if (!price) throw new Error("Agency plan price is not configured");
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer,
        line_items: [{ price, quantity: 1 }],
        success_url: `${origin}/settings/billing?success=1`,
        cancel_url: `${origin}/settings/billing`,
        metadata: { kind: "agency", organization_id: org.id },
        subscription_data: { metadata: { kind: "agency", organization_id: org.id } },
      });
      return { url: session.url };
    }

    if (data.product === "nova_seats") {
      const price = PRICE_IDS.nova_pro_agency_seat();
      if (!price) throw new Error("Nova seat price is not configured");
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer,
        line_items: [{ price, quantity: data.quantity }],
        success_url: `${origin}/settings/billing?nova_seats=1`,
        cancel_url: `${origin}/settings/billing`,
        metadata: { kind: "nova_seats", organization_id: org.id, quantity: String(data.quantity) },
        subscription_data: { metadata: { kind: "nova_seats", organization_id: org.id } },
      });
      return { url: session.url };
    }

    // white_label: $999 setup (one-time) + $499/month recurring
    const setupPrice = PRICE_IDS.white_label_setup();
    const monthlyPrice = PRICE_IDS.white_label_monthly();
    if (!setupPrice || !monthlyPrice) throw new Error("White-label prices are not configured");
    if ((org.subscription_status ?? "inactive") !== "active") {
      throw new Error("White-label requires an active Agency Plan subscription");
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [
        { price: monthlyPrice, quantity: 1 },
        { price: setupPrice, quantity: 1 },
      ],
      success_url: `${origin}/settings/billing?white_label=1`,
      cancel_url: `${origin}/settings/billing`,
      metadata: { kind: "white_label", organization_id: org.id },
      subscription_data: { metadata: { kind: "white_label", organization_id: org.id } },
    });
    return { url: session.url };
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ scope: z.enum(["org", "personal"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    if (!isStripeConfigured()) throw new Error("Billing is not configured yet");
    const stripe = getStripe();
    let customerId: string | null = null;
    if (data.scope === "org") {
      const org = await getOwnedOrg(supabase, userId);
      customerId = org.stripe_customer_id;
    } else {
      const { data: p } = await supabase.from("profiles").select("stripe_customer_id").eq("id", userId).maybeSingle();
      customerId = p?.stripe_customer_id ?? null;
    }
    if (!customerId) throw new Error("No billing account yet — complete a checkout first");
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appOrigin()}/settings/${data.scope === "org" ? "billing" : "nova-pro"}`,
    });
    return { url: session.url };
  });

// ── Solo agent workspace bootstrap ──────────────────────────────────────────

export const initSoloWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, email, organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Profile not found");
    if (profile.organization_id) {
      // Already in an org (invited earlier, or re-running) — never duplicate.
      return { ok: true, existing: true };
    }
    const base = (`${profile.first_name ?? ""}-${profile.last_name ?? ""}`.toLowerCase().replace(/[^a-z0-9-]/g, "") || "agent").slice(0, 30);
    const slug = `${base}-${userId.slice(0, 6)}`;
    const { data: org, error } = await supabaseAdmin
      .from("organizations")
      .insert({
        name: `${profile.first_name ?? "My"} ${profile.last_name ?? "Agency"}`.trim(),
        slug,
        owner_id: userId,
        plan_type: "solo",
        subscription_status: "inactive",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ organization_id: org.id }).eq("id", userId);
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: userId, role: "agency_owner" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
    return { ok: true, existing: false };
  });

// ── Super admin: platform subscriptions overview ─────────────────────────────

export const getPlatformSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleRow) throw new Error("Super admin only");

    const { data: orgs } = await supabaseAdmin
      .from("organizations")
      .select("id, name, plan_type, subscription_status, nova_seats_purchased, subscription_current_period_end, created_at")
      .order("created_at", { ascending: false });

    const { data: novaProfiles } = await supabaseAdmin
      .from("profiles")
      .select("nova_pro_status, nova_pro_source")
      .in("nova_pro_status", ["active", "grace_period", "past_due"]);

    const { data: commissions } = await supabaseAdmin
      .from("nova_partner_commissions")
      .select("commission_amount, status, created_at")
      .gte("created_at", new Date(Date.now() - 31 * 86400000).toISOString());

    const rows = orgs ?? [];
    const active = rows.filter((o: any) => o.subscription_status === "active");
    const agency = active.filter((o: any) => o.plan_type === "agency");
    const white = active.filter((o: any) => o.plan_type === "white_label");
    const solo = active.filter((o: any) => o.plan_type === "solo");
    const novaCount = (novaProfiles ?? []).filter((p: any) => p.nova_pro_status === "active").length;
    const bySource = { personal: 0, agency: 0, solo: 0 } as Record<string, number>;
    for (const p of novaProfiles ?? []) if (p.nova_pro_source) bySource[p.nova_pro_source] = (bySource[p.nova_pro_source] ?? 0) + 1;

    const mrr = {
      agency: agency.length * PRICING.agencyBase,
      white_label: white.length * (PRICING.agencyBase + PRICING.whiteLabelMonthly),
      solo: solo.length * PRICING.soloAgent,
      nova_seats: rows.reduce((a: number, o: any) => a + (o.subscription_status === "active" ? (o.nova_seats_purchased ?? 0) : 0), 0) * PRICING.novaPro,
      nova_personal: bySource.personal * PRICING.novaPro,
    };

    return {
      orgs: rows,
      counts: {
        agency: agency.length,
        white_label: white.length,
        solo: solo.length,
        past_due: rows.filter((o: any) => o.subscription_status === "past_due").length,
        cancelled30d: rows.filter((o: any) => o.subscription_status === "cancelled").length,
        nova_total: novaCount,
        nova_by_source: bySource,
      },
      partnerPayoutsThisMonth: (commissions ?? [])
        .filter((c: any) => c.status === "applied")
        .reduce((a: number, c: any) => a + Number(c.commission_amount ?? 0), 0),
      mrr,
      mrrTotal: Object.values(mrr).reduce((a, b) => a + b, 0),
    };
  });

// ── Nova Pro gating + usage metering (DB-level, used by feature server fns) ──

/** Throws unless the user has active (or grace-period) Nova Pro. */
export async function requireNovaPro(userId: string): Promise<void> {
  const { data: p } = await supabaseAdmin
    .from("profiles")
    .select("nova_pro_status")
    .eq("id", userId)
    .maybeSingle();
  const s = p?.nova_pro_status;
  if (s !== "active" && s !== "grace_period") {
    throw new Error("Nova AI Pro required. Upgrade in Settings → Nova Pro.");
  }
}

/** Increment a usage counter; fires 80%/100% notifications once per threshold crossing. */
export async function trackNovaUsage(
  userId: string,
  metric: "calls_minutes" | "sms" | "ai_queries" | "automations",
  amount = 1,
): Promise<void> {
  const col = `nova_usage_${metric}`;
  const { data: p } = await supabaseAdmin
    .from("profiles")
    .select(`${col}, nova_pro_status`)
    .eq("id", userId)
    .maybeSingle();
  if (!p || (p as any).nova_pro_status === "inactive") return;
  const limitKey = metric === "calls_minutes" ? "outbound_minutes" : metric;
  const limit = (NOVA_LIMITS as any)[limitKey]?.included ?? Infinity;
  const before = Number((p as any)[col] ?? 0);
  const after = before + amount;
  await supabaseAdmin.from("profiles").update({ [col]: after }).eq("id", userId);
  for (const pct of [0.8, 1.0]) {
    if (before < limit * pct && after >= limit * pct) {
      await supabaseAdmin.from("notifications").insert({
        user_id: userId,
        title: pct === 1 ? "Nova Pro limit reached" : "Nova Pro usage at 80%",
        description: `You've used ${Math.round((after / limit) * 100)}% of your monthly ${(NOVA_LIMITS as any)[limitKey]?.label?.toLowerCase() ?? metric}. ${pct === 1 ? "Overage rates now apply." : ""}`,
        type: "billing",
      });
    }
  }
}
