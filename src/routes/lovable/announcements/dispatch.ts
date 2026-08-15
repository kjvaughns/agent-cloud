/**
 * Send the channels for scheduled announcements whose time has come.
 *
 * A scheduled announcement becomes readable in the app the instant its time
 * passes, with nothing running: visibility is derived from `status`,
 * `publish_at` and `expires_at` by the RLS policy in 20260815010000. Email and
 * Discord are the part that genuinely needs something to reach out, and until
 * now that only happened when an agency owner opened the announcements page.
 * A post scheduled for 9am on a Monday reached Discord whenever somebody
 * happened to visit, which for a small agency could be Tuesday.
 *
 * ── Why a route and not an Edge Function ──
 *
 * The delivery logic already exists, once, in
 * `src/lib/announcements/deliver.server.ts`, and it is what the interactive
 * path uses. Reimplementing it in an Edge Function would give the product two
 * answers to "who gets told", and `announcement_deliveries` — whose whole job
 * is to be able to say what went out — would be recording two different
 * things. So the schedule calls the application, and the application keeps its
 * single implementation.
 *
 * ── Why this cannot be the existing server function ──
 *
 * `dispatchDueAnnouncements` is guarded by `requireSupabaseAuth` and an
 * org-owner check, which is correct for a person clicking and impossible for a
 * cron job: there is no session. This authenticates with the service-role key
 * instead — exactly as `/lovable/email/queue/process` does, which is the
 * pattern pg_cron already calls in this product — and covers every agency
 * rather than one caller's.
 *
 * ── Safe to call as often as you like ──
 *
 * `announcement_deliveries` records every attempt per announcement, and
 * `sendTransactionalEmail` keeps an event-level idempotency key of
 * `announcement:<id>:<profileId>`. Running this every five minutes sends
 * nothing twice. Deliberately no "sent" flag on `announcements`: visibility
 * there is derived rather than stored on purpose, and a delivery flag would
 * reintroduce exactly the stored-state drift that design avoids.
 */

import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

import { deliver, normalizeChannels } from "@/lib/announcements/deliver.server";
import { dueForDispatch } from "@/lib/announcements/lifecycle";

/** One run's worth of work, so a backlog cannot become an unbounded request. */
const MAX_PER_RUN = 100;

export const Route = createFileRoute("/lovable/announcements/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
          console.error("[announcements/dispatch] missing environment variables");
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        // Same contract as /lovable/email/queue/process: the pg_cron job sends
        // the service role key as a Bearer token.
        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (authHeader.slice("Bearer ".length).trim() !== supabaseServiceKey) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        const db: any = createClient(supabaseUrl, supabaseServiceKey);

        // Every agency's scheduled posts, not one caller's. Ordered oldest
        // first so a backlog drains in the order it was meant to go out.
        const { data: scheduled, error } = await db
          .from("announcements")
          .select("*")
          .eq("status", "scheduled")
          .order("publish_at", { ascending: true })
          .limit(MAX_PER_RUN);

        // Before 20260815010000 applies there is no `status` column, so there
        // is nothing scheduled and nothing to do. Reporting that plainly beats
        // a 500 that would show up in the cron job's logs every five minutes.
        if (error) {
          return Response.json({ skipped: true, reason: "not_migrated", detail: error.message });
        }

        const rows = (scheduled ?? []) as any[];
        if (rows.length === 0) return Response.json({ dispatched: 0, considered: 0 });

        const { data: already } = await db
          .from("announcement_deliveries")
          .select("announcement_id")
          .in("announcement_id", rows.map((r) => r.id));
        const delivered = new Set<string>(
          (already ?? []).map((d: any) => String(d.announcement_id)),
        );

        // The same rule the interactive path uses: live now, and not already
        // sent. A post that expired before anybody sent it is not sent late.
        const due = dueForDispatch(rows, delivered);
        if (due.length === 0) return Response.json({ dispatched: 0, considered: rows.length });

        // Agency names, for the "from" line, in one lookup rather than one per
        // announcement.
        const orgIds = Array.from(new Set(due.map((r) => r.organization_id).filter(Boolean)));
        const { data: orgs } = await db
          .from("organizations").select("id, name").in("id", orgIds);
        const names = new Map<string, string>(
          (orgs ?? []).map((o: any) => [o.id, o.name ?? "Your agency"]),
        );

        let sent = 0;
        const failures: { id: string; error: string }[] = [];
        for (const row of due) {
          try {
            await deliver({
              db,
              announcementId: row.id,
              orgId: row.organization_id,
              title: row.title,
              bodyHtml: row.body_html ?? "",
              fromName: names.get(row.organization_id) ?? "Your agency",
              channels: normalizeChannels(["in_app"]),
            });
            sent += 1;
          } catch (e: any) {
            // One agency's webhook timing out must not stop the rest of the
            // run. The ledger records the failure; the next run retries it,
            // because a failed attempt is not a delivered one.
            failures.push({ id: row.id, error: e?.message ?? "unknown" });
          }
        }

        return Response.json({
          dispatched: sent,
          considered: rows.length,
          failed: failures.length,
          // Named rather than counted: a repeated failure on the same
          // announcement is the signal worth acting on, and a bare count
          // cannot show it.
          failures: failures.slice(0, 10),
        });
      },
    },
  },
});
