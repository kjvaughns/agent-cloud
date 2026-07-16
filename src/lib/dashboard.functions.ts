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
  completion_pct: number;
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
      .select("id, first_name, last_name, created_at")
      .eq("upline_id", userId);

    const agentIds = (agents ?? []).map((r: any) => r.id);

    // Real onboarding completion from get_team_downline (agent_completion SQL fn):
    // pct + missing items across profile fields AND documents (E&O, banking, DL, AML).
    const { data: downlineRows } = await supabase.rpc("get_team_downline");
    const completionById = new Map<string, { pct: number; missing: string[] }>(
      ((downlineRows ?? []) as any[]).map((r) => [
        r.id,
        { pct: Number(r.completion_pct ?? 0), missing: (r.missing as string[]) ?? [] },
      ]),
    );

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
      .map((p: any) => {
        const c = completionById.get(p.id) ?? { pct: 0, missing: [] };
        return {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          missing: c.missing,
          completion_pct: c.pct,
        };
      })
      .filter((a: any) => a.completion_pct < 100)
      .sort((a: any, b: any) => a.completion_pct - b.completion_pct)
      .slice(0, 5);

    return {
      activationQueue,
      recentPolicies: policiesRes.data ?? [],
      newAgents: (agents ?? []).filter((a: any) => a.created_at > cutoff7d).slice(0, 5),
      stuckContracts: stuckRes.count ?? 0,
    } as AgencyFeed;
  });

// ── Dashboard hero (reference-match): today/week/MTD ALP + daily trend ──────
export type DashboardHero = {
  todayAlp: number;
  todayDelta: number;          // $ vs yesterday
  weekAlp: number;
  weekDeltaPct: number | null; // % vs prior 7d (null = no prior data)
  activePolicies: number;
  activeToday: number;         // policies posted today
  teamAlp: number;             // MTD downline production (excludes self)
  teamDeltaPct: number | null; // % vs prior month same-day (null = no prior data)
  mtdAlp: number;
  mtdDeltaPct: number | null;  // % vs prior month, same day-of-month (null = no prior data)
  mtdGoal: number;
  goalIsDefault: boolean;      // true until the agent sets their own goal
  mtdPct: number;
  daysLeft: number;
  trend: number[];             // daily cumulative MTD ALP (in dollars)
};

const DEFAULT_MTD_GOAL = 25000;

export const getDashboardHero = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekAgo = new Date(startOfToday.getTime() - 7 * 86400000);
    const twoWeeksAgo = new Date(startOfToday.getTime() - 14 * 86400000);
    const yesterday = new Date(startOfToday.getTime() - 86400000);
    const priorMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    // Same day-of-month in the prior month (clamped by Date's own rollover),
    // so MTD vs prior month compares like-for-like partial months.
    const priorMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(),
      now.getHours(), now.getMinutes());
    const fetchSince = new Date(Math.min(priorMonthStart.getTime(), twoWeeksAgo.getTime()));

    const { data: pols } = await supabase
      .from("policies")
      .select("annual_premium, posted_at, status")
      .eq("agent_id", userId)
      .gte("posted_at", fetchSince.toISOString());
    const rows: { annual_premium: number; posted_at: string; status: string }[] = (pols ?? []).map((p: any) => ({
      annual_premium: Number(p.annual_premium ?? 0),
      posted_at: p.posted_at,
      status: p.status,
    }));

    const sumWhere = (from: Date, to?: Date) =>
      rows.reduce((acc, r) => {
        const t = new Date(r.posted_at).getTime();
        if (t >= from.getTime() && (!to || t < to.getTime())) return acc + r.annual_premium;
        return acc;
      }, 0);

    const todayAlp = sumWhere(startOfToday);
    const yesterdayAlp = sumWhere(yesterday, startOfToday);
    const weekAlp = sumWhere(weekAgo);
    const priorWeekAlp = sumWhere(twoWeeksAgo, weekAgo);
    const mtdAlp = sumWhere(startOfMonth);
    // Like-for-like MTD comparison: prior month through the same day-of-month.
    const priorMtdAlp = sumWhere(priorMonthStart, priorMonthSameDay);
    const activeToday = rows.filter((r) => new Date(r.posted_at) >= startOfToday).length;

    // Daily cumulative MTD trend
    const daysSoFar = now.getDate();
    const dailyTotals = new Array(daysSoFar).fill(0);
    for (const r of rows) {
      const d = new Date(r.posted_at);
      if (d >= startOfMonth) {
        const idx = d.getDate() - 1;
        if (idx >= 0 && idx < daysSoFar) dailyTotals[idx] += r.annual_premium;
      }
    }
    let running = 0;
    const trend = dailyTotals.map((v) => (running += v));
    if (trend.length < 2) trend.unshift(0);

    const { count: activeCount } = await supabase
      .from("policies")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", userId)
      .eq("status", "active");

    // Team ALP (MTD, downline-only via the fixed RPC) + prior month same-day,
    // plus the agent's own monthly goal from their profile.
    const [mtdRpc, priorRpc, profileRes] = await Promise.all([
      supabase.rpc("get_dashboard_metrics", { _range_start: startOfMonth.toISOString(), _range_end: now.toISOString() }),
      supabase.rpc("get_dashboard_metrics", { _range_start: priorMonthStart.toISOString(), _range_end: priorMonthSameDay.toISOString() }),
      supabase.from("profiles").select("monthly_alp_goal").eq("id", userId).maybeSingle(),
    ]);
    const teamAlp = Number((mtdRpc.data as any)?.team_prod ?? 0);
    const priorTeam = Number((priorRpc.data as any)?.team_prod ?? 0);

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const storedGoal = Number(profileRes.data?.monthly_alp_goal ?? 0);
    const goal = storedGoal > 0 ? storedGoal : DEFAULT_MTD_GOAL;

    return {
      todayAlp,
      todayDelta: todayAlp - yesterdayAlp,
      weekAlp,
      weekDeltaPct: priorWeekAlp > 0 ? ((weekAlp - priorWeekAlp) / priorWeekAlp) * 100 : null,
      activePolicies: activeCount ?? 0,
      activeToday,
      teamAlp,
      teamDeltaPct: priorTeam > 0 ? ((teamAlp - priorTeam) / priorTeam) * 100 : null,
      mtdAlp,
      mtdDeltaPct: priorMtdAlp > 0 ? ((mtdAlp - priorMtdAlp) / priorMtdAlp) * 100 : null,
      mtdGoal: goal,
      goalIsDefault: !(storedGoal > 0),
      mtdPct: goal > 0 ? Math.round((mtdAlp / goal) * 100) : 0,
      daysLeft: daysInMonth - now.getDate(),
      trend,
    } as DashboardHero;
  });

export const setMonthlyGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ goal: z.number().positive().max(100_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { error } = await supabase
      .from("profiles")
      .update({ monthly_alp_goal: data.goal })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Commission summary (reference-match Commission card) ────────────────────
export type CommissionSummary = {
  advance: number;
  trail: number;
  override: number;
  chargebacks: number;
  chargebackCount: number;
};

export const getCommissionSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { data } = await supabase
      .from("commission_schedule")
      .select("payment_type, amount, status, payment_date")
      .eq("agent_id", userId)
      .gte("payment_date", startOfMonth);
    const rows: { payment_type: string; amount: number }[] = (data ?? []).map((r: any) => ({
      payment_type: r.payment_type,
      amount: Number(r.amount ?? 0),
    }));
    const sumType = (types: string[]) =>
      rows.filter((r) => types.includes(r.payment_type) && r.amount >= 0).reduce((a, r) => a + r.amount, 0);
    const chargebackRows = rows.filter((r) => r.amount < 0);
    return {
      advance: sumType(["advance"]),
      // Renewal income folded in so it isn't invisible on the card.
      trail: sumType(["trail", "deferred", "renewal"]),
      override: sumType(["override"]),
      chargebacks: chargebackRows.reduce((a, r) => a + r.amount, 0),
      chargebackCount: chargebackRows.length,
    } as CommissionSummary;
  });

// ── At-risk policies (reference-match Needs-attention rail) ──────────────────
export type AtRiskPolicy = {
  id: string;
  policy_number: string | null;
  client: string;
  days: number;
  monthly_premium: number;
};

export const getAtRiskPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    const { data } = await supabase
      .from("policies")
      .select("id, policy_number, status, monthly_premium, updated_at, posted_at, clients(first_name, last_name)")
      .eq("agent_id", userId)
      .eq("status", "lapse_pending")
      .order("monthly_premium", { ascending: false })
      .limit(6);
    const now = Date.now();
    return {
      rows: (data ?? []).map((p: any) => {
        const since = p.updated_at || p.posted_at;
        const days = since ? Math.max(0, Math.floor((now - new Date(since).getTime()) / 86400000)) : 0;
        const c = p.clients;
        return {
          id: p.id,
          policy_number: p.policy_number,
          client: c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() : "Client",
          days,
          monthly_premium: Number(p.monthly_premium ?? 0),
        };
      }) as AtRiskPolicy[],
    };
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
    // Explicit hierarchy scope: self + recursive downline. Without this,
    // admin/manager RLS grants would leak every agency's producers.
    const { data: downline } = await supabase.rpc("get_team_downline");
    const teamIds: string[] = [userId, ...((downline ?? []) as { id: string }[]).map((a) => a.id)];
    const { data: agents } = await supabase
      .from("policies")
      .select("agent_id, annual_premium, profiles!inner(first_name, last_name)")
      .in("agent_id", teamIds)
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
