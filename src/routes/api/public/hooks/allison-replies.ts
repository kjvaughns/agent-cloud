import { createFileRoute } from "@tanstack/react-router";

/** pg_cron, every minute: sends Allison's replies that are due. Idempotent via reply_after + job lock. */
export const Route = createFileRoute("/api/public/hooks/allison-replies")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        const provided = request.headers.get("apikey") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
        if (!expected || provided !== expected) return new Response("Unauthorized", { status: 401 });
        const { processDueThreads } = await import("@/lib/allison/allison.server");
        const result = await processDueThreads();
        const { sendOnboardingResumes } = await import("@/lib/onboarding/resume.server");
        const onboardingResumes = await sendOnboardingResumes().catch(() => 0);
        return Response.json({ ...(result as any), onboardingResumes });
      },
    },
  },
});
