import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const Schema = z.object({
  slug: z.string().trim().min(1).max(80),
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(120),
  phone: z.string().trim().min(7).max(30),
  state: z.string().trim().min(2).max(60).optional(),
  npn_number: z.string().trim().max(40).optional(),
  message: z.string().trim().max(2000).optional(),
});

export const Route = createFileRoute("/api/public/funnel-apply")({
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
        const parsed = Schema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) return new Response("bad request", { status: 400 });
        const d = parsed.data;
        const { data: funnel } = await supabaseAdmin
          .from("recruiting_funnels")
          .select("id,agent_id,name")
          .eq("slug", d.slug)
          .maybeSingle();
        if (!funnel) return new Response("not found", { status: 404 });

        const noteParts = [
          d.state ? `State: ${d.state}` : null,
          d.npn_number ? `NPN: ${d.npn_number}` : null,
          d.message ? `Message: ${d.message}` : null,
        ].filter(Boolean);

        const { error: insertErr } = await supabaseAdmin.from("recruiting_prospects").insert({
          recruiter_id: funnel.agent_id,
          funnel_id: funnel.id,
          first_name: d.first_name,
          last_name: d.last_name,
          email: d.email,
          phone: d.phone,
          source: "Recruiting Funnel",
          notes: noteParts.join(" • ") || null,
          stage: "new",
        });
        if (insertErr) return new Response("error", { status: 500 });

        await supabaseAdmin.rpc("increment_funnel_applications", { _slug: d.slug });

        await supabaseAdmin.from("notifications").insert({
          user_id: funnel.agent_id,
          title: "New Application",
          description: `${d.first_name} ${d.last_name} submitted via your recruiting funnel "${funnel.name}".`,
          type: "recruiting",
        });

        return Response.json({ ok: true }, { headers: { "Access-Control-Allow-Origin": "*" } });
      },
    },
  },
});
