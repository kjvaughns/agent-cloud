/**
 * GET /api/v1/carriers — the agency's live carrier directory, for somebody
 * else's site.
 *
 *   curl -H "Authorization: Bearer ac_live_..." \
 *     "https://useagentcloud.com/api/v1/carriers"
 *
 * The same list the Carriers directory page shows: only carriers that are
 * switched on and active for the agency, with the agency's own phone, hours,
 * contracting speed, pay frequency, products and links — falling back to the
 * shared carrier library where the agency has not set its own value.
 *
 * Needs `carriers:read`. Paused, not-contracted, archived and terminated
 * carriers are not listed, matching the in-app directory.
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { guardPublicEndpoint } from "@/lib/rate-limit";
import {
  authenticateApiRequest, apiJson, apiError,
} from "@/lib/api/authenticate.server";

const supabaseAdmin = _admin as any;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export const Route = createFileRoute("/api/v1/carriers")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        const limited = await guardPublicEndpoint(request, "api-carriers", {
          perIp: 120, perIpWindow: 3600, global: 5000, globalWindow: 3600, headers: CORS,
        });
        if (limited) return limited;

        const auth = await authenticateApiRequest(request, "/api/v1/carriers", "carriers:read");
        if (!auth.ok) return auth.response;
        const { orgId } = auth.auth;

        const { data: rows, error } = await supabaseAdmin
          .from("org_carriers")
          .select(
            "id, status, enabled, phone, business_hours, contracting_speed_days, pay_frequency, website, agent_portal_url, training_url, products, carrier:carriers(name, logo_url, website, phone, hours, pay_frequency, contracting_speed_days, agent_portal_url, training_url)",
          )
          .eq("organization_id", orgId)
          .eq("enabled", true)
          .eq("status", "active");

        if (error) {
          console.error("[api] carriers read failed", error.message);
          return apiError("server_error", "Could not read carriers.");
        }

        const carriers = ((rows ?? []) as any[])
          .map((r) => {
            const lib = r.carrier ?? {};
            const pick = (own: unknown, fallback: unknown) =>
              own !== null && own !== undefined && own !== "" ? own : (fallback ?? null);
            return {
              id: r.id as string,
              name: lib.name ?? "Carrier",
              logo_url: lib.logo_url ?? null,
              phone: pick(r.phone, lib.phone),
              business_hours: pick(r.business_hours, lib.hours),
              contracting_speed_days: pick(r.contracting_speed_days, lib.contracting_speed_days),
              pay_frequency: pick(r.pay_frequency, lib.pay_frequency),
              website: pick(r.website, lib.website),
              agent_portal_url: pick(r.agent_portal_url, lib.agent_portal_url),
              training_url: pick(r.training_url, lib.training_url),
              products: Array.isArray(r.products) ? r.products : [],
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        return apiJson({ organization_id: orgId, carriers });
      },
    },
  },
});
