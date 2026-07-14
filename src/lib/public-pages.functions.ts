import { createServerFn } from "@tanstack/start-client-core";
import { z } from "zod";

const PublicLandingSchema = z.object({ slug: z.string().min(1).max(80) });

const TemplateLandingSchema = z.object({
  agentSlug: z.string().min(1).max(80),
  templateSlug: z.string().min(1).max(80),
});

export const getPublicAgentLanding = createServerFn({ method: "GET" })
  .inputValidator((input) => PublicLandingSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id,first_name,last_name,email,phone,agent_slug,avatar_url")
      .eq("agent_slug", data.slug)
      .maybeSingle();

    if (!profile) return null;

    const { data: page } = await supabaseAdmin
      .from("agent_landing_pages")
      .select("published,contact_email,contact_phone,custom_message,specialties,carriers,licensed_states")
      .eq("agent_id", profile.id)
      .maybeSingle();

    if (!page?.published) return null;

    return {
      name: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim(),
      slug: profile.agent_slug,
      avatar_url: profile.avatar_url,
      email: page.contact_email || profile.email,
      phone: page.contact_phone || profile.phone,
      message: page.custom_message,
      specialties: (page.specialties as string[]) ?? [],
      carriers: (page.carriers as string[]) ?? [],
      licensed_states: (page.licensed_states as string[]) ?? [],
    };
  });

export const getPublicTemplateLanding = createServerFn({ method: "GET" })
  .inputValidator((input) => TemplateLandingSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: agent } = await supabaseAdmin
      .from("profiles")
      .select("id,first_name,last_name,email,phone,avatar_url")
      .eq("agent_slug", data.agentSlug)
      .maybeSingle();

    if (!agent) return null;

    const { data: page } = await supabaseAdmin
      .from("landing_pages")
      .select("id,template_slug,published,title")
      .eq("agent_id", agent.id)
      .eq("template_slug", data.templateSlug)
      .maybeSingle();

    if (!page || !page.published) return null;

    return { agent, page };
  });

export const getPublicRecruitingFunnel = createServerFn({ method: "GET" })
  .inputValidator((input) => PublicLandingSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: funnel } = await supabaseAdmin
      .from("recruiting_funnels")
      .select("id,agent_id,name,slug,published")
      .eq("slug", data.slug)
      .maybeSingle();

    if (!funnel || !funnel.published) return null;

    const { data: agent } = await supabaseAdmin
      .from("profiles")
      .select("first_name,last_name,avatar_url,email,phone")
      .eq("id", funnel.agent_id)
      .maybeSingle();

    return { funnel, agent };
  });