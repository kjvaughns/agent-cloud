import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type PublicAgentPage = {
  name: string;
  slug: string;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  specialties: string[];
  carriers: string[];
  licensed_states: string[];
};

export const getPublicAgentPage = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }): Promise<PublicAgentPage | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id,first_name,last_name,email,phone,agent_slug,avatar_url")
      .eq("agent_slug", data.slug)
      .maybeSingle();
    if (!profile) return null;

    const { data: page } = await supabaseAdmin
      .from("agent_landing_pages")
      .select(
        "published,contact_email,contact_phone,custom_message,specialties,carriers,licensed_states",
      )
      .eq("agent_id", profile.id)
      .maybeSingle();
    if (!page?.published) return null;

    return {
      name: `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim(),
      slug: profile.agent_slug ?? data.slug,
      avatar_url: profile.avatar_url ?? null,
      email: page.contact_email || profile.email || null,
      phone: page.contact_phone || profile.phone || null,
      message: page.custom_message ?? null,
      specialties: (page.specialties as string[] | null) ?? [],
      carriers: (page.carriers as string[] | null) ?? [],
      licensed_states: (page.licensed_states as string[] | null) ?? [],
    };
  });
