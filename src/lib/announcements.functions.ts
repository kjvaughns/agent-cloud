import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId } from "@/lib/org-guard";
import {
  AUDIENCES, resolveAudience, normalizeChannels, collapseGroups,
  type Audience, type Channel,
} from "@/lib/announcements/audience";

// Generated DB types predate the audience migration; cast until regenerated.
const supabaseAdmin = _admin as any;

type Ctx = { supabase: any; userId: string };

/**
 * Posting an announcement was rejected for every agency owner.
 *
 * `createAnnouncement` never set `organization_id`, and the org-isolation
 * write policy is `organization_id is not null and is_org_owner(...)`. A null
 * org fails that outright, so the insert threw. It went unnoticed because the
 * button that triggers it was gated on a *different* rule — `user_roles`
 * admin/manager — so the UI happily offered an action the database refused.
 *
 * Both halves are fixed here: the org is always set, and the gate below asks
 * the same question the policy does.
 */
export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);

    // RLS scopes this to the reader's agencies; select("*") so the pre-migration
    // window does not 400 on columns that do not exist yet.
    const { data, error } = await supabase
      .from("announcements")
      .select("*, profiles:created_by(first_name, last_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as any[];

    // Which channels each post actually went out on. Best-effort: the ledger
    // arrives with the same migration as the columns above.
    let channels: Record<string, string[]> = {};
    if (rows.length > 0) {
      const { data: deliveries } = await supabaseAdmin
        .from("announcement_deliveries")
        .select("announcement_id, channel, status")
        .in("announcement_id", rows.map((r) => r.id));
      for (const d of deliveries ?? []) {
        if (d.status !== "sent") continue;
        const list = channels[d.announcement_id] ?? [];
        if (!list.includes(d.channel)) list.push(d.channel);
        channels[d.announcement_id] = list;
      }
    }

    return collapseGroups(rows, orgId).map((r) => ({
      ...r,
      channels: channels[r.id] ?? [],
    }));
  });

/**
 * The same question the write policy asks.
 *
 * This used to read `user_roles` for admin/manager, which is neither what the
 * policy checks nor what "runs this agency" means here. A manager who is not
 * the owner was shown the button and got an error from the database.
 */
export const canPostAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return { canPost: false, hasSubAgencies: false };

    const [{ data: org }, { data: children }] = await Promise.all([
      supabaseAdmin.from("organizations").select("owner_id").eq("id", orgId).maybeSingle(),
      supabaseAdmin.from("organizations").select("id").eq("parent_org_id", orgId).limit(1),
    ]);

    return {
      canPost: org?.owner_id === userId,
      // Drives whether the audience picker offers its second option at all.
      hasSubAgencies: (children ?? []).length > 0,
    };
  });

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  bodyHtml: z.string().min(1).max(50000),
  audience: z.enum(AUDIENCES).default("agency"),
  channels: z.array(z.string()).default([]),
});

export const createAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("You are not in an agency.");

    const { data: org } = await supabaseAdmin
      .from("organizations").select("owner_id, name").eq("id", orgId).maybeSingle();
    if (org?.owner_id !== userId) {
      throw new Error("Only the agency owner can post announcements.");
    }

    const channels = normalizeChannels(data.channels);

    // Downward only, and only through active relationships. Wrapped because
    // agency_relationships arrives with its own migration; without it there
    // are no sub-agencies to reach and the sender's own org is the audience.
    let targets = [orgId];
    if (data.audience === "agency_and_subs") {
      try {
        const { data: rels } = await supabaseAdmin
          .from("agency_relationships").select("parent_org_id, child_org_id, status");
        targets = resolveAudience(orgId, "agency_and_subs", (rels ?? []) as any[]);
      } catch {
        targets = [orgId];
      }
    }

    // One row per agency so each one's feed shows it under the RLS that
    // already works; the group id ties them back together for the sender.
    const groupId = targets.length > 1 ? crypto.randomUUID() : null;
    const { data: inserted, error } = await supabaseAdmin
      .from("announcements")
      .insert(targets.map((target) => ({
        title: data.title,
        body_html: data.bodyHtml,
        created_by: userId,
        organization_id: target,
        audience: data.audience,
        announcement_group_id: groupId,
      })))
      .select("id, organization_id");
    if (error) throw new Error(error.message);

    // Delivery is best-effort and deliberately non-fatal. The post is already
    // persisted and readable; losing it because a webhook timed out would be a
    // worse outcome than a post that reached one channel instead of three.
    for (const row of inserted ?? []) {
      await deliver({
        announcementId: row.id,
        orgId: row.organization_id,
        title: data.title,
        bodyHtml: data.bodyHtml,
        fromName: org?.name ?? "Your agency",
        channels,
      }).catch((e: any) =>
        console.error("[announcements] delivery failed:", e?.message));
    }

    return { ok: true as const, count: (inserted ?? []).length, groupId };
  });

/**
 * Fan one announcement out to the channels an agency asked for.
 *
 * Every attempt is logged to `announcement_deliveries`, including the ones
 * that were skipped — "nobody was emailed because everybody had that category
 * off" and "nobody was emailed because the send failed" are different answers,
 * and a ledger that only records successes cannot tell them apart.
 */
async function deliver(opts: {
  announcementId: string;
  orgId: string;
  title: string;
  bodyHtml: string;
  fromName: string;
  channels: Channel[];
}) {
  const { announcementId, orgId, title, bodyHtml, fromName, channels } = opts;

  const log = async (channel: Channel, status: "sent" | "failed" | "skipped", target?: string, error?: string) => {
    await supabaseAdmin.from("announcement_deliveries").insert({
      announcement_id: announcementId,
      organization_id: orgId,
      channel, status, target: target ?? null, error: error ?? null,
    });
  };

  const { data: members } = await supabaseAdmin
    .from("profiles").select("id").eq("organization_id", orgId).neq("status", "terminated");
  const recipients = (members ?? []).map((m: any) => m.id);

  // ── In the app ───────────────────────────────────────────────────────────
  if (channels.includes("in_app")) {
    try {
      const allowed: string[] = [];
      for (const id of recipients) {
        const { data: ok } = await supabaseAdmin.rpc("may_notify", { _profile: id, _category: "announcements" });
        // A missing function or a null answer must not silence the feed: the
        // preference defaults to on, so default to sending.
        if (ok !== false) allowed.push(id);
      }
      if (allowed.length > 0) {
        await supabaseAdmin.from("notifications").insert(allowed.map((id) => ({
          user_id: id, type: "announcement", title, description: `New announcement from ${fromName}`, read: false,
        })));
      }
      await log("in_app", allowed.length > 0 ? "sent" : "skipped", `${allowed.length} of ${recipients.length}`);
    } catch (e: any) {
      await log("in_app", "failed", undefined, e?.message);
    }
  }

  // ── Email ────────────────────────────────────────────────────────────────
  if (channels.includes("email")) {
    try {
      const { sendTransactionalEmail } = await import("@/lib/email/send.server");
      let sent = 0;
      for (const id of recipients) {
        // Both consent layers — the agency's category switch and the
        // individual's may_notify — are enforced inside the sender.
        const res = await sendTransactionalEmail({
          template: "announcement",
          profileId: id,
          orgId,
          category: "announcements",
          // Event-level, not per attempt: re-running must not re-send.
          key: `announcement:${announcementId}:${id}`,
          data: { title, bodyHtml, fromName },
        });
        if (res.sent) sent += 1;
      }
      await log("email", sent > 0 ? "sent" : "skipped", `${sent} of ${recipients.length}`);
    } catch (e: any) {
      await log("email", "failed", undefined, e?.message);
    }
  }

  // ── Discord ──────────────────────────────────────────────────────────────
  if (channels.includes("discord")) {
    try {
      const { announceToDiscord } = await import("@/lib/discord.functions");
      const result = await announceToDiscord(orgId, title, bodyHtml);
      await log("discord", result.sent > 0 ? "sent" : "skipped", `${result.sent} channel(s)`);
    } catch (e: any) {
      await log("discord", "failed", undefined, e?.message);
    }
  }
}
