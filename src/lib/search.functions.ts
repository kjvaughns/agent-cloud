import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string };

/**
 * Global record search.
 *
 * Reads through the RLS-bound client only, so results are already limited to
 * what the caller may see — there is no org filter in this file because there
 * does not need to be one. Adding a service-role client here would silently
 * turn search into a cross-tenant read, which is exactly the shape of bug the
 * Phase 1 audit found elsewhere.
 */

export type SearchHit = {
  type: "client" | "policy" | "agent" | "prospect";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

/** Escape PostgREST's ILIKE wildcards so a user's % or _ is literal. */
function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export const globalSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      q: z.string().trim().min(2).max(80),
      limit: z.number().int().min(1).max(20).default(6),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const term = `%${escapeLike(data.q)}%`;
    const n = data.limit;

    const [clients, policies, agents, prospects] = await Promise.all([
      supabase
        .from("clients")
        .select("id, first_name, last_name, email, phone")
        .or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`)
        .limit(n),

      supabase
        .from("policies")
        .select("id, policy_number, product, annual_premium, client_id")
        .ilike("policy_number", term)
        .limit(n),

      supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`)
        .limit(n),

      supabase
        .from("recruiting_prospects")
        .select("id, first_name, last_name, email, stage")
        .or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`)
        .limit(n),
    ]);

    const hits: SearchHit[] = [];
    const name = (a?: string | null, b?: string | null) => `${a ?? ""} ${b ?? ""}`.trim() || "—";

    for (const c of clients.data ?? []) {
      hits.push({
        type: "client",
        id: c.id,
        title: name(c.first_name, c.last_name),
        subtitle: c.email || c.phone || null,
        href: `/pipeline?client=${c.id}`,
      });
    }
    for (const p of policies.data ?? []) {
      hits.push({
        type: "policy",
        id: p.id,
        title: p.policy_number || "(no policy number)",
        subtitle: p.product ?? null,
        href: `/book-of-business?policy=${p.id}`,
      });
    }
    // Both of these deep-link to the record itself. Sending somebody who
    // searched a name to an unfiltered list is a dead end dressed up as a
    // result — they searched precisely so they would not have to scan a list.
    for (const a of agents.data ?? []) {
      hits.push({
        type: "agent",
        id: a.id,
        title: name(a.first_name, a.last_name),
        subtitle: a.email ?? null,
        href: `/team?agent=${a.id}`,
      });
    }
    for (const r of prospects.data ?? []) {
      hits.push({
        type: "prospect",
        id: r.id,
        title: name(r.first_name, r.last_name),
        subtitle: r.stage ?? r.email ?? null,
        // The page that actually lists prospects. This used to point at
        // /back-office/recruiting-tracker, which is now a redirect, so a
        // prospect result took two hops to arrive somewhere it was never
        // shown. There is no per-prospect detail view to deep-link to yet.
        href: `/back-office/marketing-tracker`,
      });
    }

    return { hits };
  });
