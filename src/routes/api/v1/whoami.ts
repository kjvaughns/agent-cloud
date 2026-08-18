/**
 * GET /api/v1/whoami — does this key work, and what can it read?
 *
 *   curl -H "Authorization: Bearer ac_live_..." https://useagentcloud.com/api/v1/whoami
 *
 * The endpoint somebody wiring this up hits first. Without it, a misconfigured
 * integration's only signal is an empty production response, and "is the key
 * wrong or did nobody sell anything this month" is not a question a totals
 * endpoint can answer.
 *
 * Needs only `production:read`, which every key has — its job is to confirm
 * the credential, not to gate anything.
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { guardPublicEndpoint } from "@/lib/rate-limit";
import { authenticateApiRequest, apiJson } from "@/lib/api/authenticate.server";

const supabaseAdmin = _admin as any;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export const Route = createFileRoute("/api/v1/whoami")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        const limited = await guardPublicEndpoint(request, "api-whoami", {
          perIp: 60, perIpWindow: 3600, global: 2000, globalWindow: 3600, headers: CORS,
        });
        if (limited) return limited;

        const auth = await authenticateApiRequest(request, "/api/v1/whoami", "production:read");
        if (!auth.ok) return auth.response;

        const { data: org } = await supabaseAdmin
          .from("organizations").select("name").eq("id", auth.auth.orgId).maybeSingle();

        return apiJson({
          organization_id: auth.auth.orgId,
          organization: org?.name ?? null,
          scopes: auth.auth.key.scopes ?? [],
          endpoints: ["/api/v1/whoami", "/api/v1/production"],
        });
      },
    },
  },
});
