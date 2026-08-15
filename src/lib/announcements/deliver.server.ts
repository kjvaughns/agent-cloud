/**
 * Sending one announcement to the channels an agency asked for.
 *
 * Lifted out of `announcements.functions.ts` so the scheduled dispatcher can
 * call exactly this code rather than a second copy of it. Two implementations
 * of "who gets told" would drift, and the two would then disagree about what
 * went out — which is the one thing `announcement_deliveries` exists to be able
 * to answer.
 *
 * Takes its database client as an argument rather than importing one, because
 * the cron route builds its own service-role client from the request.
 */

import { normalizeChannels, type Channel } from "./audience";

export { normalizeChannels };

/**
 * Fan one announcement out to the channels an agency asked for.
 *
 * Every attempt is logged to `announcement_deliveries`, including the ones
 * that were skipped — "nobody was emailed because everybody had that category
 * off" and "nobody was emailed because the send failed" are different answers,
 * and a ledger that only records successes cannot tell them apart.
 */
export async function deliver(opts: {
  /** Service-role client. Passed rather than imported so the cron route can supply its own. */
  db: any;
  announcementId: string;
  orgId: string;
  title: string;
  bodyHtml: string;
  fromName: string;
  channels: Channel[];
}) {
  const { db, announcementId, orgId, title, bodyHtml, fromName, channels } = opts;

  const log = async (channel: Channel, status: "sent" | "failed" | "skipped", target?: string, error?: string) => {
    await db.from("announcement_deliveries").insert({
      announcement_id: announcementId,
      organization_id: orgId,
      channel, status, target: target ?? null, error: error ?? null,
    });
  };

  const { data: members } = await db
    .from("profiles").select("id").eq("organization_id", orgId).neq("status", "terminated");
  const recipients = (members ?? []).map((m: any) => m.id);

  // ── In the app ───────────────────────────────────────────────────────────
  if (channels.includes("in_app")) {
    try {
      const allowed: string[] = [];
      for (const id of recipients) {
        const { data: ok } = await db.rpc("may_notify", { _profile: id, _category: "announcements" });
        // A missing function or a null answer must not silence the feed: the
        // preference defaults to on, so default to sending.
        if (ok !== false) allowed.push(id);
      }
      if (allowed.length > 0) {
        await db.from("notifications").insert(allowed.map((id) => ({
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
