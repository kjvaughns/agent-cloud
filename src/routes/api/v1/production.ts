/**
 * GET /api/v1/production — an agency's sales numbers, for somebody else's site.
 *
 *   curl -H "Authorization: Bearer ac_live_..." \
 *     "https://useagentcloud.com/api/v1/production?start=2026-08-01&end=2026-08-31"
 *
 * ── The numbers are the same numbers ──
 *
 * `tallyByAgent` and `inWindow` are the ones the dashboard, the roster and the
 * leaderboard use. That is the whole point: an upline's website showing a
 * different total from the agency's own dashboard would be worse than showing
 * nothing, and the only way to guarantee it does not is to compute it in one
 * place. Nothing about production is decided in this file.
 *
 * ── What is not here ──
 *
 * No client, no policy number, no face amount against a person. A key reads
 * totals, and with `producers:read` the per-agent breakdown. An upline putting
 * an agency's board on a public page must not be putting its clients there
 * with it.
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { guardPublicEndpoint } from "@/lib/rate-limit";
import {
  authenticateApiRequest, orgMemberIds, apiJson, apiError,
} from "@/lib/api/authenticate.server";
import { selectProduction } from "@/lib/production/source.server";
import { tallyByAgent, productionWindowEnd, type ProductionRow } from "@/lib/production/source";

const supabaseAdmin = _admin as any;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

/**
 * `YYYY-MM-DD` to the instant a production window starts or ends.
 *
 * A production date is a day stamped at midday UTC, so a window over it is
 * day-granular at both ends — the same rule `productionWindowEnd` states, and
 * the reason a deal written today is inside "this month" from midnight rather
 * than from midday.
 */
function dayStart(day: string): string {
  return new Date(`${day}T00:00:00Z`).toISOString();
}
function dayEnd(day: string): string {
  return productionWindowEnd(new Date(`${day}T12:00:00Z`)).toISOString();
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createFileRoute("/api/v1/production")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        // Bounded before the key is even looked at, so an unauthenticated
        // flood costs one Redis read rather than a database round trip.
        const limited = await guardPublicEndpoint(request, "api-production", {
          perIp: 120, perIpWindow: 3600, global: 5000, globalWindow: 3600, headers: CORS,
        });
        if (limited) return limited;

        const auth = await authenticateApiRequest(request, "/api/v1/production", "production:read");
        if (!auth.ok) return auth.response;
        const { orgId, key } = auth.auth;

        const url = new URL(request.url);
        const startParam = url.searchParams.get("start");
        const endParam = url.searchParams.get("end");
        if ((startParam && !DAY.test(startParam)) || (endParam && !DAY.test(endParam))) {
          return apiError("bad_request", "start and end must be YYYY-MM-DD.");
        }

        // Default: the current month to date, which is the figure somebody
        // putting this on a website almost always wants.
        const now = new Date();
        const start = startParam
          ? dayStart(startParam)
          : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
        const end = endParam ? dayEnd(endParam) : productionWindowEnd(now).toISOString();
        if (start > end) return apiError("bad_request", "start is after end.");

        const agentIds = await orgMemberIds(orgId);
        if (!agentIds.length) {
          return apiJson({
            organization_id: orgId,
            period: { start, end },
            totals: { premium: 0, policies: 0, placed: 0, producers: 0 },
            producers: [],
          });
        }

        let rows: ProductionRow[];
        try {
          rows = await selectProduction<ProductionRow>((col) =>
            supabaseAdmin
              .from("policies")
              .select("*")
              .in("agent_id", agentIds)
              .gte(col, start)
              .lte(col, end),
          );
        } catch (e: any) {
          // `selectProduction` throws rather than answering a broken read with
          // an empty array, precisely so a failure cannot be published as a
          // zero on somebody's website.
          console.error("[api] production read failed", e?.message);
          return apiError("server_error", "Could not read production.");
        }

        const tally = tallyByAgent(rows);

        let totalPremium = 0;
        let totalPolicies = 0;
        let totalPlaced = 0;
        for (const t of tally.values()) {
          totalPremium += t.premium;
          totalPolicies += t.policies;
          totalPlaced += t.placed;
        }

        const body: Record<string, unknown> = {
          organization_id: orgId,
          period: { start, end },
          totals: {
            premium: round2(totalPremium),
            policies: totalPolicies,
            placed: round2(totalPlaced),
            producers: tally.size,
          },
        };

        // The narrower key stops here: an owner can share what the agency
        // wrote without naming who wrote it.
        if ((key.scopes ?? []).includes("producers:read")) {
          const ids = [...tally.keys()];
          const { data: people } = await supabaseAdmin
            .from("profiles").select("id, first_name, last_name").in("id", ids);
          const names = new Map<string, string>(
            ((people ?? []) as any[]).map((p) => [
              p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
            ]),
          );
          body.producers = ids
            .map((id) => ({
              agent_id: id,
              name: names.get(id) || "Agent",
              premium: round2(tally.get(id)!.premium),
              policies: tally.get(id)!.policies,
              placed: round2(tally.get(id)!.placed),
            }))
            .sort((a, b) => b.premium - a.premium);
        }

        return apiJson(body);
      },
    },
  },
});

/** Money, to the cent. Floating point sums otherwise publish 12345.670000000001. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
