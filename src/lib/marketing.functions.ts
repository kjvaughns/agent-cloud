import { createServerFn } from "@tanstack/start-client-core";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LANDING_TEMPLATES } from "./landing-templates";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function ensureAgentSlug(
  supabase: any,
  userId: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("agent_slug,first_name,last_name")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.agent_slug) return profile.agent_slug;
  const base = slugify(`${profile?.first_name ?? ""}-${profile?.last_name ?? ""}`) || `agent-${userId.slice(0, 8)}`;
  let candidate = base;
  let n = 1;
  while (true) {
    const { data: clash } = await supabase
      .from("profiles")
      .select("id")
      .eq("agent_slug", candidate)
      .maybeSingle();
    if (!clash) break;
    n++;
    candidate = `${base}-${n}`;
  }
  await supabase.from("profiles").update({ agent_slug: candidate }).eq("id", userId);
  return candidate;
}

export const listLandingPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const slug = await ensureAgentSlug(supabase, userId);
    const { data, error } = await supabase
      .from("landing_pages")
      .select("id,template_slug,custom_slug,title,published,lead_count,created_at")
      .eq("agent_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { pages: data ?? [], agentSlug: slug };
  });

export const quickDeployLandingPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ template_slug: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const tpl = LANDING_TEMPLATES.find((t) => t.slug === data.template_slug);
    if (!tpl) throw new Error("Unknown template");
    const { supabase, userId } = context;
    const agentSlug = await ensureAgentSlug(supabase, userId);

    // If a page for this template already exists, return it
    const { data: existing } = await supabase
      .from("landing_pages")
      .select("*")
      .eq("agent_id", userId)
      .eq("template_slug", data.template_slug)
      .maybeSingle();
    if (existing) return { page: existing, agentSlug };

    const { data: row, error } = await supabase
      .from("landing_pages")
      .insert({
        agent_id: userId,
        template_slug: data.template_slug,
        title: tpl.name,
        published: true,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { page: row, agentSlug };
  });

export const deleteLandingPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("landing_pages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
