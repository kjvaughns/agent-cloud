/**
 * GET /api/v1/leaderboard — the agency's board, ranked, for somebody else's site.
 *
 *   curl -H "Authorization: Bearer ac_live_..." \
 *     "https://useagentcloud.com/api/v1/leaderboard?start=2026-01-01&end=2026-12-31&limit=25"
 *
 * Same numbers as `/api/v1/production` and the dashboard, because it is the
 * same `tallyByAgent` over the same rows. This endpoint only adds the ordering
 * and the rank, so an upline embedding a board never has to compute it.
 *
 * Needs `producers:read`: a board is a list of names. A key holding only
 * `production:read` gets 403 here and should use `/api/v1/production`.
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

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Day-granular at both ends, matching `/api/v1/production`. */
function dayStart(day: string): string {
  return new Date(`${day}T00:00:00Z`).toISOString();
}
function dayEnd(day: string): string {
  return productionWindowEnd(new Date(`${day}T12:00:00Z`)).toISOString();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const Route = createFileRoute("/api/v1/leaderboard")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        const limited = await guardPublicEndpoint(request, "api-leaderboard", {
          perIp: 120, perIpWindow: 3600, global: 5000, globalWindow: 3600, headers: CORS,
        });
        if (limited) return limited;

        const auth = await authenticateApiRequest(request, "/api/v1/leaderboard", "producers:read");
        if (!auth.ok) return auth.response;
        const { orgId } = auth.auth;

        const url = new URL(request.url);
        const startParam = url.searchParams.get("start");
        const endParam = url.searchParams.get("end");
        const limitParam = url.searchParams.get("limit");
        if ((startParam && !DAY.test(startParam)) || (endParam && !DAY.test(endParam))) {
          return apiError("bad_request", "start and end must be YYYY-MM-DD.");
        }
        const limit = limitParam ? Number(limitParam) : 50;
        if (!Number.isFinite(limit) || limit < 1 || limit > 500) {
          return apiError("bad_request", "limit must be between 1 and 500.");
        }

        // Default window: the year to date, which is what a board on a website
        // is almost always showing.
        const now = new Date();
        const start = startParam
          ? dayStart(startParam)
          : new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
        const end = endParam ? dayEnd(endParam) : productionWindowEnd(now).toISOString();
        if (start > end) return apiError("bad_request", "start is after end.");

        const agentIds = await orgMemberIds(orgId);
        if (!agentIds.length) {
          return apiJson({
            organization_id: orgId,
            period: { start, end },
            totals: { premium: 0, policies: 0, placed: 0, producers: 0 },
            leaderboard: [],
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
          // A broken read must not be published as a board of zeroes.
          console.error("[api] leaderboard read failed", e?.message);
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

        const ids = [...tally.keys()];
        const { data: people } = await supabaseAdmin
          .from("profiles").select("id, first_name, last_name").in("id", ids);
        const names = new Map<string, string>(
          ((people ?? []) as any[]).map((p) => [
            p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
          ]),
        );

        const leaderboard = ids
          .map((id) => ({
            agent_id: id,
            name: names.get(id) || "Agent",
            premium: round2(tally.get(id)!.premium),
            policies: tally.get(id)!.policies,
            placed: round2(tally.get(id)!.placed),
          }))
          .sort((a, b) => b.premium - a.premium)
          .slice(0, limit)
          .map((row, i) => ({ rank: i + 1, ...row }));

        return apiJson({
          organization_id: orgId,
          period: { start, end },
          totals: {
            premium: round2(totalPremium),
            policies: totalPolicies,
            placed: round2(totalPlaced),
            producers: tally.size,
          },
          leaderboard,
        });
      },
    },
  },
});
