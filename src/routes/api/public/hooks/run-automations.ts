import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled automation sweep.
 *
 * Called by pg_cron. Lives under /api/public/* because that prefix bypasses
 * site auth for external callers, so the handler does its own check: the
 * caller must present the project's anon key in the `apikey` header. There is
 * no user session here, which is why the work itself iterates organizations
 * explicitly rather than relying on RLS.
 */
export const Route = createFileRoute("/api/public/hooks/run-automations")({
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

        let body: any = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }

        const { runAllJobs } = await import("@/lib/automation/jobs.server");
        const result = await runAllJobs({
          jobKey: typeof body?.jobKey === "string" ? body.jobKey : undefined,
          orgId: typeof body?.orgId === "string" ? body.orgId : undefined,
          trigger: "cron",
        });

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
