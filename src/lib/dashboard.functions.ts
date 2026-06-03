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
