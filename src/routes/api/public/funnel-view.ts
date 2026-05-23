import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const Schema = z.object({ slug: z.string().trim().min(1).max(80) });

export const Route = createFileRoute("/api/public/funnel-view")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
      POST: async ({ request }) => {
        try {
          const parsed = Schema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) return new Response("bad request", { status: 400 });
          await supabaseAdmin.rpc("increment_funnel_views", { _slug: parsed.data.slug });
          return Response.json({ ok: true }, { headers: { "Access-Control-Allow-Origin": "*" } });
        } catch {
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
