import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled announcement dispatch.
 *
 * Called by the pg_cron job 'dispatch-due-announcements' every five minutes,
 * following the shape documented in 20260611022622_email_infra.sql:285 — a job
 * created through the Supabase Management API, reading its token from vault and
 * calling out via net.http_post.
 *
 * Lives under /api/public/* because that prefix bypasses site auth for external
 * callers, so the handler does its own check: the caller must present the
 * project's key in the `apikey` header, the same rule as the automations hook.
 *
 * The work itself is `dispatchAllDueAnnouncements`, which reuses the delivery
 * fan-out the owner-triggered path already uses. Nothing here decides who gets
 * what, and nothing here tracks what has been sent.
 */
export const Route = createFileRoute("/api/public/hooks/dispatch-announcements")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";

        if (!expected || provided !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { dispatchAllDueAnnouncements } = await import("@/lib/announcements.functions");
        const result = await dispatchAllDueAnnouncements();

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
