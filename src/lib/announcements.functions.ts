import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId } from "@/lib/org-guard";
import {
  AUDIENCES, resolveAudience, normalizeChannels, collapseGroups,
  type Audience, type Channel,
} from "@/lib/announcements/audience";
import {
  ANNOUNCEMENT_STATUSES, validate, dueForDispatch,
} from "@/lib/announcements/lifecycle";

// Generated DB types predate the audience migration; cast until regenerated.
const supabaseAdmin = _admin as any;

type Ctx = { supabase: any; userId: string };

/** Postgres `undefined_column`, which is how PostgREST reports a pending one. */
function isMissingColumn(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "42703" ||
    (typeof e.message === "string" &&
      /(status|publish_at|expires_at|target_roles|target_upline_id)/.test(e.message) &&
      /column/i.test(e.message));
}

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
    const channels: Record<string, string[]> = {};
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
  // Everything below defaults to exactly today's behaviour: published now, to
  // everybody, forever.
  status: z.enum(ANNOUNCEMENT_STATUSES).default("published"),
  publishAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  targetRoles: z.array(z.string().max(40)).max(10).default([]),
  targetUplineId: z.string().uuid().nullable().optional(),
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

    // Refuse before the round trip, so an owner gets "that time has already
    // passed" rather than a relayed check-constraint violation.
    const problem = validate({
      status: data.status,
      publishAt: data.publishAt ?? null,
      expiresAt: data.expiresAt ?? null,
    });
    if (problem) throw new Error(problem);

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
    const base = targets.map((target) => ({
      title: data.title,
      body_html: data.bodyHtml,
      created_by: userId,
      organization_id: target,
      audience: data.audience,
      announcement_group_id: groupId,
    }));

    let { data: inserted, error } = await supabaseAdmin
      .from("announcements")
      .insert(base.map((row) => ({
        ...row,
        status: data.status,
        publish_at: data.publishAt ?? null,
        expires_at: data.expiresAt ?? null,
        target_roles: data.targetRoles,
        target_upline_id: data.targetUplineId ?? null,
      })))
      .select("id, organization_id, status, publish_at, expires_at");

    // Before 20260815010000 applies, PostgREST does not know these columns and
    // rejects the whole insert. Posting must not break in that window — but
    // quietly dropping a schedule or a targeting rule would publish
    // immediately to everybody, which is the opposite of what was asked for
    // and cannot be taken back. So: today's behaviour still works, and
    // anything that needs the new columns says plainly that it cannot yet.
    if (error && isMissingColumn(error)) {
      const wantsNewBehaviour =
        data.status !== "published" ||
        Boolean(data.publishAt) ||
        Boolean(data.expiresAt) ||
        data.targetRoles.length > 0 ||
        Boolean(data.targetUplineId);
      if (wantsNewBehaviour) {
        throw new Error(
          "Scheduling, expiry and targeting aren't available on this database yet. " +
          "You can post this to the whole agency now, or wait until the update is applied.",
        );
      }
      ({ data: inserted, error } = await supabaseAdmin
        .from("announcements").insert(base).select("id, organization_id"));
    }
    if (error) throw new Error(error.message);

    // Every send is on the record, because "who told the whole agency that"
    // is a question that gets asked afterwards and the post itself does not
    // answer it — a deleted announcement leaves nothing at all.
    await recordAnnouncementAudit({
      orgId,
      actorId: userId,
      action: data.status === "published" ? "announcement.published" : "announcement.created",
      announcementIds: (inserted ?? []).map((r: any) => r.id),
      detail: {
        title: data.title,
        status: data.status,
        audience: data.audience,
        channels,
        publish_at: data.publishAt ?? null,
        expires_at: data.expiresAt ?? null,
        target_roles: data.targetRoles,
        target_upline_id: data.targetUplineId ?? null,
        agencies: targets.length,
      },
    });

    // A draft goes nowhere, and a scheduled post goes nowhere yet. Delivering
    // either immediately would make "schedule" mean "send now and pretend".
    if (data.status === "published") {
      // Delivery is best-effort and deliberately non-fatal. The post is
      // already persisted and readable; losing it because a webhook timed out
      // would be worse than a post that reached one channel instead of three.
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
    }

    return { ok: true as const, count: (inserted ?? []).length, groupId };
  });

/**
 * Publish a draft, reschedule, or take a post down.
 *
 * Taking one down sets an expiry rather than deleting it. A delete destroys
 * the only record that the message ever went out, which is exactly the thing
 * somebody asks about three weeks later.
 */
const UpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(ANNOUNCEMENT_STATUSES).optional(),
  publishAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

export const updateAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("You are not in an agency.");

    const { data: before } = await supabaseAdmin
      .from("announcements")
      .select("*")
      .eq("id", data.id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!before) throw new Error("That announcement is not available to you.");

    const { data: org } = await supabaseAdmin
      .from("organizations").select("owner_id, name").eq("id", orgId).maybeSingle();
    if (org?.owner_id !== userId) {
      throw new Error("Only the agency owner can change an announcement.");
    }

    const next = {
      status: data.status ?? before.status ?? "published",
      publishAt: data.publishAt !== undefined ? data.publishAt : before.publish_at,
      expiresAt: data.expiresAt !== undefined ? data.expiresAt : before.expires_at,
    };
    // Expiring something is the one case where a past date is the point.
    const problem = data.expiresAt !== undefined && data.status === undefined
      ? null
      : validate(next as any);
    if (problem) throw new Error(problem);

    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.publishAt !== undefined) patch.publish_at = data.publishAt;
    if (data.expiresAt !== undefined) patch.expires_at = data.expiresAt;

    // The whole group moves together, or a post sent to a parent and its
    // children would be live in one agency and expired in another.
    let q = supabaseAdmin.from("announcements").update(patch);
    q = before.announcement_group_id
      ? q.eq("announcement_group_id", before.announcement_group_id)
      : q.eq("id", data.id);
    const { data: touched, error } = await q.select("id");
    if (error) throw new Error(error.message);

    await recordAnnouncementAudit({
      orgId,
      actorId: userId,
      action:
        data.status === "published" ? "announcement.published"
        : data.expiresAt !== undefined && data.status === undefined ? "announcement.expired"
        : "announcement.updated",
      announcementIds: (touched ?? []).map((r: any) => r.id),
      detail: {
        title: before.title,
        previous: { status: before.status, publish_at: before.publish_at, expires_at: before.expires_at },
        next: patch,
      },
    });

    // A draft becoming published is the moment its channels are owed a send.
    if (data.status === "published" && before.status !== "published") {
      for (const row of touched ?? []) {
        await deliver({
          announcementId: row.id,
          orgId,
          title: before.title,
          bodyHtml: before.body_html ?? "",
          fromName: org?.name ?? "Your agency",
          channels: normalizeChannels(["in_app"]),
        }).catch((e: any) => console.error("[announcements] delivery failed:", e?.message));
      }
    }

    return { ok: true as const, count: (touched ?? []).length };
  });

/**
 * Send the channels for scheduled posts whose time has come.
 *
 * A scheduled announcement becomes readable in the app the instant its time
 * passes, because visibility is derived rather than stored — nothing has to
 * run. Email and Discord are the part that genuinely needs something to reach
 * out, and this repository has no scheduler it can create: the one pg_cron job
 * the product uses is applied through the Supabase Management API by an
 * external tool and calls an Edge Function that does not live here.
 *
 * So this is called opportunistically, when an owner opens the announcements
 * page. Safe to call as often as anybody likes: `announcement_deliveries`
 * records every attempt and the email sender keeps an event-level idempotency
 * key, so a second pass sends nothing twice.
 *
 * Being honest about the limit: delivery to Discord and email is punctual only
 * to the extent that somebody visits. Pointing a cron at this is the follow-up,
 * and it needs dashboard access this session does not have.
 */
export const dispatchDueAnnouncements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return { dispatched: 0 };

    const { data: org } = await supabaseAdmin
      .from("organizations").select("owner_id, name").eq("id", orgId).maybeSingle();
    if (org?.owner_id !== userId) return { dispatched: 0 };

    const { data: scheduled, error } = await supabaseAdmin
      .from("announcements")
      .select("*")
      .eq("organization_id", orgId)
      .eq("status", "scheduled")
      .limit(50);
    // Before the migration there is no `status` column and nothing is
    // scheduled, so there is nothing to dispatch and nothing to report.
    if (error) return { dispatched: 0 };

    const ids = (scheduled ?? []).map((r: any) => r.id);
    if (!ids.length) return { dispatched: 0 };

    const { data: already } = await supabaseAdmin
      .from("announcement_deliveries")
      .select("announcement_id")
      .in("announcement_id", ids);
    const delivered = new Set<string>((already ?? []).map((d: any) => String(d.announcement_id)));

    const due = dueForDispatch(scheduled as any[], delivered);
    for (const row of due) {
      await deliver({
        announcementId: row.id,
        orgId,
        title: row.title,
        bodyHtml: row.body_html ?? "",
        fromName: org?.name ?? "Your agency",
        channels: normalizeChannels(["in_app"]),
      }).catch((e: any) => console.error("[announcements] dispatch failed:", e?.message));
    }
    return { dispatched: due.length };
  });

/**
 * The same sweep, for every agency, with nobody logged in.
 *
 * Scheduled announcements appear in the feed on time without this, because
 * visibility is derived by the RLS policy. Email and Discord are the part that
 * has to reach out, and until now that only happened when an owner opened the
 * page — a message scheduled for 8am on a day nobody logged in early went out
 * late, or not at all.
 *
 * Called by pg_cron through /api/public/hooks/dispatch-announcements. There is
 * no session, so this iterates organizations explicitly and reads with the
 * admin client, exactly as the automations sweep does.
 *
 * Deliberately the same `deliver()` and the same `dueForDispatch()` the owner
 * path uses — a second copy of the fan-out would drift, and the two would
 * disagree about who got what. Nothing new tracks whether a post has been
 * sent: `announcement_deliveries` already records every attempt per
 * announcement and channel, and the email sender keeps an event-level
 * idempotency key, so running this every five minutes sends nothing twice.
 */
export async function dispatchAllDueAnnouncements(): Promise<{
  dispatched: number;
  organizations: number;
}> {
  const { data: scheduled, error } = await supabaseAdmin
    .from("announcements")
    .select("*")
    .eq("status", "scheduled")
    .limit(500);
  // Before the lifecycle migration there is no `status` column, so nothing is
  // scheduled and there is nothing to dispatch.
  if (error) return { dispatched: 0, organizations: 0 };

  const rows = (scheduled ?? []) as any[];
  if (!rows.length) return { dispatched: 0, organizations: 0 };

  const { data: already } = await supabaseAdmin
    .from("announcement_deliveries")
    .select("announcement_id")
    .in("announcement_id", rows.map((r) => r.id));
  const delivered = new Set<string>((already ?? []).map((d: any) => String(d.announcement_id)));

  const due = dueForDispatch(rows as any[], delivered);
  if (!due.length) return { dispatched: 0, organizations: 0 };

  const orgIds = Array.from(new Set(due.map((r: any) => r.organization_id).filter(Boolean)));
  const { data: orgs } = await supabaseAdmin
    .from("organizations").select("id, name").in("id", orgIds);
  const names = new Map<string, string>((orgs ?? []).map((o: any) => [o.id, o.name]));

  for (const row of due) {
    await deliver({
      announcementId: (row as any).id,
      orgId: (row as any).organization_id,
      title: (row as any).title,
      bodyHtml: (row as any).body_html ?? "",
      fromName: names.get((row as any).organization_id) ?? "Your agency",
      // A scheduled post is owed every channel the agency has configured. The
      // fan-out itself is what decides nothing gets sent: email honours both
      // consent layers, and Discord has nothing to post to unless a channel
      // is set up with announcements enabled.
      channels: normalizeChannels(["in_app", "email", "discord"]),
    }).catch((e: any) => console.error("[announcements] cron dispatch failed:", e?.message));
  }

  return { dispatched: due.length, organizations: orgIds.length };
}



/**
 * One row per agency the announcement went to.
 *
 * Reuses `contracting_audit_log`, which is the only audit table this schema
 * has. Its `record_type` is what tells announcements apart from contracting
 * rows, exactly as `contract_request` does in trail.server.ts. Swallowed, for
 * the same reason every other audit write here is: the post has already been
 * saved, and losing it over a log line would be the worse trade.
 */
async function recordAnnouncementAudit(input: {
  orgId: string;
  actorId: string;
  action: string;
  announcementIds: string[];
  detail: Record<string, unknown>;
}) {
  try {
    if (!input.announcementIds.length) return;
    await supabaseAdmin.from("contracting_audit_log").insert(
      input.announcementIds.map((id) => ({
        organization_id: input.orgId,
        actor_id: input.actorId,
        action: input.action,
        record_type: "announcement",
        record_id: id,
        new_value: input.detail,
        metadata: {},
      })),
    );
  } catch (err: any) {
    console.error("[announcements] audit write failed:", err?.message);
  }
}

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
