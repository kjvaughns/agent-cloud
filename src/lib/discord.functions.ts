import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { assertOrgOwner, getMyPrimaryOrgId } from "@/lib/org-guard";
// Backoff, health, and the two patches a send outcome writes. One place, so
// the ladder can be exercised without a database.
import { shouldAttempt, successPatch, failurePatch } from "@/lib/discord/retry";
import { piiProblems, productCategory, eventKey } from "@/lib/discord/message";
import { assertTabPermission } from "@/lib/settings/tab-guard.server";

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

// `select("*")` rather than a column list: `post_announcements` arrives with
// 20260814240000 and PostgREST rejects the whole select with 42703 when one
// name is missing. The webhook URL is stripped in code below, which is where
// that has always actually happened.
const WEBHOOK_COLUMNS = "*";

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
  // What this integration is FOR — Sales Bot, Recruiting Bot. Distinct from
  // channel_label, which is where it posts: an agency may send deals and new
  // agents to the same channel through two integrations with different
  // thresholds, and a list of three identical rows cannot be managed.
  name: z.string().trim().min(1).max(60).optional(),
  /** What this bot is for, in the owner's words. Shown on the card. */
  description: z.string().trim().max(280).nullable().optional(),
  channel_label: z.string().trim().max(80).nullable().optional(),
  enabled: z.boolean().optional(),
  post_deals: z.boolean().optional(),
  post_new_agents: z.boolean().optional(),
  post_announcements: z.boolean().optional(),
  // `post_milestones` is deliberately absent. The column stays, but there is
  // no milestone or streak concept anywhere in the product for it to gate, so
  // the control is gone from Settings rather than left as a switch a person
  // can set that can never do anything.
  min_annual_premium: z.number().min(0).max(1_000_000).optional(),
});

export const saveDiscordSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WebhookSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("No organization");
    // Was owner-only. The brief puts Discord under the Automations tab, which
    // staff may hold, so this widens to that permission — `assertTabPermission`
    // still returns true for the owner, so nobody who could do this before
    // loses it.
    //
    // A webhook URL is a bearer credential: anyone holding it can post to that
    // channel as the agency. So this is a real grant, not a formality, and it
    // is checked here rather than only in the tab that renders the form.
    await assertTabPermission(userId, "automations", orgId);

    const { id, ...fields } = data;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(fields)) if (v !== undefined) patch[k] = v;

    if (id) {
      // Scoped by organization_id as well as id: an owner may only edit their
      // own agency's channels, even holding somebody else's row id.
      let { data: row, error } = await supabaseAdmin
        .from("discord_integrations")
        .update(patch)
        .eq("id", id)
        .eq("organization_id", orgId)
        .select("id")
        .maybeSingle();
      // `name` arrives with 20260815020000. Naming it before it exists fails
      // the whole update, which would take the event toggles down with it —
      // so the rest of the edit still lands and only the name is refused.
      if (error?.code === "42703" && patch.name !== undefined) {
        const { name: _dropped, ...rest } = patch;
        ({ data: row, error } = await supabaseAdmin
          .from("discord_integrations")
          .update(rest)
          .eq("id", id)
          .eq("organization_id", orgId)
          .select("id")
          .maybeSingle());
        if (!error) {
          throw new Error(
            "Your other changes were saved. Naming a channel isn't available until the next update.",
          );
        }
      }
      if (error) throw new Error(friendlyError(error));
      if (!row) throw new Error("That Discord channel no longer exists.");
      return { ok: true, id: row.id };
    }

    if (!data.webhook_url) throw new Error("Add your Discord webhook URL to connect.");

    // A new bot sends exactly what was ticked, and nothing else. The database
    // defaults say deals-and-announcements-on, which is how a "sales" webhook
    // ended up posting announcements too — so every event is written
    // explicitly here rather than left to the column default.
    patch.post_deals = data.post_deals === true;
    patch.post_announcements = data.post_announcements === true;
    patch.post_new_agents = data.post_new_agents === true;
    if (!patch.post_deals && !patch.post_announcements && !patch.post_new_agents) {
      throw new Error("Pick at least one event for this bot to post.");
    }

    const { count } = await supabaseAdmin
      .from("discord_integrations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    if ((count ?? 0) >= MAX_WEBHOOKS) {
      throw new Error(`You can connect up to ${MAX_WEBHOOKS} Discord channels.`);
    }

    let { data: row, error } = await supabaseAdmin
      .from("discord_integrations")
      .insert({ ...patch, organization_id: orgId, created_by: userId })
      .select("id")
      .maybeSingle();
    // Same window: connecting a channel must keep working before the column
    // exists, so the name is dropped rather than the connection refused.
    if (error?.code === "42703" && patch.name !== undefined) {
      const { name: _dropped, ...rest } = patch;
      ({ data: row, error } = await supabaseAdmin
        .from("discord_integrations")
        .insert({ ...rest, organization_id: orgId, created_by: userId })
        .select("id")
        .maybeSingle());
    }
    if (error) throw new Error(friendlyError(error));
    return { ok: true, id: row?.id };
  });

/** 23505 here can only be the one-webhook-per-channel index. */
function friendlyError(error: { code?: string; message?: string }): string {
  if (error.code === "23505") return "That channel is already connected.";
  // 42703 in this window means the announcements column has not been applied
  // yet. Saying so beats relaying "column ... does not exist", and it tells
  // the owner the honest state: announcements are still going out.
  if (error.code === "42703") {
    return "That setting isn't available yet — announcements are still posted to every connected channel until the next update.";
  }
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

/** Raised when a payload would carry something that must not reach a channel. */
export class DiscordPrivacyError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join(" "));
    this.name = "DiscordPrivacyError";
  }
}

/**
 * Every send goes through here, so the privacy scan does too.
 *
 * The builders in `@/lib/discord/message` already cannot see a client — they
 * take narrow fact types rather than a policy row. This is the layer that
 * catches a forbidden value arriving inside a field that WAS allowed: an
 * announcement body somebody pasted a phone number into passes every earlier
 * check and must not reach a channel whose membership the agency does not
 * control.
 *
 * Refusing is deliberate rather than redacting. A message with a hole in it
 * reads as a bug and teaches nobody; a refusal with a reason in the delivery
 * ledger tells the owner what to edit.
 */
async function postToDiscord(webhookUrl: string, body: unknown) {
  const problems = piiProblems(JSON.stringify(body));
  if (problems.length > 0) throw new DiscordPrivacyError(problems);

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
 * One line in `discord_deliveries` per channel per attempt.
 *
 * `announceDeal` has always written these; the announcement path wrote none,
 * so the Deliveries list an owner opens to answer "did that go out?" showed
 * deals and nothing else. Same ledger, same shape, one helper — and never
 * fatal, because a delivery that succeeded and failed to be logged is still a
 * delivery.
 */
async function recordDelivery(opts: {
  orgId: string;
  integrationId: string;
  eventType: string;
  status: "sent" | "failed" | "skipped";
  httpStatus?: number | null;
  error?: string | null;
  policyId?: string | null;
  /** Why a skip was a skip. Absent for sent and failed. */
  skipReason?: string | null;
  /** Stable identity for the event, so a retry cannot post it twice. */
  eventKey?: string | null;
}): Promise<void> {
  const row = {
    organization_id: opts.orgId,
    integration_id: opts.integrationId,
    event_type: opts.eventType,
    policy_id: opts.policyId ?? null,
    status: opts.status,
    http_status: opts.httpStatus ?? null,
    error: opts.error ?? null,
    event_key: opts.eventKey ?? null,
  };
  try {
    const { error } = await supabaseAdmin
      .from("discord_deliveries")
      .insert({ ...row, skip_reason: opts.skipReason ?? null });
    // `skip_reason` arrives with 20260815020000. Naming it before it exists
    // fails the whole insert — which would stop the ledger recording ANY
    // delivery, sent ones included, and the ledger is what an owner opens to
    // answer "did that go out". So the reason is dropped rather than the row.
    if (error) {
      if (error.code !== "42703") throw error;
      const retry = await supabaseAdmin.from("discord_deliveries").insert(row);
      if (retry.error) throw retry.error;
    }
  } catch (e: any) {
    // 23505 is the "already sent this event to this channel" guard.
    if (e?.code !== "23505") console.error("[discord] delivery not recorded:", e?.message);
  }
}

/**
 * Has this exact event already landed in this channel?
 *
 * The unique index is the real guarantee; this read exists so a duplicate is a
 * skip with a reason rather than a failed insert an owner has to interpret.
 */
async function alreadySent(integrationId: string, key: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("discord_deliveries")
    .select("id")
    .eq("integration_id", integrationId)
    .eq("event_key", key)
    .eq("status", "sent")
    .maybeSingle();
  return !!data;
}

/**
 * Both marks write the retry counters as well as the timestamps.
 *
 * The patches come from `discord/retry.ts` so the backoff ladder is decided in
 * one place and can be exercised without a database. Each is wrapped: before
 * 20260815020000 applies, `consecutive_failures` and `next_retry_at` do not
 * exist and PostgREST rejects the whole update — which would lose the
 * `last_error` an owner reads, so the fallback writes the columns that have
 * always been there.
 */
async function markSuccess(integrationId: string) {
  const { error } = await supabaseAdmin
    .from("discord_integrations")
    .update(successPatch())
    .eq("id", integrationId);
  if (error) {
    await supabaseAdmin
      .from("discord_integrations")
      .update({ last_success_at: new Date().toISOString(), last_error: null, last_error_at: null })
      .eq("id", integrationId);
  }
}

async function markFailure(integrationId: string, message: string, previousFailures = 0) {
  const { error } = await supabaseAdmin
    .from("discord_integrations")
    .update(failurePatch(previousFailures, message))
    .eq("id", integrationId);
  if (error) {
    await supabaseAdmin
      .from("discord_integrations")
      .update({ last_error: message.slice(0, 500), last_error_at: new Date().toISOString() })
      .eq("id", integrationId);
  }
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

    // A channel whose webhook has been failing is rested rather than retried on
    // every deal. Skipping is recorded below, so the gap is visible instead of
    // silent, and it recovers by itself the moment the webhook works again.
    const eligible = (configs ?? []) as any[];
    const resting = eligible.filter((c) => !shouldAttempt(c));
    const targets = eligible.filter((c) => shouldAttempt(c));
    for (const c of resting) {
      await recordDelivery({
        orgId: c.organization_id, integrationId: c.id, eventType: "deal_posted",
        status: "skipped", policyId: policy.id, skipReason: "in_backoff",
      });
    }
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
      // A category, never the specific plan a named client bought.
      { name: "Product", value: productCategory(policy.product) ?? "—", inline: true },
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
        const key = eventKey(cfg.id, "sales", policy.id);
        try {
          if (annual < Number(cfg.min_annual_premium ?? 0)) {
            await recordDelivery({
              orgId: cfg.organization_id,
              integrationId: cfg.id,
              eventType: "deal_posted",
              policyId: policy.id,
              status: "skipped",
              error: "Below this channel's minimum premium threshold",
              skipReason: "below_threshold",
              eventKey: key,
            });
            return;
          }

          // The event key is unique across sent rows for this bot, so a retry
          // or a double submit is recognised rather than posted twice.
          if (await alreadySent(cfg.id, key)) return;

          const status = await postToDiscord(cfg.webhook_url, body);

          await recordDelivery({
            orgId: cfg.organization_id,
            integrationId: cfg.id,
            eventType: "deal_posted",
            policyId: policy.id,
            status: "sent",
            httpStatus: status,
            eventKey: key,
          });

          await markSuccess(cfg.id);
        } catch (e: any) {
          // 23505 = already announced in this channel. Not worth surfacing.
          if (e?.code === "23505") return;
          const msg = String(e?.message ?? e).slice(0, 500);
          try {
            await recordDelivery({
              orgId: cfg.organization_id,
              integrationId: cfg.id,
              eventType: "deal_posted",
              policyId: policy.id,
              status: "failed",
              httpStatus: e?.status ?? null,
              error: msg,
              eventKey: key,
            });
            await markFailure(cfg.id, msg, cfg.consecutive_failures ?? 0);
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

/**
 * Announce that somebody joined the agency.
 *
 * `post_new_agents` has been in Settings since Discord shipped, described as
 * "When someone joins the agency", stored on every channel — and read by
 * nothing. An owner could turn it on and wait forever. This is the sender it
 * has always implied.
 *
 * Same contract as `announceDeal`: never throws. Somebody's account being
 * created must not fail because a webhook is down, and the join has already
 * happened by the time this runs.
 *
 * A name and nothing else. A Discord server often has wide membership, and
 * the same reasoning that keeps client identity out of the deal post keeps a
 * new agent's email and phone out of this one.
 */
export async function announceNewAgent(profileId: string): Promise<void> {
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, organization_id, first_name, last_name")
      .eq("id", profileId)
      .maybeSingle();
    if (!profile?.organization_id) return;

    const orgId = profile.organization_id as string;

    const { refusedForDemo } = await import("@/lib/demo.server");
    if (await refusedForDemo(orgId, "send a webhook")) return;

    // The joining agent's own agency only. A new agent is the agency's news;
    // a parent IMO's channels are not automatically told who a sub-agency
    // hired, which is what the sales feed's opt-in relationship is for and
    // this has no equivalent of.
    const { data: configs } = await supabaseAdmin
      .from("discord_integrations")
      .select("*")
      .eq("organization_id", orgId)
      .eq("enabled", true)
      .eq("post_new_agents", true);

    const targets = ((configs ?? []) as any[]).filter((c) => shouldAttempt(c));
    if (targets.length === 0) return;

    const name = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
    // No name yet means the profile row exists before onboarding filled it in.
    // "Someone" is honest; a blank line in a Discord channel is not.
    const who = name || "Someone new";

    const body = {
      username: "Agent Cloud",
      embeds: [
        {
          title: "👋 New agent joined",
          description: clamp(`**${who}** just joined the agency.`),
          color: GOLD,
          timestamp: new Date().toISOString(),
          footer: { text: "Agent Cloud" },
        },
      ],
    };

    await Promise.all(
      targets.map(async (cfg) => {
        if (!cfg.webhook_url) return;
        const key = eventKey(cfg.id, "new_agents", profile.id);
        try {
          if (await alreadySent(cfg.id, key)) return;
          const status = await postToDiscord(cfg.webhook_url, body);
          await recordDelivery({
            orgId,
            integrationId: cfg.id,
            eventType: "agent_joined",
            status: "sent",
            httpStatus: status,
            eventKey: key,
          });
          await markSuccess(cfg.id);
        } catch (e: any) {
          if (e?.code === "23505") return;
          const msg = String(e?.message ?? e).slice(0, 500);
          await recordDelivery({
            orgId,
            integrationId: cfg.id,
            eventType: "agent_joined",
            status: "failed",
            httpStatus: e?.status ?? null,
            error: msg,
            eventKey: key,
          });
          await markFailure(cfg.id, msg, cfg.consecutive_failures ?? 0);
        }
      }),
    );
  } catch (e: any) {
    console.error("[discord] announceNewAgent:", e?.message);
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
      await markFailure(cfg.id, msg, cfg.consecutive_failures ?? 0);
      throw new Error(
        e?.status === 404
          ? "Discord rejected that webhook — it may have been deleted. Create a new one and paste it again."
          : `Discord rejected the message: ${msg}`,
      );
    }
  });

export const listDiscordDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ integrationId: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    let q = supabase
      .from("discord_deliveries")
      .select("id, event_type, status, http_status, error, skip_reason, event_key, created_at, integration_id")
      .order("created_at", { ascending: false })
      .limit(data.integrationId ? 25 : 50);
    if (data.integrationId) q = q.eq("integration_id", data.integrationId);
    const { data: rows, error } = await q;
    if (error) return { deliveries: [] };
    return { deliveries: rows ?? [] };
  });

/**
 * Send a failed delivery again, under its original event key.
 *
 * Re-sending is safe precisely because the key is stable: a retry either lands
 * once or is recognised as already sent. Only failed rows may be retried — a
 * skip was a decision, not an accident.
 */
export const retryDiscordDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("No organization");
    await assertTabPermission(userId, "automations", orgId);

    const { data: row } = await supabaseAdmin
      .from("discord_deliveries")
      .select("id, integration_id, event_type, event_key, policy_id, status")
      .eq("id", data.id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!row) throw new Error("That delivery no longer exists.");
    if (row.status !== "failed") throw new Error("Only failed deliveries can be retried.");

    const { data: cfg } = await supabaseAdmin
      .from("discord_integrations")
      .select("*")
      .eq("id", row.integration_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!cfg?.webhook_url) throw new Error("That Discord bot no longer exists.");

    if (row.event_key && (await alreadySent(cfg.id, row.event_key))) {
      return { ok: true, alreadySent: true };
    }

    // The original event is rebuilt rather than stored: a deal's premium may
    // have been corrected since, and the channel should hear what is true now.
    if (row.event_type === "deal_posted" && row.policy_id) {
      await announceDeal(row.policy_id);
      return { ok: true, alreadySent: false };
    }

    try {
      const status = await postToDiscord(cfg.webhook_url, {
        username: "Agent Cloud",
        embeds: [{
          title: "🔁 Retried delivery",
          description: "A previously failed Agent Cloud post was retried.",
          color: GOLD,
          timestamp: new Date().toISOString(),
        }],
      });
      await recordDelivery({
        orgId,
        integrationId: cfg.id,
        eventType: row.event_type,
        status: "sent",
        httpStatus: status,
        eventKey: row.event_key,
      });
      await markSuccess(cfg.id);
      return { ok: true, alreadySent: false };
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 500);
      await recordDelivery({
        orgId,
        integrationId: cfg.id,
        eventType: row.event_type,
        status: "failed",
        httpStatus: e?.status ?? null,
        error: msg,
        eventKey: row.event_key,
      });
      await markFailure(cfg.id, msg, cfg.consecutive_failures ?? 0);
      throw new Error(`Discord rejected the message: ${msg}`);
    }
  });

/**
 * Post an agency announcement to that agency's own Discord channels.
 *
 * Deliberately narrower than `announceDeal`: no walk up the parent chain. A
 * sub-agency's Discord belongs to the sub-agency, and an announcement already
 * reaches it as its own row with its own delivery — pushing it up or down a
 * webhook chain as well would post the same notice twice in one channel.
 *
 * Never throws. The caller has already persisted the post; a Discord outage
 * must not turn a published announcement into an error.
 */
export async function announceToDiscord(
  orgId: string,
  title: string,
  bodyHtml: string,
  subjectId?: string,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  try {
    const { refusedForDemo } = await import("@/lib/demo.server");
    if (await refusedForDemo(orgId, "send a webhook")) return { sent, failed };

    // A bot posts announcements only if it was ticked for announcements. This
    // used to read `!== false`, which meant a bot created for sales alone —
    // and landing on the column default — also received every agency notice.
    const { data: allHooks } = await supabaseAdmin
      .from("discord_integrations")
      .select("*")
      .eq("organization_id", orgId)
      .eq("enabled", true);
    const hooks = ((allHooks ?? []) as any[]).filter(
      (h) => h.post_announcements === true && shouldAttempt(h),
    );

    // Discord renders markdown, not HTML. Tags out, entities back, and a cap
    // well under the 2000-character limit the API enforces.
    const text = bodyHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 1500);

    for (const hook of hooks) {
      if (!hook.webhook_url) continue;
      // Identity is the announcement itself, so re-dispatching the same notice
      // cannot post it twice into one channel.
      const key = eventKey(hook.id, "announcements", subjectId ?? title.slice(0, 80));
      try {
        if (await alreadySent(hook.id, key)) continue;
        const status = await postToDiscord(hook.webhook_url, {
          embeds: [{ title: title.slice(0, 256), description: text || "(no content)", color: GOLD }],
        });
        await recordDelivery({
          orgId,
          integrationId: hook.id,
          eventType: "announcement",
          status: "sent",
          httpStatus: status,
          eventKey: key,
        });
        await markSuccess(hook.id);
        sent += 1;
      } catch (e: any) {
        if (e?.code === "23505") continue;
        const msg = String(e?.message ?? e).slice(0, 500);
        await recordDelivery({
          orgId,
          integrationId: hook.id,
          eventType: "announcement",
          status: "failed",
          httpStatus: e?.status ?? null,
          error: msg,
          eventKey: key,
        });
        await markFailure(hook.id, msg, hook.consecutive_failures ?? 0);
        failed += 1;
      }
    }
  } catch (e: any) {
    console.error("[discord] announceToDiscord:", e?.message);
  }
  return { sent, failed };
}
