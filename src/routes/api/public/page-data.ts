import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const AgentSchema = z.object({ type: z.literal("agent"), slug: z.string().min(1).max(80) });
const TemplateSchema = z.object({
  type: z.literal("template"),
  agentSlug: z.string().min(1).max(80),
  templateSlug: z.string().min(1).max(80),
});
const FunnelSchema = z.object({ type: z.literal("funnel"), slug: z.string().min(1).max(80) });
const QuerySchema = z.union([AgentSchema, TemplateSchema, FunnelSchema]);

export const Route = createFileRoute("/api/public/page-data")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
        if (!parsed.success) return Response.json({ data: null }, { status: 400, headers: cors });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (parsed.data.type === "agent") {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id,first_name,last_name,email,phone,agent_slug,avatar_url")
            .eq("agent_slug", parsed.data.slug)
            .maybeSingle();

          if (!profile) return Response.json({ data: null }, { headers: cors });

          const { data: page } = await supabaseAdmin
            .from("agent_landing_pages")
            .select("published,contact_email,contact_phone,custom_message,specialties,carriers,licensed_states")
            .eq("agent_id", profile.id)
            .maybeSingle();

          if (!page?.published) return Response.json({ data: null }, { headers: cors });

          return Response.json(
            {
              data: {
                name: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim(),
                slug: profile.agent_slug,
                avatar_url: profile.avatar_url,
                email: page.contact_email || profile.email,
                phone: page.contact_phone || profile.phone,
                message: page.custom_message,
                specialties: page.specialties ?? [],
                carriers: page.carriers ?? [],
                licensed_states: page.licensed_states ?? [],
              },
            },
            { headers: cors },
          );
        }

        if (parsed.data.type === "template") {
          const { data: agent } = await supabaseAdmin
            .from("profiles")
            .select("id,first_name,last_name,email,phone,avatar_url")
            .eq("agent_slug", parsed.data.agentSlug)
            .maybeSingle();

          if (!agent) return Response.json({ data: null }, { headers: cors });

          const { data: page } = await supabaseAdmin
            .from("landing_pages")
            .select("id,template_slug,published,title")
            .eq("agent_id", agent.id)
            .eq("template_slug", parsed.data.templateSlug)
            .maybeSingle();

          if (!page?.published) return Response.json({ data: null }, { headers: cors });
          return Response.json({ data: { agent, page } }, { headers: cors });
        }

        const { data: funnel } = await supabaseAdmin
          .from("recruiting_funnels")
          .select("id,agent_id,name,slug,published")
          .eq("slug", parsed.data.slug)
          .maybeSingle();

        if (!funnel?.published) return Response.json({ data: null }, { headers: cors });

        const { data: agent } = await supabaseAdmin
          .from("profiles")
          .select("first_name,last_name,avatar_url,email,phone")
          .eq("id", funnel.agent_id)
          .maybeSingle();

        return Response.json({ data: { funnel, agent } }, { headers: cors });
      },
    },
  },
});