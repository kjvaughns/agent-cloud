import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const Schema = z.object({
  slug: z.string().trim().min(1).max(80),
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(120),
  phone: z.string().trim().min(7).max(30),
  state: z.string().trim().max(2).optional(),
  best_time: z.string().trim().max(60).optional(),
  topic: z.string().trim().max(120).optional(),
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/landing-lead")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const parsed = Schema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) return new Response("bad request", { status: 400, headers: cors });
        const d = parsed.data;
        const { data: agent } = await supabaseAdmin
          .from("profiles")
          .select("id,first_name,last_name")
          .eq("agent_slug", d.slug)
          .maybeSingle();
        if (!agent) return new Response("not found", { status: 404, headers: cors });

        const notes = [
          d.state ? `State: ${d.state}` : null,
          d.best_time ? `Best time: ${d.best_time}` : null,
          d.topic ? `Topic: ${d.topic}` : null,
        ].filter(Boolean).join(" • ") || null;

        const { error } = await supabaseAdmin.from("clients").insert({
          agent_id: agent.id,
          first_name: d.first_name,
          last_name: d.last_name,
          email: d.email,
          phone: d.phone,
          state: d.state || null,
          stage: "new",
          temperature: "warm",
          notes,
        });
        if (error) return new Response("error", { status: 500, headers: cors });

        await supabaseAdmin.from("notifications").insert({
          user_id: agent.id,
          title: "New Lead from Landing Page",
          description: `${d.first_name} ${d.last_name}${d.state ? ` from ${d.state}` : ""}`,
          type: "lead",
        });

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      },
    },
  },
});
