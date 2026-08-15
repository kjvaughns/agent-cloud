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
 * callers, so the handler does its own check.
 *
 * ── The token has to be a secret ──
 *
 * That check used to accept `SUPABASE_PUBLISHABLE_KEY`. The publishable key is
 * read in `integrations/supabase/client.ts` as
 * `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY`, which Vite inlines into the
 * browser bundle — so it is printed in the source of every page and is not a
 * secret in any sense. Anybody who opened the app could read it and call this
 * endpoint.
 *
 * The exposure was bounded: the handler takes no body, sends only
 * announcements that were already scheduled and already due, and the delivery
 * ledger stops a repeat. So nothing could be sent that was not going to be
 * sent anyway. What it did allow was unauthenticated work — each call scans
 * every scheduled announcement across every agency — which is a load and cost
 * vector against a public URL.
 *
 * `ANNOUNCEMENT_DISPATCH_TOKEN` has no `VITE_` prefix, so it never reaches the
 * client. The publishable key is deliberately NOT accepted as a fallback: a
 * fallback to a public value is the same hole with a longer name.
 *
 * The work itself is `dispatchAllDueAnnouncements`, which reuses the delivery
 * fan-out the owner-triggered path already uses. Nothing here decides who gets
 * what, and nothing here tracks what has been sent.
 */
export const Route = createFileRoute("/api/public/hooks/dispatch-announcements")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.ANNOUNCEMENT_DISPATCH_TOKEN ?? "";
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";

        // An unset token refuses everything rather than accepting anything.
        // The alternative — treating "no token configured" as "no check" —
        // turns a deploy that forgot an environment variable into an open
        // endpoint, and does it silently.
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
