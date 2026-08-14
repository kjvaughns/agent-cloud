import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Trophy, ArrowUp, ArrowDown, Minus, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { money, number } from "@/lib/format";
import { getLeaderboardData, getProductionByScope, type LeaderboardAgent } from "@/lib/dashboard.functions";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { useMyAccess } from "@/hooks/use-my-access";
import { useScopeCapabilities } from "@/hooks/use-scope";
import { EmptyState } from "@/components/empty-state";
import { EMPTY_STATES, ghostFor } from "@/lib/empty-states";
import {
  PERIODS,
  BOARD_SCOPES,
  periodRanges,
  rankBoard,
  boardTotals,
  trendOf,
  type Period,
  type BoardScope,
} from "@/lib/leaderboard/board";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard — Agent Cloud" }] }),
  component: LeaderboardPage,
});

// Periods, ranking and trend live in `lib/leaderboard/board.ts`. They were
// here, and the week comparison was quietly wrong: Sunday-to-now against a
// complete prior week, so on six days out of seven every arrow pointed down.
// Moved out so the arithmetic can be exercised on a Tuesday without waiting
// for one.

function initials(name: string) {
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";
}

function TrendIcon({ current, prior }: { current: number; prior: number | undefined }) {
  const t = trendOf(current, prior);
  if (t === "up") return <ArrowUp className="h-3.5 w-3.5 text-success" />;
  if (t === "down") return <ArrowDown className="h-3.5 w-3.5 text-destructive" />;
  // Flat and unknown both draw a dash, but they are different facts and the
  // title says which — an agent who was not on the prior board has not held
  // steady.
  return (
    <Minus
      className="h-3.5 w-3.5 text-text-dim"
      aria-label={t === "flat" ? "No change" : "No figure for the prior period"}
    />
  );
}

function usePeriodData(period: Period, scope?: BoardScope, custom?: { from?: string; to?: string }) {
  const fetchLeaderboard = useServerFn(getLeaderboardData);
  const { start, end, prevStart, prevEnd } = useMemo(
    () => periodRanges(period, new Date(), custom),
    [period, custom?.from, custom?.to],
  );
  const current = useQuery({
    queryKey: ["leaderboard", period, scope ?? "team", custom?.from ?? "", custom?.to ?? "", "current"],
    queryFn: () => fetchLeaderboard({ data: { rangeStart: start.toISOString(), rangeEnd: end.toISOString(), scope } }),
  });
  const prior = useQuery({
    queryKey: ["leaderboard", period, scope ?? "team", custom?.from ?? "", custom?.to ?? "", "prior"],
    queryFn: () => fetchLeaderboard({ data: { rangeStart: prevStart.toISOString(), rangeEnd: prevEnd.toISOString(), scope } }),
  });
  return { current, prior };
}

/**
 * Personal / My Agency / Total IMO, month to date. Rendered only for someone
 * whose agency has sub-agencies opted into the rollup — a solo agency's three
 * numbers would just be the same number three times. A child agency owner
 * with their own children sees their own IMO here; never their parent's.
 */
function ThreeLevels() {
  const fetchFn = useServerFn(getProductionByScope);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const { data } = useQuery({
    queryKey: ["production-by-scope", start.toISOString().slice(0, 10)],
    queryFn: () => fetchFn({ data: { rangeStart: start.toISOString(), rangeEnd: now.toISOString() } }),
  });
  if (!data) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatTile label="Personal" value={money(data.personal)} />
      <StatTile label="My Agency" value={money(data.agency)} />
      <StatTile label="Total IMO" value={money(data.imo)} />
    </div>
  );
}

function LeaderboardPage() {
  const { access } = useMyAccess();
  const { caps } = useScopeCapabilities();
  const [period, setPeriod] = useState<Period>("month");
  // The board switch, for agencies with an IMO. "agency" ranks the direct
  // org; "imo" adds every opted-in sub-agency. Without children the legacy
  // team board stands and no switch renders.
  // Personal, team, agency, and IMO where the agency has opted-in children.
  // Only the last two existed; "how am I doing" and "how is my team doing"
  // were questions the board could not answer.
  const [board, setBoard] = useState<BoardScope>("agency");
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const availableScopes = BOARD_SCOPES.filter(
    (s) =>
      (s.value !== "imo" || caps.canImo) &&
      (s.value !== "team" || caps.downlineCount > 0),
  );
  const scope: BoardScope = availableScopes.some((s) => s.value === board) ? board : "agency";
  const { current, prior } = usePeriodData(period, scope, custom);

  const selfId = current.data?.selfId ?? "";
  const priorMap = useMemo(
    () => new Map<string, number>((prior.data?.agents ?? []).map((a) => [a.id, a.premium])),
    [prior.data],
  );
  // Ranked here rather than trusting the query's order, because the viewer is
  // added when they wrote nothing and ties share a rank. Both are decisions,
  // and both live in the module.
  const rows = useMemo(
    () =>
      current.data
        ? rankBoard(current.data.agents ?? [], {
            selfId,
            selfName: (current.data as any).selfName ?? undefined,
            prior: priorMap,
          })
        : [],
    [current.data, selfId, priorMap],
  );
  const label = PERIODS.find((x) => x.value === period)!.label;

  const totals = useMemo(() => boardTotals(rows), [rows]);

  const periodToggle = (
    <div className="flex gap-1.5 flex-wrap">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => setPeriod(p.value)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
            period === p.value
              ? "bg-gold-glow text-gold-bright border-primary/40"
              : "bg-surface-2 text-muted-foreground border-border hover:text-foreground",
          )}
        >
          {p.label}
        </button>
      ))}
      {period === "custom" && (
        <span className="flex items-center gap-1.5">
          <input
            type="date"
            aria-label="From"
            value={custom.from ?? ""}
            onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
            className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            aria-label="To"
            value={custom.to ?? ""}
            onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
            className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs"
          />
        </span>
      )}
    </div>
  );

  // ── Solo agents: personal production tracker, no comparisons ──────────────
  if (access?.isSolo) {
    const me = rows.find((r) => r.id === selfId);
    return (
      <PageShell>
        <div className="max-w-2xl mx-auto flex flex-col gap-[var(--gap)]">
          <HeroBand title="My Production" actions={periodToggle} />
          <Panel>
            <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">{label} ALP</div>
            <div className="tnum font-bold text-gold-bright mt-1" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(30px,4vw,42px)", letterSpacing: "-0.02em" }}>
              {money(me?.premium ?? 0)}
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <StatTile label="Policies written" value={number(me?.policies ?? 0)} />
              <StatTile label="Avg premium" value={money(me?.policies ? (me.premium / me.policies) : 0)} />
            </div>
          </Panel>
          <Panel title="Grow Your Team">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-gold-glow grid place-items-center text-gold-bright shrink-0"><TrendingUp className="h-5 w-5" /></div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Upgrade to the Agency Plan to build a team and see competitive rankings.</p>
                <Button asChild size="sm" className="mt-2.5"><Link to="/settings/billing">Upgrade →</Link></Button>
              </div>
            </div>
          </Panel>
        </div>
      </PageShell>
    );
  }

  // Always present now: rankBoard places the viewer even at zero, which is
  // the whole point of a footer whose job is to say where you stand.
  const myRow = rows.find((r) => r.isYou);

  const boardToggle = availableScopes.length > 1 ? (
    <div className="flex gap-1.5 flex-wrap">
      {availableScopes.map(({ value: v, label: l }) => (
        <button
          key={v}
          onClick={() => setBoard(v)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
            scope === v
              ? "bg-gold-glow text-gold-bright border-primary/40"
              : "bg-surface-2 text-muted-foreground border-border hover:text-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <PageShell>
      <div className="max-w-[1100px] mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand
          title="Leaderboard"
          subtitle={scope === "imo" ? "Your agency plus every opted-in sub-agency" : "Agency production rankings"}
          actions={<div className="flex flex-wrap items-center gap-2">{boardToggle}{periodToggle}</div>}
        />

        {caps.canImo && <ThreeLevels />}

        {/* Agency production summary */}
        <Panel title={`${scope === "imo" ? "Total IMO" : "Agency"} Production — ${label}`}>
          {current.isLoading ? <Skeleton className="h-16" /> : (
            <div className="flex items-baseline gap-4 flex-wrap">
              <div className="tnum font-bold text-gold-bright" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px,3.5vw,38px)", letterSpacing: "-0.02em" }}>
                {money(totals.alp)} <span className="text-base font-semibold text-foreground">ALP</span>
              </div>
              <div className="text-sm text-muted-foreground tnum">
                {totals.producing} agent{totals.producing === 1 ? "" : "s"} producing · {number(totals.policies)} polic{totals.policies === 1 ? "y" : "ies"} written · {money(totals.placed)} placed · Avg {money(totals.avg)}/policy
              </div>
            </div>
          )}
        </Panel>

        {/* Table */}
        {current.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={EMPTY_STATES.leaderboard.title}
            body={EMPTY_STATES.leaderboard.body}
            ghost={ghostFor("leaderboard")}
            action={<Button asChild size="sm"><Link to="/post-deal">Post a deal</Link></Button>}
          />
        ) : (
          <Panel pad={false} className="overflow-hidden">
            <div className="max-h-[560px] overflow-y-auto relative">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-2 z-10">
                  <tr>
                    {["Rank", "Agent", "ALP", "Placed", "Policies", "Avg/Policy", "Trend"].map((h, i) => (
                      <th key={h} className={cn("px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground", i >= 2 ? "text-right" : "text-left", h === "Trend" && "text-center")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((agent) => (
                    <LeaderRow key={agent.id} agent={agent} rank={agent.rank} isYou={agent.isYou} prior={agent.prior} />
                  ))}
                </tbody>
                {/* Sticky footer: your position, always visible */}
                {myRow && (
                  <tfoot className="sticky bottom-0 z-10">
                    <LeaderRow agent={myRow} rank={myRow.rank} isYou prior={myRow.prior} sticky />
                  </tfoot>
                )}
              </table>
            </div>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}

function LeaderRow({ agent, rank, isYou, prior, sticky }: { agent: LeaderboardAgent; rank: number; isYou: boolean; prior: number | undefined; sticky?: boolean }) {
  const avg = agent.policies > 0 ? agent.premium / agent.policies : 0;
  return (
    <tr
      className={cn(
        "border-t",
        sticky ? "bg-card border-primary/40" : "border-border-soft hover:bg-surface-2 transition-colors",
        isYou && "border-l-2 border-l-primary bg-gold-glow/60",
        !isYou && rank === 2 && "border-l-2 border-l-slate-400/60",
        !isYou && rank === 3 && "border-l-2 border-l-amber-700/60",
      )}
    >
      <td className="px-4 py-3 w-16">
        {rank === 1
          ? <Trophy className="h-4.5 w-4.5 h-[18px] w-[18px] text-gold-bright" />
          : <span className={cn("tnum font-display font-bold", rank <= 3 ? "text-foreground" : "text-text-dim")} style={{ fontFamily: "var(--font-display)" }}>#{rank}</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs bg-primary/15 text-primary">{initials(agent.name)}</AvatarFallback>
          </Avatar>
          <span className={cn("font-medium", isYou && "text-gold-bright")}>{agent.name || "—"}</span>
          {isYou && <span className="text-[8.5px] px-1.5 py-0.5 bg-primary text-gold-foreground rounded font-extrabold tracking-[0.05em]">YOU</span>}
        </div>
      </td>
      <td className="px-4 py-3 text-right tnum font-semibold font-display" style={{ fontFamily: "var(--font-display)" }}>{money(agent.premium)}</td>
      {/* What of that is on the books. The gap between the two is how much of
          what somebody wrote is still standing. */}
      <td className="px-4 py-3 text-right tnum text-muted-foreground">
        {agent.premium > 0 ? (
          <>
            {money(agent.placed)}
            <span className="ml-1 text-[11px]">
              {Math.round((agent.placed / agent.premium) * 100)}%
            </span>
          </>
        ) : "—"}
      </td>
      <td className="px-4 py-3 text-right tnum">{agent.policies}</td>
      <td className="px-4 py-3 text-right tnum">{money(avg)}</td>
      <td className="px-4 py-3 text-center"><span className="inline-flex"><TrendIcon current={agent.premium} prior={prior} /></span></td>
    </tr>
  );
}
