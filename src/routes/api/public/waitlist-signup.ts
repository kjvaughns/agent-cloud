import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Schema = z.object({
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(30).optional().nullable(),
  persona: z.enum(["solo", "agency_owner", "recruit", "other"]).optional(),
  source: z.string().trim().max(40).optional(),
  utm: z.record(z.string(), z.string()).optional(),
  hp: z.string().max(0).optional(), // honeypot
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/waitlist-signup")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const parsed = Schema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "invalid" }), {
            status: 400,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        const d = parsed.data;
        if (d.hp) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { error } = await supabaseAdmin
          .from("waitlist_signups")
          .upsert(
            {
              first_name: d.first_name,
              last_name: d.last_name,
              email: d.email.toLowerCase(),
              phone: d.phone || null,
              persona: d.persona || null,
              source: d.source || "landing",
              utm: d.utm || null,
            },
            { onConflict: "email" }
          );

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }

        const { data: countRow } = await supabaseAdmin.rpc("waitlist_count");

        return new Response(
          JSON.stringify({ ok: true, count: Number(countRow ?? 0) }),
          { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
        );
      },
    },
  },
});
