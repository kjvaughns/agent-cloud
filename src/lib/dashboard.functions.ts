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
