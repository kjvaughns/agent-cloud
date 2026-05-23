import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const Schema = z.object({
  agent_slug: z.string().trim().min(1).max(80),
  template_slug: z.string().trim().min(1).max(80),
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(7).max(30),
  email: z.string().trim().email().max(120),
  state: z.string().trim().max(60).optional(),
  best_time: z.string().trim().max(60).optional(),
});

export const Route = createFileRoute("/api/public/lead-submit")({
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
        const { data: agent } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("agent_slug", d.agent_slug)
          .maybeSingle();
        if (!agent) return new Response("not found", { status: 404 });
        const { data: page } = await supabaseAdmin
          .from("landing_pages")
          .select("id,title")
          .eq("agent_id", agent.id)
          .eq("template_slug", d.template_slug)
          .maybeSingle();
        if (!page) return new Response("not found", { status: 404 });

        const noteParts = [
          d.state ? `State: ${d.state}` : null,
          d.best_time ? `Best time: ${d.best_time}` : null,
          `Source: ${page.title ?? d.template_slug} landing page`,
        ].filter(Boolean);

        const { error: insertErr } = await supabaseAdmin.from("clients").insert({
          agent_id: agent.id,
          first_name: d.first_name,
          last_name: d.last_name,
          phone: d.phone,
          email: d.email,
          state: d.state ?? null,
          best_time_to_call: d.best_time ?? null,
          notes: noteParts.join(" • "),
          stage: "new",
        });
        if (insertErr) return new Response("error", { status: 500 });

        await supabaseAdmin.rpc("increment_landing_leads", { _id: page.id });

        await supabaseAdmin.from("notifications").insert({
          user_id: agent.id,
          title: "New Lead",
          description: `${d.first_name} ${d.last_name} submitted via your "${page.title}" landing page.`,
          type: "lead",
        });

        return Response.json({ ok: true }, { headers: { "Access-Control-Allow-Origin": "*" } });
      },
    },
  },
});
