import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RangeSchema = z.object({
  rangeStart: z.string(),
  rangeEnd: z.string(),
});

export type DashboardMetrics = {
  my_prod: number;
  team_prod: number;
  my_policies: number;
  team_policies: number;
  status_grid: Record<string, number>;
  donut: { active: number; in_review: number; total: number };
  active_downline: number;
  active_contracts: number;
  trend: {
    month: string;
    my_prod: number;
    team_prod: number;
    my_policies: number;
    team_policies: number;
  }[];
};

export const getDashboardMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("get_dashboard_metrics", {
      _range_start: data.rangeStart,
      _range_end: data.rangeEnd,
    });
    if (error) throw new Error(error.message);
    return row as unknown as DashboardMetrics;
  });

export type AgencyFeedAgent = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  missing: string[];
};

export type AgencyFeedPolicy = {
  id: string;
  annual_premium: number;
  status: string;
  posted_at: string;
  product: string | null;
  agent_id: string;
  carriers: { name: string } | null;
  profiles: { first_name: string | null; last_name: string | null } | null;
};

export type AgencyFeed = {
  activationQueue: AgencyFeedAgent[];
  recentPolicies: AgencyFeedPolicy[];
  newAgents: { id: string; first_name: string | null; last_name: string | null; created_at: string }[];
  stuckContracts: number;
};

export const getAgencyFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;

    const { data: agents } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, created_at, date_of_birth, street_address, npn_number, ssn_encrypted")
      .eq("upline_id", userId);

    const agentIds = (agents ?? []).map((r: any) => r.id);

    const [policiesRes, stuckRes] = await Promise.all([
      agentIds.length > 0
        ? supabase
            .from("policies")
            .select("id, annual_premium, status, posted_at, product, agent_id, carriers(name), profiles(first_name, last_name)")
            .in("agent_id", agentIds)
            .order("posted_at", { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] }),
      agentIds.length > 0
        ? supabase
            .from("contract_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "issue")
            .in("agent_id", agentIds)
        : Promise.resolve({ count: 0 }),
    ]);

    const cutoff7d = new Date(Date.now() - 7 * 86400000).toISOString();

    const activationQueue = (agents ?? [])
      .map((p: any) => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        missing: ([
          !p.date_of_birth && "Date of Birth",
          !p.street_address && "Address",
          !p.npn_number && "NPN",
          !p.ssn_encrypted && "SSN",
        ] as (string | false)[]).filter(Boolean) as string[],
      }))
      .filter((a: any) => a.missing.length > 0)
      .slice(0, 5);

    return {
      activationQueue,
      recentPolicies: policiesRes.data ?? [],
      newAgents: (agents ?? []).filter((a: any) => a.created_at > cutoff7d).slice(0, 5),
      stuckContracts: stuckRes.count ?? 0,
    } as AgencyFeed;
  });

export type LeaderboardAgent = {
  id: string;
  name: string;
  premium: number;
  policies: number;
};

export const getLeaderboardData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: agents } = await supabase
      .from("policies")
      .select("agent_id, annual_premium, profiles!inner(first_name, last_name)")
      .gte("posted_at", data.rangeStart)
      .lte("posted_at", data.rangeEnd);
    const agentMap = new Map<string, { name: string; premium: number; policies: number }>();
    for (const row of agents ?? []) {
      const id = row.agent_id;
      if (!agentMap.has(id)) agentMap.set(id, {
        name: `${row.profiles?.first_name ?? ""} ${row.profiles?.last_name ?? ""}`.trim(),
        premium: 0,
        policies: 0,
      });
      const entry = agentMap.get(id)!;
      entry.premium += Number(row.annual_premium ?? 0);
      entry.policies += 1;
    }
    const sorted = Array.from(agentMap.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.premium - a.premium);
    return { agents: sorted as LeaderboardAgent[], selfId: userId as string };
  });
