import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { assertOrgOwner, getMyPrimaryOrgId } from "@/lib/org-guard";

const supabaseAdmin = _admin as any;

type Ctx = { supabase: any; userId: string };

/**
 * Discord sales bot.
 *
 * Announces posted deals in the agency's own Discord server via an incoming
 * webhook.
 *
 * The webhook URL is a bearer credential — anyone holding it can post to that
 * channel. So it is owner-only at the RLS layer, never returned to the browser
 * in full, and every send happens server-side.
 */

const GOLD = 0xcba35a;

/** Discord rejects anything over 2000 characters outright. */
function clamp(s: string, max = 1024) {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

/** Show enough of the URL to recognise it, never enough to use it. */
function maskWebhook(url: string) {
  const m = /discord\.com\/api\/webhooks\/(\d+)\//.exec(url);
  return m ? `…/webhooks/${m[1]}/••••••` : "••••••";
}

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// ── Settings ────────────────────────────────────────────────────────────────

export const getDiscordSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return { settings: null, isOwner: false };

    const { data: org } = await supabaseAdmin
      .from("organizations").select("owner_id").eq("id", orgId).maybeSingle();
    const isOwner = org?.owner_id === userId;
    if (!isOwner) return { settings: null, isOwner: false };

    const { data } = await supabaseAdmin
      .from("discord_integrations")
      .select("*")
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!data) return { settings: null, isOwner: true };

    // Never hand the full credential back to the client.
    const { webhook_url, ...rest } = data;
    return {
      settings: { ...rest, webhook_masked: maskWebhook(webhook_url), configured: true },
      isOwner: true,
    };
  });

export const saveDiscordSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      // Omit to keep the stored URL — the UI never receives it to send back.
      webhook_url: z
        .string()
        .url()
        .refine((u) => /^https:\/\/(canary\.|ptb\.)?discord\.com\/api\/webhooks\//.test(u), {
          message: "That is not a Discord webhook URL.",
        })
        .optional(),
      channel_label: z.string().trim().max(80).nullable().optional(),
      enabled: z.boolean().optional(),
      post_deals: z.boolean().optional(),
      post_milestones: z.boolean().optional(),
      post_new_agents: z.boolean().optional(),
      min_annual_premium: z.number().min(0).max(1_000_000).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("No organization");
    await assertOrgOwner(userId, orgId);

    const { data: existing } = await supabaseAdmin
      .from("discord_integrations").select("organization_id").eq("organization_id", orgId).maybeSingle();

    if (!existing && !data.webhook_url) {
      throw new Error("Add your Discord webhook URL to connect.");
    }

    const patch: Record<string, unknown> = {
      organization_id: orgId,
      created_by: userId,
      updated_at: new Date().toISOString(),
    };
    for (const [k, v] of Object.entries(data)) if (v !== undefined) patch[k] = v;

    const { error } = await supabaseAdmin
      .from("discord_integrations")
      .upsert(patch, { onConflict: "organization_id" });
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const disconnectDiscord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("No organization");
    await assertOrgOwner(userId, orgId);

    const { error } = await supabaseAdmin
      .from("discord_integrations").delete().eq("organization_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Sending ─────────────────────────────────────────────────────────────────

async function postToDiscord(webhookUrl: string, body: unknown) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // Discord returns 204 with no body on success.
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(text || `Discord returned ${res.status}`), { status: res.status });
  }
  return res.status;
}

/**
 * Announce a posted deal.
 *
 * Called from the deal-posting path. Deliberately never throws: a Discord
 * outage must not fail the deal that was just written. Every outcome —
 * including "skipped" — is recorded so an owner can see why nothing appeared.
 */
export async function announceDeal(policyId: string): Promise<void> {
  try {
    const { data: policy } = await supabaseAdmin
      .from("policies")
      .select("id, organization_id, agent_id, product, annual_premium, monthly_premium, face_amount, carrier_id, effective_date")
      .eq("id", policyId)
      .maybeSingle();
    if (!policy?.organization_id) return;

    // The far end of a webhook is a real Discord channel with real people in
    // it. Silent rather than thrown, matching this function's contract.
    const { refusedForDemo } = await import("@/lib/demo.server");
    if (await refusedForDemo(policy.organization_id, "send a webhook")) return;

    const { data: cfg } = await supabaseAdmin
      .from("discord_integrations")
      .select("*")
      .eq("organization_id", policy.organization_id)
      .maybeSingle();

    if (!cfg || !cfg.enabled || !cfg.post_deals) return;

    const annual = Number(policy.annual_premium ?? 0);
    if (annual < Number(cfg.min_annual_premium ?? 0)) {
      await supabaseAdmin.from("discord_deliveries").insert({
        organization_id: policy.organization_id,
        event_type: "deal_posted",
        policy_id: policy.id,
        status: "skipped",
        error: "Below the agency's minimum premium threshold",
      });
      return;
    }

    const [{ data: agent }, { data: carrier }] = await Promise.all([
      supabaseAdmin.from("profiles").select("first_name, last_name").eq("id", policy.agent_id).maybeSingle(),
      policy.carrier_id
        ? supabaseAdmin.from("carriers").select("name").eq("id", policy.carrier_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const agentName = `${agent?.first_name ?? ""} ${agent?.last_name ?? ""}`.trim() || "An agent";

    // No client name, no policy number — a Discord channel is not a place for
    // customer identity, and these servers often have wide membership.
    const fields = [
      { name: "Agent", value: agentName, inline: true },
      { name: "Carrier", value: carrier?.name ?? "—", inline: true },
      { name: "Product", value: policy.product || "—", inline: true },
      { name: "Annual Premium", value: money(annual), inline: true },
      { name: "Monthly", value: money(Number(policy.monthly_premium ?? 0)), inline: true },
      { name: "Face Amount", value: policy.face_amount ? money(Number(policy.face_amount)) : "—", inline: true },
    ];

    const status = await postToDiscord(cfg.webhook_url, {
      username: "Agent Cloud",
      embeds: [
        {
          title: "💰 New Deal Posted",
          description: clamp(`**${agentName}** just wrote ${money(annual)} of annual premium.`),
          color: GOLD,
          fields,
          timestamp: new Date().toISOString(),
          footer: { text: "Agent Cloud" },
        },
      ],
    });

    // Unique on (policy_id, event_type) where status = 'sent', so a retry or a
    // double submit cannot announce the same deal twice.
    await supabaseAdmin.from("discord_deliveries").insert({
      organization_id: policy.organization_id,
      event_type: "deal_posted",
      policy_id: policy.id,
      status: "sent",
      http_status: status,
    });

    await supabaseAdmin
      .from("discord_integrations")
      .update({ last_success_at: new Date().toISOString(), last_error: null, last_error_at: null })
      .eq("organization_id", policy.organization_id);
  } catch (e: any) {
    // 23505 = already announced. Not an error worth surfacing.
    if (e?.code === "23505") return;
    try {
      const { data: policy } = await supabaseAdmin
        .from("policies").select("organization_id").eq("id", policyId).maybeSingle();
      if (policy?.organization_id) {
        await supabaseAdmin.from("discord_deliveries").insert({
          organization_id: policy.organization_id,
          event_type: "deal_posted",
          policy_id: policyId,
          status: "failed",
          http_status: e?.status ?? null,
          error: String(e?.message ?? e).slice(0, 500),
        });
        await supabaseAdmin
          .from("discord_integrations")
          .update({ last_error: String(e?.message ?? e).slice(0, 500), last_error_at: new Date().toISOString() })
          .eq("organization_id", policy.organization_id);
      }
    } catch {
      // Logging the failure must not itself throw.
    }
  }
}

/** Owner-triggered test post, so setup can be verified without writing a deal. */
export const sendDiscordTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("No organization");
    await assertOrgOwner(userId, orgId);

    const { assertNotDemo } = await import("@/lib/demo.server");
    await assertNotDemo(orgId, "send a webhook");

    const { data: cfg } = await supabaseAdmin
      .from("discord_integrations").select("webhook_url").eq("organization_id", orgId).maybeSingle();
    if (!cfg?.webhook_url) throw new Error("Connect Discord first.");

    try {
      const status = await postToDiscord(cfg.webhook_url, {
        username: "Agent Cloud",
        embeds: [{
          title: "✅ Agent Cloud is connected",
          description: "Posted deals will announce in this channel.",
          color: GOLD,
          timestamp: new Date().toISOString(),
        }],
      });
      await supabaseAdmin
        .from("discord_integrations")
        .update({ last_success_at: new Date().toISOString(), last_error: null, last_error_at: null })
        .eq("organization_id", orgId);
      return { ok: true, status };
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 500);
      await supabaseAdmin
        .from("discord_integrations")
        .update({ last_error: msg, last_error_at: new Date().toISOString() })
        .eq("organization_id", orgId);
      throw new Error(
        e?.status === 404
          ? "Discord rejected that webhook — it may have been deleted. Create a new one and paste it again."
          : `Discord rejected the message: ${msg}`,
      );
    }
  });

export const listDiscordDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data, error } = await supabase
      .from("discord_deliveries")
      .select("id, event_type, status, http_status, error, created_at")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) return { deliveries: [] };
    return { deliveries: data ?? [] };
  });
