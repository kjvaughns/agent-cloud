import { createFileRoute } from "@tanstack/react-router";

/**
 * Nightly reset of the demo agency.
 *
 * Called by pg_cron at 03:00 Central (see 20260805140000_demo-org.sql). Lives
 * under /api/public/* because that prefix bypasses site auth for external
 * callers, so the handler does its own check — the same shape as
 * run-automations.
 *
 * ── What it does and does not delete ────────────────────────────────────────
 *
 * It clears rows flagged `is_sample` inside the demo org and re-seeds. It does
 * NOT delete the organization, its memberships, its three accounts or its
 * carrier configuration: those are the demo, and rebuilding them nightly would
 * mean minting auth users on a timer, which is a much larger blast radius than
 * this job needs. What resets is what a visitor can type into.
 *
 * ── Why a reset that fails is worse than one that never ran ─────────────────
 *
 * A demo that quietly stops resetting fills up with strangers' typing, and the
 * first person to notice is a prospect. Every run writes a `demo_reset_log`
 * row before it starts and updates it after, so a row still saying 'running'
 * an hour later is the signal that something died mid-flight.
 */
export const Route = createFileRoute("/api/public/hooks/demo-reset")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = (body: unknown, status: number) =>
          new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" },
          });

        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";

        if (!expected || provided !== expected) {
          return json({ error: "Unauthorized" }, 401);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { forgetDemoOrg } = await import("@/lib/demo.server");
        const db = supabaseAdmin as any;

        const { data: org } = await db
          .from("organizations")
          .select("id, name")
          .eq("is_demo", true)
          .maybeSingle();

        if (!org) {
          // Not an error. A deployment without a demo org is the normal state
          // of a self-hosted install, and a nightly 500 would be noise.
          return json({ skipped: "no demo org on this deployment" }, 200);
        }

        const { data: run } = await db
          .from("demo_reset_log")
          .insert({ organization_id: org.id, status: "running" })
          .select("id")
          .single();

        try {
          const { resetDemoOrg } = await import("@/lib/demo-reset.server");
          const result = await resetDemoOrg(org.id);
          forgetDemoOrg();

          if (run?.id) {
            await db
              .from("demo_reset_log")
              .update({
                status: "ok",
                finished_at: new Date().toISOString(),
                rows_cleared: result.cleared,
                detail: result.detail,
              })
              .eq("id", run.id);
          }
          return json({ ok: true, ...result }, 200);
        } catch (e: any) {
          const message = String(e?.message ?? e).slice(0, 1000);
          console.error("[demo-reset] failed", message);
          if (run?.id) {
            await db
              .from("demo_reset_log")
              .update({
                status: "failed",
                finished_at: new Date().toISOString(),
                detail: message,
              })
              .eq("id", run.id);
          }
          // 500 on purpose: whatever is watching the cron job should see this
          // as a failure, not a quiet 200 with an error buried in the body.
          return json({ error: message }, 500);
        }
      },
    },
  },
});
