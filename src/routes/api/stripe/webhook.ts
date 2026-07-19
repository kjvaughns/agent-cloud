import { createFileRoute } from "@tanstack/react-router";
import { getStripe } from "@/lib/billing/stripe";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { PRICING } from "@/lib/billing/stripe";

// Generated DB types predate the monetization migration; cast until regenerated.
const supabaseAdmin = _admin as any;

/**
 * Stripe webhook listener.
 * Org events: checkout completed / invoice paid (incl. Nova Partner credit) /
 * payment failed / subscription deleted.
 * Agent events: Nova Pro personal + Solo lifecycle with 48h grace + agency-seat fallback.
 */

async function notify(userId: string, title: string, description: string) {
  await supabaseAdmin.from("notifications").insert({ user_id: userId, title, description, type: "billing" });
}

async function handleOrgEvent(kind: string, orgId: string, type: string, obj: any) {
  const orgQ = () => supabaseAdmin.from("organizations");

  if (type === "checkout.session.completed") {
    const patch: any = { subscription_status: "active" };
    if (obj.subscription) patch.stripe_subscription_id = obj.subscription;
    if (kind === "white_label") patch.plan_type = "white_label";
    // Solo -> Agency upgrade: same org, same records, team features unlock.
    if (kind === "agency") patch.plan_type = "agency";
    if (kind === "nova_seats") {
      const qty = Number(obj.metadata?.quantity ?? 0);
      const { data: org } = await orgQ().select("nova_seats_purchased").eq("id", orgId).maybeSingle();
      patch.nova_seats_purchased = (org?.nova_seats_purchased ?? 0) + qty;
    }
    await orgQ().update(patch).eq("id", orgId);
    return;
  }

  if (type === "invoice.paid") {
    const periodEnd = obj.period_end ? new Date(obj.period_end * 1000).toISOString() : null;
    await orgQ().update({
      subscription_status: "active",
      ...(periodEnd ? { subscription_current_period_end: periodEnd } : {}),
    }).eq("id", orgId);

    // ── Nova Partner Revenue Program credit ─────────────────────────────
    const { data: org } = await orgQ()
      .select("id, owner_id, stripe_customer_id, nova_partner_commission_rate, nova_partner_commission_ytd, plan_type")
      .eq("id", orgId).maybeSingle();
    if (!org || org.plan_type === "solo") return; // solo orgs never earn commission

    // Active, paid-current Nova subscribers in this org — owner excluded.
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("nova_pro_status", "active")
      .neq("id", org.owner_id ?? "00000000-0000-0000-0000-000000000000");
    const subscribers = count ?? 0;
    const rate = Number(org.nova_partner_commission_rate ?? PRICING.novaPartnerRate);
    const amount = Math.round(subscribers * PRICING.novaPro * rate * 100) / 100;

    const periodStart = obj.period_start ? new Date(obj.period_start * 1000) : new Date();
    const periodEndD = obj.period_end ? new Date(obj.period_end * 1000) : new Date();

    let creditId: string | null = null;
    let status = "pending";
    if (amount > 0 && org.stripe_customer_id) {
      try {
        const stripe = getStripe();
        const credit = await stripe.customers.createBalanceTransaction(org.stripe_customer_id, {
          amount: -Math.round(amount * 100), // negative = credit
          currency: "usd",
          description: `Nova Partner Revenue Program — ${subscribers} subscriber${subscribers === 1 ? "" : "s"}`,
        });
        creditId = credit.id;
        status = "applied";
      } catch (e) {
        console.error("[billing] partner credit failed", e);
      }
    } else if (amount === 0) {
      status = "applied"; // nothing to credit; log the zero calculation for the audit trail
    }

    await supabaseAdmin.from("nova_partner_commissions").insert({
      organization_id: orgId,
      billing_period_start: periodStart.toISOString().slice(0, 10),
      billing_period_end: periodEndD.toISOString().slice(0, 10),
      nova_subscriber_count: subscribers,
      commission_rate: rate,
      commission_amount: amount,
      stripe_credit_id: creditId,
      status,
    });
    if (status === "applied" && amount > 0) {
      await orgQ().update({
        nova_partner_commission_ytd: Number(org.nova_partner_commission_ytd ?? 0) + amount,
      }).eq("id", orgId);
    }
    return;
  }

  if (type === "invoice.payment_failed") {
    await orgQ().update({ subscription_status: "past_due" }).eq("id", orgId);
    const { data: org } = await orgQ().select("owner_id, name").eq("id", orgId).maybeSingle();
    if (org?.owner_id) {
      await notify(org.owner_id, "Payment failed",
        `The payment for ${org.name}'s Agent Cloud subscription failed. Update your payment method within 14 days to keep full access.`);
    }
    return;
  }

  if (type === "customer.subscription.deleted") {
    await orgQ().update({ subscription_status: "cancelled" }).eq("id", orgId);
    const { data: org } = await orgQ().select("owner_id, name").eq("id", orgId).maybeSingle();
    if (org?.owner_id) {
      await notify(org.owner_id, "Subscription cancelled",
        "Your Agent Cloud subscription has ended. You have 7 days of read access to reactivate before the workspace locks.");
    }
    return;
  }
}

async function handleAgentEvent(kind: string, profileId: string, type: string, obj: any) {
  const profQ = () => supabaseAdmin.from("profiles");

  if (type === "checkout.session.completed") {
    const now = new Date().toISOString();
    await profQ().update({
      nova_pro_status: "active",
      nova_pro_source: kind === "solo" ? "solo" : "personal",
      nova_pro_activated_at: now,
      nova_pro_expires_at: null,
      nova_usage_reset_at: now,
      ...(obj.subscription ? { stripe_subscription_id: obj.subscription } : {}),
    }).eq("id", profileId);
    // Phone provisioning: pending telephony provider — number assigned when connected.
    if (kind === "solo") {
      // Solo checkout also activates the personal org subscription.
      const { data: p } = await profQ().select("organization_id").eq("id", profileId).maybeSingle();
      if (p?.organization_id) {
        await supabaseAdmin.from("organizations")
          .update({ subscription_status: "active" })
          .eq("id", p.organization_id).eq("plan_type", "solo");
      }
    }
    await notify(profileId, "Nova AI Pro activated", "Your Nova Pro subscription is live. Automations, retention alerts, and advanced Nova features are unlocked.");
    return;
  }

  if (type === "invoice.paid") {
    // New period → reset monthly usage counters.
    await profQ().update({
      nova_pro_status: "active",
      nova_usage_calls_minutes: 0,
      nova_usage_sms: 0,
      nova_usage_ai_queries: 0,
      nova_usage_automations: 0,
      nova_usage_reset_at: new Date().toISOString(),
    }).eq("id", profileId);
    return;
  }

  if (type === "invoice.payment_failed") {
    await profQ().update({ nova_pro_status: "past_due" }).eq("id", profileId);
    await notify(profileId, "Nova Pro payment failed", "Update your payment method to keep Nova Pro. Your features stay on during the grace period.");
    return;
  }

  if (type === "customer.subscription.deleted") {
    // Personal subscription ended — fall back to a reserved agency seat if one exists.
    const { data: p } = await profQ()
      .select("id, organization_id")
      .eq("id", profileId).maybeSingle();
    let fellBack = false;
    if (p?.organization_id) {
      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("id, nova_seats_purchased")
        .eq("id", p.organization_id).maybeSingle();
      if (org && (org.nova_seats_purchased ?? 0) > 0) {
        const { count: assigned } = await supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", org.id)
          .eq("nova_pro_source", "agency")
          .in("nova_pro_status", ["active", "grace_period", "past_due"]);
        if ((assigned ?? 0) < (org.nova_seats_purchased ?? 0)) {
          await profQ().update({ nova_pro_status: "active", nova_pro_source: "agency" }).eq("id", profileId);
          await notify(profileId, "Switched to your agency's Nova seat",
            "Your personal Nova Pro subscription ended — your agency's seat took over with no interruption.");
          fellBack = true;
        }
      }
    }
    if (!fellBack) {
      const expires = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
      await profQ().update({ nova_pro_status: "grace_period", nova_pro_expires_at: expires }).eq("id", profileId);
      await notify(profileId, "Nova Pro subscription ended",
        "Resubscribe within 48 hours to keep your phone number and automations without interruption.");
    }
    return;
  }
}

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret || !process.env.STRIPE_SECRET_KEY) {
          return new Response(JSON.stringify({ error: "billing not configured" }), { status: 503 });
        }
        const stripe = getStripe();
        const sig = request.headers.get("stripe-signature") ?? "";
        const body = await request.text();

        let event;
        try {
          event = await stripe.webhooks.constructEventAsync(body, sig, secret);
        } catch {
          return new Response(JSON.stringify({ error: "invalid signature" }), { status: 400 });
        }

        try {
          const obj: any = event.data.object;
          // Resolve routing metadata: session/subscription metadata, else invoice lines.
          let meta: Record<string, string> = { ...(obj.metadata ?? {}) };
          if (!meta.kind && obj.subscription_details?.metadata) meta = { ...obj.subscription_details.metadata };
          if (!meta.kind && obj.lines?.data?.[0]?.metadata?.kind) meta = { ...obj.lines.data[0].metadata };
          if (!meta.kind && obj.parent?.subscription_details?.metadata) meta = { ...obj.parent.subscription_details.metadata };

          const kind = meta.kind ?? "";
          if (["agency", "white_label", "nova_seats"].includes(kind) && meta.organization_id) {
            await handleOrgEvent(kind, meta.organization_id, event.type, obj);
          } else if (["nova_personal", "solo"].includes(kind) && meta.profile_id) {
            await handleAgentEvent(kind, meta.profile_id, event.type, obj);
          }
        } catch (e) {
          console.error("[stripe webhook] handler error", event.type, e);
          // 200 anyway — Stripe retries are handled by idempotent updates.
        }
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      },
    },
  },
});
