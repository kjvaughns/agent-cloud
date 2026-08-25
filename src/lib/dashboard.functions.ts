import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { resolveScopeAgentIdsOrNone } from "@/lib/scope.functions";
// One definition of production for every number on this page. The chart used
// to bucket on a different date field from the tiles above it.
import {
  countsAsProduction,
  productionDate,
  premiumOf,
  sumPremium,
  tallyByAgent,
  type ProductionRow,
} from "@/lib/production/source";
// Every window on this page goes through this, so the pending-column fallback
// is written once instead of four times. See the module header.
import { selectProduction } from "@/lib/production/source.server";

const supabaseAdmin = _admin as any;

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

    const rows: ProductionRow[] = await selectProduction<ProductionRow>((col) =>
      supabase
        .from("policies")
        .select("*")
        .eq("agent_id", userId)
        .gte(col, fetchSince.toISOString()),
    );

    // The upper bound is exclusive here — these are adjacent windows (today
    // against yesterday, this week against last) and an inclusive end would
    // count the boundary instant in both.
    const sumWhere = (from: Date, to?: Date) =>
      sumPremium(
        rows.filter((r) => {
          const d = productionDate(r);
          if (!d) return false;
          const t = new Date(d).getTime();
          return t >= from.getTime() && (!to || t < to.getTime());
        }),
      );

    const todayAlp = sumWhere(startOfToday);
    const yesterdayAlp = sumWhere(yesterday, startOfToday);
    const weekAlp = sumWhere(weekAgo);
    const priorWeekAlp = sumWhere(twoWeeksAgo, weekAgo);
    const mtdAlp = sumWhere(startOfMonth);
    // Like-for-like MTD comparison: prior month through the same day-of-month.
    const priorMtdAlp = sumWhere(priorMonthStart, priorMonthSameDay);
    const activeToday = rows.filter((r) => {
      const d = productionDate(r);
      return d ? new Date(d) >= startOfToday : false;
    }).length;

    // Daily cumulative MTD trend
    const daysSoFar = now.getDate();
    const dailyTotals = new Array(daysSoFar).fill(0);
    for (const r of rows) {
      // The tile above this sparkline goes through `sumPremium`, which skips
      // ineligible statuses. Without the same guard the line under it counted
      // withdrawn and not-taken premium, so the chart contradicted the number
      // it was drawn beneath — the same class of disagreement #144 fixed
      // between the tiles and the chart's date field.
      if (!countsAsProduction(r)) continue;
      const when = productionDate(r);
      if (!when) continue;
      const d = new Date(when);
      if (d >= startOfMonth) {
        const idx = d.getDate() - 1;
        if (idx >= 0 && idx < daysSoFar) dailyTotals[idx] += premiumOf(r);
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
  /** Of that premium, how much is on the books. */
  placed: number;
};

const LeaderboardSchema = RangeSchema.extend({
  /**
   * Which population to rank. Absent = the legacy behaviour: self plus
   * recursive downline. "agency" and "imo" route through the scope layer,
   * whose SQL narrows an unauthorized ask instead of erroring — so a caller
   * without an opted-in child asking for "imo" gets their agency, labelled
   * by whatever the UI offered them, which the UI only offers when canImo.
   */
  // Four now. "mine" is the agent's own row, "team" their recursive downline,
  // and both were unreachable — the board answered only "the whole agency",
  // which is one of the three questions people bring to it.
  scope: z.enum(["mine", "team", "agency", "imo"]).optional(),
});

/**
 * Agency owners who turned "show my own numbers on leaderboards" off.
 *
 * They lose their OWN line and nothing else. Resolved through the admin client
 * because a parent ranking an IMO cannot read a child org's settings row under
 * RLS, and this is the one fact from it a rollup is entitled to.
 *
 * Extracted because there are two ways to build a board now and an opt-out
 * honoured on one of them is not honoured at all.
 */
async function hiddenOwnersAmong(ids: string[], viewerId: string): Promise<Set<string>> {
  const hidden = new Set<string>();
  if (!ids.length) return hidden;
  try {
    const { data: orgs } = await supabaseAdmin
      .from("organizations").select("id, owner_id").in("owner_id", ids);
    const orgIds = (orgs ?? []).map((o: any) => o.id);
    if (!orgIds.length) return hidden;
    const { data: optedOut } = await supabaseAdmin
      .from("organization_settings")
      .select("organization_id, show_own_on_leaderboards")
      .in("organization_id", orgIds)
      .eq("show_own_on_leaderboards", false);
    const hiddenOrgIds = new Set((optedOut ?? []).map((s: any) => s.organization_id));
    for (const o of (orgs ?? []) as any[]) {
      if (hiddenOrgIds.has(o.id)) hidden.add(o.owner_id);
    }
  } catch {
    // Column absent before the imo-scope migration: nobody has opted out.
  }
  // Never hide the viewer from themselves — their own board saying they do not
  // exist would read as data loss, not privacy.
  hidden.delete(viewerId);
  return hidden;
}

/**
 * The whole agency's board, via `get_org_leaderboard`.
 *
 * Returns null when the function is not there — the migration is applied by
 * hand, so there is a window between this shipping and the function existing,
 * and in that window the caller keeps today's narrower board rather than
 * showing an error. Logged rather than silent: a temporary state that has been
 * mistaken for the code being wrong before.
 */
async function agencyBoard(
  supabase: any,
  userId: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<{ agents: LeaderboardAgent[]; selfId: string; selfName: string | null } | null> {
  const { data, error } = await supabase.rpc("get_org_leaderboard", {
    _start: rangeStart,
    _end: rangeEnd,
  });
  if (error) {
    console.warn(
      "[leaderboard] get_org_leaderboard unavailable, falling back to the downline board:",
      (error as any)?.code,
      (error as any)?.message,
    );
    return null;
  }

  const rows = (data ?? []) as any[];
  const hidden = await hiddenOwnersAmong(rows.map((r) => r.agent_id), userId);

  const agents = rows
    .filter((r) => !hidden.has(r.agent_id))
    .map((r) => ({
      id: r.agent_id as string,
      name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
      premium: Number(r.premium ?? 0),
      policies: Number(r.policies ?? 0),
      placed: Number(r.placed ?? 0),
    }))
    .sort((a, b) => b.premium - a.premium) as LeaderboardAgent[];

  // The viewer's own name, so the board can place them even when they wrote
  // nothing in the window — this function lists producers only, so somebody
  // quiet this month is legitimately not in `agents`.
  let selfName = agents.find((a) => a.id === userId)?.name ?? null;
  if (!selfName) {
    const { data: me } = await supabase
      .from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle();
    selfName = `${(me as any)?.first_name ?? ""} ${(me as any)?.last_name ?? ""}`.trim() || null;
  }

  return { agents, selfId: userId, selfName };
}

export const getLeaderboardData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LeaderboardSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // ── The agency board answers "the agency" ─────────────────────────────
    //
    // "Each agent should be able to see everyone in the agency, not just them
    // and their downline." The toggle offered My Agency to everybody and, for
    // everybody who is not an org admin, quietly meant "my downline":
    // `scope_agent_ids` degrades 'agency' to 'team' when `is_org_admin` is
    // false, and nothing on screen said the question had been changed.
    //
    // `get_org_leaderboard` is a security definer function returning names and
    // totals only. It is used INSTEAD of widening `scope_agent_ids`, which is
    // also the source of truth for Book of Business, analytics and the
    // dashboard tiles — widening it there would open agency-wide client and
    // policy data to answer a question about a scoreboard.
    //
    // `imo` is deliberately not routed here: that scope spans child agencies,
    // which this function does not walk.
    if (data.scope === "agency") {
      const board = await agencyBoard(supabase, userId, data.rangeStart, data.rangeEnd);
      if (board) return board;
      // The migration is applied by hand, so there is a window where the
      // function does not exist. Falling through to the old path keeps today's
      // board rather than showing an error — no better, but no worse, and the
      // reason is in the logs. Same degrade `resolveScopeAgentIdsOrNone` makes.
    }

    let teamIds: string[];
    if (data.scope === "mine") {
      // Just this person. A board of one is still a board: it carries their
      // own figures for the period and the same trend against the last.
      teamIds = [userId];
    } else if (data.scope) {
      teamIds = await resolveScopeAgentIdsOrNone(supabase, data.scope as any);
      if (!teamIds.length) teamIds = [userId];
    } else {
      // Explicit hierarchy scope: self + recursive downline. Without this,
      // admin/manager RLS grants would leak every agency's producers.
      const { data: downline } = await supabase.rpc("get_team_downline");
      teamIds = [userId, ...((downline ?? []) as { id: string }[]).map((a) => a.id)];
    }

    // Owners who turned "show my own numbers on leaderboards" off lose their
    // OWN line and nothing else. Resolved via the admin client because a
    // parent ranking an IMO cannot read a child org's settings row under RLS
    // — and this is the one fact from it the rollup is entitled to.
    const hidden = await hiddenOwnersAmong(teamIds, userId);
    teamIds = teamIds.filter((id) => !hidden.has(id));

    // ── No join. A name must not be able to delete production ─────────────
    //
    // This read `.select("*, profiles!inner(first_name, last_name)")`, and the
    // `!inner` is the whole bug: an inner join DROPS the policy row when the
    // embedded `profiles` row does not come back. So a leaderboard sitting
    // beside dashboard tiles reading $1,553 and 1 policy — same month, same
    // agent, same table — said "No production yet this period", because the
    // three tile queries select `*` and this one did not.
    //
    // A name is decoration on a row whose point is the premium. Trading the
    // premium for it is the wrong way round, and an inner join is a silent way
    // to make that trade: nothing errors, the rows simply are not there.
    //
    // The names are fetched separately, which is what the code already did for
    // `selfName` a few lines below — one extra query, and no join that can
    // remove a figure from a board.
    const agents = await selectProduction<any>((col) =>
      supabase
        .from("policies")
        // `*` for the same reason as every other production read: naming the
        // date column in the projection is the same 42703 as naming it in a
        // filter. See source.server.ts.
        .select("*")
        .in("agent_id", teamIds)
        .gte(col, data.rangeStart)
        .lte(col, data.rangeEnd),
    );

    const producerIds = Array.from(
      new Set(((agents ?? []) as any[]).map((r) => r.agent_id).filter(Boolean)),
    );
    const names = new Map<string, string>();
    if (producerIds.length) {
      const { data: people } = await supabase
        .from("profiles").select("id, first_name, last_name").in("id", producerIds);
      for (const p of (people ?? []) as any[]) {
        names.set(p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim());
      }
    }
    const sorted = Array.from(tallyByAgent((agents ?? []) as ProductionRow[]).entries())
      .map(([id, t]) => ({
        id,
        name: names.get(id) ?? "",
        premium: t.premium,
        policies: t.policies,
        placed: t.placed,
      }))
      .sort((a, b) => b.premium - a.premium);
    // The viewer's own name, so the board can place them even when they wrote
    // nothing in the window. The rankings are built from policy rows, so an
    // agent with no policies is not in `names` — and was, until now, simply
    // absent from their own leaderboard rather than last on it.
    let selfName = names.get(userId) ?? null;
    if (!selfName) {
      const { data: me } = await supabase
        .from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle();
      selfName = `${(me as any)?.first_name ?? ""} ${(me as any)?.last_name ?? ""}`.trim() || null;
    }

    return {
      agents: sorted as LeaderboardAgent[],
      selfId: userId as string,
      selfName,
    };
  });

/**
 * The three levels of production, for an owner whose agency has sub-agencies:
 *
 *   personal   scope mine — just their own writing
 *   agency     scope agency — everyone in their direct org
 *   imo        scope imo — their org plus every opted-in child, recursively
 *
 * One query per scope through the same resolver every scoped page uses, so
 * these figures cannot disagree with the views behind them. Callers hide the
 * IMO figure when caps.canImo is false; the resolver would narrow it to
 * agency anyway, but showing two identical numbers helps nobody.
 */
export const getProductionByScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    async function sumFor(scope: "mine" | "agency" | "imo") {
      const ids = await resolveScopeAgentIdsOrNone(supabase, scope as any);
      const agentIds = ids.length ? ids : [userId];
      const rows = await selectProduction<ProductionRow>((col) =>
        supabase
          .from("policies")
          .select("*")
          .in("agent_id", agentIds)
          .gte(col, data.rangeStart)
          .lte(col, data.rangeEnd),
      );
      return sumPremium((rows ?? []) as ProductionRow[]);
    }

    const [personal, agency, imo] = await Promise.all([
      sumFor("mine"), sumFor("agency"), sumFor("imo"),
    ]);
    return { personal, agency, imo };
  });

// ── Range-scoped production series (drives the hero chart) ──────────────────

export type SeriesPoint = { label: string; personal: number; team: number };

/**
 * Daily / weekly / monthly ALP for an arbitrary range, split personal vs team.
 *
 * The hero chart previously always showed a month-to-date daily cumulative
 * regardless of the selected period, so the chart and the numbers above it
 * could disagree. This is bucketed from the same range the KPIs use.
 *
 * "team" here means the whole hierarchy including the caller, matching what an
 * agency owner expects a Total Production line to mean. The RPC's team_prod is
 * downline-only, so the KPI tiles and this series answer different questions on
 * purpose — the tiles say "my production" and "the team's", the chart shows
 * personal against the combined total.
 */
export const getProductionSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    const start = new Date(data.rangeStart);
    const end = new Date(data.rangeEnd);
    const spanDays = Math.max(1, (end.getTime() - start.getTime()) / 86400000);

    // Hierarchy scope. get_downline_agents is org-constrained and cycle-safe.
    const { data: downline } = await supabase.rpc("get_downline_agents");
    const ids = [userId, ...(downline ?? []).map((d: any) => d.id)];

    // Windowed on `posted_at`, which is what production means everywhere else
    // — see `lib/production/source.ts`. This used to bucket on
    // COALESCE(effective_date, posted_at) and widen the fetch by 400 days to
    // compensate, with a comment saying it matched the RPC. It had not matched
    // since the July rewrite, so a deal posted today with next month's
    // effective date was counted by the tiles above this chart and dropped by
    // the chart itself.
    const pols = await selectProduction<ProductionRow>((col) =>
      supabase
        .from("policies")
        .select("*")
        .in("agent_id", ids.length ? ids : [userId])
        .gte(col, start.toISOString())
        .lte(col, end.toISOString())
        .limit(20000),
    );

    type Bucket = "hour" | "day" | "week" | "month";
    const bucket: Bucket =
      spanDays <= 1.5 ? "hour" : spanDays <= 62 ? "day" : spanDays <= 190 ? "week" : "month";

    const keyOf = (d: Date) => {
      if (bucket === "hour") return `${d.getHours()}`.padStart(2, "0");
      if (bucket === "day") return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (bucket === "week") {
        const w = new Date(d);
        w.setDate(w.getDate() - ((w.getDay() + 6) % 7)); // weeks start Monday
        return `${w.getFullYear()}-${w.getMonth()}-${w.getDate()}`;
      }
      return `${d.getFullYear()}-${d.getMonth()}`;
    };

    const labelOf = (d: Date) => {
      if (bucket === "hour") return `${((d.getHours() + 11) % 12) + 1}${d.getHours() < 12 ? "a" : "p"}`;
      if (bucket === "month") return d.toLocaleDateString(undefined, { month: "short" });
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    };

    // Pre-seed every bucket so a quiet day renders as zero rather than a gap.
    const buckets = new Map<string, SeriesPoint>();
    const cursor = new Date(start);
    const guard = 400;
    for (let i = 0; i < guard && cursor <= end; i++) {
      const k = keyOf(cursor);
      if (!buckets.has(k)) buckets.set(k, { label: labelOf(cursor), personal: 0, team: 0 });
      if (bucket === "hour") cursor.setHours(cursor.getHours() + 1);
      else if (bucket === "day") cursor.setDate(cursor.getDate() + 1);
      else if (bucket === "week") cursor.setDate(cursor.getDate() + 7);
      else cursor.setMonth(cursor.getMonth() + 1);
    }

    for (const p of pols ?? []) {
      // Same rule as every other production figure. This series is read beside
      // the KPI tiles, which exclude these statuses.
      if (!countsAsProduction(p)) continue;
      const when = productionDate(p);
      if (!when) continue;
      const b = buckets.get(keyOf(new Date(when)));
      if (!b) continue;
      const alp = premiumOf(p);
      b.team += alp;
      if (p.agent_id === userId) b.personal += alp;
    }

    return { series: Array.from(buckets.values()) as SeriesPoint[], bucket };
  });

// ── Production per agency, for an owner with sub-agencies ───────────────────

export type AgencyProduction = {
  orgId: string;
  name: string;
  isMine: boolean;
  premium: number;
  policies: number;
  placed: number;
};

/**
 * One row per agency in the rollup: the viewer's own org first, then every
 * child that is active AND opted into the production rollup.
 *
 * Why the admin client: a parent cannot read a child org's profiles or policies
 * under RLS, and it should not be able to — what it is entitled to is the
 * child's TOTAL, which is what this returns. Nothing here exposes a client, a
 * policy number or an individual agent of a child agency.
 *
 * A paused relationship, or one with `include_production` off, is absent rather
 * than zero: showing $0 beside an agency that simply is not being counted reads
 * as "they wrote nothing", which is a different and wrong statement.
 */
export const getProductionByAgency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ agencies: AgencyProduction[] }> => {
    const { supabase, userId } = context as any;

    const { data: me } = await supabase
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    const myOrgId = (me as any)?.organization_id as string | undefined;
    if (!myOrgId) return { agencies: [] };

    let childIds: string[] = [];
    try {
      const { data: rels } = await supabaseAdmin
        .from("agency_relationships")
        .select("child_org_id, include_production, status")
        .eq("parent_org_id", myOrgId)
        .eq("status", "active")
        .eq("include_production", true);
      childIds = ((rels ?? []) as any[]).map((r) => r.child_org_id).filter(Boolean);
    } catch {
      // Table pending: no children, so this panel simply does not render.
      childIds = [];
    }
    if (!childIds.length) return { agencies: [] };

    const orgIds = [myOrgId, ...childIds];
    const [{ data: orgs }, { data: people }] = await Promise.all([
      supabaseAdmin.from("organizations").select("id, name").in("id", orgIds),
      supabaseAdmin.from("profiles").select("id, organization_id").in("organization_id", orgIds),
    ]);

    const orgOf = new Map<string, string>();
    for (const p of (people ?? []) as any[]) {
      if (p.id && p.organization_id) orgOf.set(p.id, p.organization_id);
    }
    const agentIds = Array.from(orgOf.keys());
    const rows = agentIds.length
      ? await selectProduction<ProductionRow>((col) =>
          supabaseAdmin
            .from("policies")
            .select("*")
            .in("agent_id", agentIds)
            .gte(col, data.rangeStart)
            .lte(col, data.rangeEnd),
        )
      : [];

    const totals = new Map<string, { premium: number; policies: number; placed: number }>();
    for (const orgId of orgIds) totals.set(orgId, { premium: 0, policies: 0, placed: 0 });
    for (const [agentId, t] of tallyByAgent((rows ?? []) as ProductionRow[])) {
      const orgId = orgOf.get(agentId);
      if (!orgId) continue;
      const acc = totals.get(orgId)!;
      acc.premium += t.premium;
      acc.policies += t.policies;
      acc.placed += t.placed;
    }

    const nameOf = new Map(((orgs ?? []) as any[]).map((o) => [o.id, o.name as string]));
    const agencies: AgencyProduction[] = orgIds.map((orgId) => ({
      orgId,
      name: nameOf.get(orgId) ?? "Agency",
      isMine: orgId === myOrgId,
      ...totals.get(orgId)!,
    }));
    agencies.sort((a, b) => (a.isMine === b.isMine ? b.premium - a.premium : a.isMine ? -1 : 1));
    return { agencies };
  });
