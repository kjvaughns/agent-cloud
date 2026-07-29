import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { guardPublicEndpoint } from "@/lib/rate-limit";

/**
 * Resolve white-label branding for the requesting hostname.
 *
 * This is what makes organizations.custom_domain mean something: the sign-in
 * and signup pages run before any session exists, so the only way they can
 * show an agency's logo is to look it up by the host the browser asked for.
 *
 * Returns only presentational fields. No ids, no counts, nothing that would
 * let an unauthenticated caller enumerate the tenant list — an unknown domain
 * and a domain with no branding return the same empty shape.
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const EMPTY = { name: null, logo_url: null, accent_color: null, tagline: null };

function hostFrom(request: Request): string | null {
  const url = new URL(request.url);
  const q = url.searchParams.get("domain");
  const raw = q || request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!raw) return null;
  return raw.split(",")[0]!.trim().toLowerCase().replace(/:\d+$/, "");
}

export const Route = createFileRoute("/api/public/branding")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),

      GET: async ({ request }) => {
        const limited = await guardPublicEndpoint(request, "branding", { perIp: 120, global: 10000, headers: cors });
        if (limited) return limited;

        const host = hostFrom(request);
        const json = (body: unknown) =>
          new Response(JSON.stringify(body), {
            headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
          });

        if (!host) return json(EMPTY);

        const { data } = await (supabaseAdmin as any)
          .from("organizations")
          .select("name, logo_url, accent_color, tagline, plan_type")
          .eq("custom_domain", host)
          .eq("plan_type", "white_label")
          .maybeSingle();

        if (!data) return json(EMPTY);

        return json({
          name: data.name ?? null,
          logo_url: data.logo_url ?? null,
          accent_color: data.accent_color ?? null,
          tagline: data.tagline ?? null,
        });
      },
    },
  },
});
