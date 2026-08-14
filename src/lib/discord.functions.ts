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
 * An agency can connect several channels — a sales channel that hears about
 * every deal, a leadership channel that only hears about the big ones — so
 * each webhook is its own row with its own threshold and its own event
 * switches. The delivery ledger records which webhook each announcement went
 * to, which is also what stops the idempotency guard from letting the first
 * channel announce a deal and calling every other channel a duplicate.
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

const WEBHOOK_COLUMNS =
  "id, channel_label, enabled, post_deals, post_milestones, post_new_agents, min_annual_premium, last_success_at, last_error, last_error_at, created_at";

/** Somebody will paste the same channel twice; there is no limit worth arguing about beyond that. */
const MAX_WEBHOOKS = 10;

// ── Settings ────────────────────────────────────────────────────────────────

export const getDiscordSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return { webhooks: [], isOwner: false, maxWebhooks: MAX_WEBHOOKS };

    const { data: org } = await supabaseAdmin
      .from("organizations").select("owner_id").eq("id", orgId).maybeSingle();
    const isOwner = org?.owner_id === userId;
    if (!isOwner) return { webhooks: [], isOwner: false, maxWebhooks: MAX_WEBHOOKS };

    const { data } = await supabaseAdmin
      .from("discord_integrations")
      // The full URL never leaves the server; the masked form is enough to
      // recognise which channel a row is.
      .select(`${WEBHOOK_COLUMNS}, webhook_url`)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true });

    const webhooks = ((data ?? []) as any[]).map(({ webhook_url, ...rest }) => ({
      ...rest,
      webhook_masked: maskWebhook(webhook_url),
    }));

    return { webhooks, isOwner: true, maxWebhooks: MAX_WEBHOOKS };
  });

const WebhookSchema = z.object({
  /** Omitted when adding a channel; present when editing one. */
  id: z.string().uuid().optional(),
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
});

export const saveDiscordSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WebhookSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("No organization");
    await assertOrgOwner(userId, orgId);

    const { id, ...fields } = data;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) patch[k] = v;

    if (id) {
      // Scoped by organization_id as well as id: an owner may only edit their
      // own agency's channels, even holding somebody else's row id.
      const { data: row, error } = await supabaseAdmin
        .from("discord_integrations")
        .update(patch)
        .eq("id", id)
        .eq("organization_id", orgId)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(friendlyError(error));
      if (!row) throw new Error("That Discord channel no longer exists.");
      return { ok: true, id: row.id };
    }

    if (!data.webhook_url) throw new Error("Add your Discord webhook URL to connect.");

    const { count } = await supabaseAdmin
      .from("discord_integrations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    if ((count ?? 0) >= MAX_WEBHOOKS) {
      throw new Error(`You can connect up to ${MAX_WEBHOOKS} Discord channels.`);
    }

    const { data: row, error } = await supabaseAdmin
      .from("discord_integrations")
      .insert({ ...patch, organization_id: orgId, created_by: userId })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(friendlyError(error));
    return { ok: true, id: row?.id };
  });

/** 23505 here can only be the one-webhook-per-channel index. */
function friendlyError(error: { code?: string; message?: string }): string {
  if (error.code === "23505") return "That channel is already connected.";
  return error.message ?? "Could not save that Discord channel.";
}

export const disconnectDiscord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("No organization");
    await assertOrgOwner(userId, orgId);

    const { error } = await supabaseAdmin
      .from("discord_integrations")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", orgId);
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

async function markSuccess(integrationId: string) {
  await supabaseAdmin
    .from("discord_integrations")
    .update({ last_success_at: new Date().toISOString(), last_error: null, last_error_at: null })
    .eq("id", integrationId);
}

async function markFailure(integrationId: string, message: string) {
  await supabaseAdmin
    .from("discord_integrations")
    .update({ last_error: message.slice(0, 500), last_error_at: new Date().toISOString() })
    .eq("id", integrationId);
}

/**
 * Announce a posted deal in every channel that wants it.
 *
 * Called from the deal-posting path. Deliberately never throws: a Discord
 * outage must not fail the deal that was just written. Every outcome —
 * including "skipped" — is recorded per channel, so an owner can see which
 * channel heard about a deal and which did not, and why.
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

    // The owner's own-feed toggle. If the writing agent owns this org and
    // turned "show my own sales in the team sales feed" off, the deal is
    // theirs to keep quiet — nothing posts, here or up the chain. Wrapped
    // because the columns land with the imo-scope migration.
    try {
      const { data: org } = await supabaseAdmin
        .from("organizations").select("owner_id").eq("id", policy.organization_id).maybeSingle();
      if (org?.owner_id === policy.agent_id) {
        const { data: os } = await supabaseAdmin
          .from("organization_settings")
          .select("show_own_sales_in_feed")
          .eq("organization_id", policy.organization_id)
          .maybeSingle();
        if (os && os.show_own_sales_in_feed === false) return;
      }
    } catch {
      // Column absent pre-migration: everyone participates, today's behaviour.
    }

    // The channels that hear about this deal: the org's own, plus every
    // ancestor agency whose relationship row lets the child's sales flow up
    // (active + allow_sales_feed). The walk is depth-capped and cycle-guarded;
    // a parent that paused the child, or turned the feed off, simply is not
    // in the list. Wrapped for the window before agency_relationships exists.
    const feedOrgIds = [policy.organization_id];
    try {
      const seen = new Set<string>(feedOrgIds);
      let cursor: string | null = policy.organization_id;
      for (let depth = 0; cursor && depth < 10; depth++) {
        const { data: rel }: { data: any } = await supabaseAdmin
          .from("agency_relationships")
          .select("parent_org_id")
          .eq("child_org_id", cursor)
          .eq("status", "active")
          .eq("allow_sales_feed", true)
          .maybeSingle();
        const parent: string | null = rel?.parent_org_id ?? null;
        if (!parent || seen.has(parent)) break;
        seen.add(parent);
        feedOrgIds.push(parent);
        cursor = parent;
      }
    } catch {
      // Table absent pre-migration: the org's own channels only.
    }

    const { data: configs } = await supabaseAdmin
      .from("discord_integrations")
      .select("*")
      .in("organization_id", feedOrgIds)
      .eq("enabled", true)
      .eq("post_deals", true);

    const targets = (configs ?? []) as any[];
    if (targets.length === 0) return;

    const annual = Number(policy.annual_premium ?? 0);

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

    const body = {
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
    };

    // One channel refusing, or failing, must not stop the others.
    await Promise.all(
      targets.map(async (cfg) => {
        try {
          if (annual < Number(cfg.min_annual_premium ?? 0)) {
            await supabaseAdmin.from("discord_deliveries").insert({
              organization_id: cfg.organization_id,
              integration_id: cfg.id,
              event_type: "deal_posted",
              policy_id: policy.id,
              status: "skipped",
              error: "Below this channel's minimum premium threshold",
            });
            return;
          }

          const status = await postToDiscord(cfg.webhook_url, body);

          // Unique on (policy_id, event_type, integration_id) where status =
          // 'sent', so a retry or a double submit cannot announce the same deal
          // twice in the same channel.
          await supabaseAdmin.from("discord_deliveries").insert({
            organization_id: cfg.organization_id,
            integration_id: cfg.id,
            event_type: "deal_posted",
            policy_id: policy.id,
            status: "sent",
            http_status: status,
          });

          await markSuccess(cfg.id);
        } catch (e: any) {
          // 23505 = already announced in this channel. Not worth surfacing.
          if (e?.code === "23505") return;
          const msg = String(e?.message ?? e).slice(0, 500);
          try {
            await supabaseAdmin.from("discord_deliveries").insert({
              organization_id: cfg.organization_id,
              integration_id: cfg.id,
              event_type: "deal_posted",
              policy_id: policy.id,
              status: "failed",
              http_status: e?.status ?? null,
              error: msg,
            });
            await markFailure(cfg.id, msg);
          } catch {
            // Logging the failure must not itself throw.
          }
        }
      }),
    );
  } catch {
    // Same contract: the deal is already written, and nothing here may undo it.
  }
}

/** Owner-triggered test post, so each channel can be verified on its own. */
export const sendDiscordTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("No organization");
    await assertOrgOwner(userId, orgId);

    const { assertNotDemo } = await import("@/lib/demo.server");
    await assertNotDemo(orgId, "send a webhook");

    const { data: cfg } = await supabaseAdmin
      .from("discord_integrations")
      .select("id, webhook_url")
      .eq("id", data.id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!cfg?.webhook_url) throw new Error("That Discord channel no longer exists.");

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
      await markSuccess(cfg.id);
      return { ok: true, status };
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 500);
      await markFailure(cfg.id, msg);
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
      .select("id, event_type, status, http_status, error, created_at, integration_id")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) return { deliveries: [] };
    return { deliveries: data ?? [] };
  });
