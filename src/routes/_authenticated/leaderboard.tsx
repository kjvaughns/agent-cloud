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
import { getLeaderboardData, type LeaderboardAgent } from "@/lib/dashboard.functions";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { useMyAccess } from "@/hooks/use-my-access";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard — Agent Cloud" }] }),
  component: LeaderboardPage,
});

type Period = "week" | "month" | "last_month" | "ytd";
const PERIODS: { value: Period; label: string }[] = [
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "ytd", label: "YTD" },
];

/** Current + prior same-length ranges for trend comparison. */
function periodRanges(p: Period) {
  const now = new Date();
  const day = 86400000;
  if (p === "week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    return { start, end: now, prevStart: new Date(start.getTime() - 7 * day), prevEnd: start };
  }
  if (p === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), now.getHours());
    return { start, end: now, prevStart, prevEnd };
  }
  if (p === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end, prevStart: new Date(now.getFullYear(), now.getMonth() - 2, 1), prevEnd: start };
  }
  const start = new Date(now.getFullYear(), 0, 1);
  const prevStart = new Date(now.getFullYear() - 1, 0, 1);
  const prevEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  return { start, end: now, prevStart, prevEnd };
}

function initials(name: string) {
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";
}

function TrendIcon({ current, prior }: { current: number; prior: number | undefined }) {
  if (prior === undefined || current === prior) return <Minus className="h-3.5 w-3.5 text-text-dim" />;
  return current > prior
    ? <ArrowUp className="h-3.5 w-3.5 text-success" />
    : <ArrowDown className="h-3.5 w-3.5 text-destructive" />;
}

function usePeriodData(period: Period) {
  const fetchLeaderboard = useServerFn(getLeaderboardData);
  const { start, end, prevStart, prevEnd } = useMemo(() => periodRanges(period), [period]);
  const current = useQuery({
    queryKey: ["leaderboard", period, "current"],
    queryFn: () => fetchLeaderboard({ data: { rangeStart: start.toISOString(), rangeEnd: end.toISOString() } }),
  });
  const prior = useQuery({
    queryKey: ["leaderboard", period, "prior"],
    queryFn: () => fetchLeaderboard({ data: { rangeStart: prevStart.toISOString(), rangeEnd: prevEnd.toISOString() } }),
  });
  return { current, prior };
}

function LeaderboardPage() {
  const { access } = useMyAccess();
  const [period, setPeriod] = useState<Period>("month");
  const { current, prior } = usePeriodData(period);

  const rows = current.data?.agents ?? [];
  const selfId = current.data?.selfId ?? "";
  const priorMap = new Map<string, number>((prior.data?.agents ?? []).map((a) => [a.id, a.premium]));
  const label = PERIODS.find((x) => x.value === period)!.label;

  const totals = useMemo(() => {
    const alp = rows.reduce((a, r) => a + r.premium, 0);
    const policies = rows.reduce((a, r) => a + r.policies, 0);
    return { alp, policies, producing: rows.filter((r) => r.premium > 0).length, avg: policies > 0 ? alp / policies : 0 };
  }, [rows]);

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

  const myRow = rows.find((r) => r.id === selfId);
  const myRank = myRow ? rows.indexOf(myRow) + 1 : null;

  return (
    <PageShell>
      <div className="max-w-[1100px] mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand title="Leaderboard" subtitle="Agency production rankings" actions={periodToggle} />

        {/* Agency production summary */}
        <Panel title={`Agency Production — ${label}`}>
          {current.isLoading ? <Skeleton className="h-16" /> : (
            <div className="flex items-baseline gap-4 flex-wrap">
              <div className="tnum font-bold text-gold-bright" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px,3.5vw,38px)", letterSpacing: "-0.02em" }}>
                {money(totals.alp)} <span className="text-base font-semibold text-foreground">ALP</span>
              </div>
              <div className="text-sm text-muted-foreground tnum">
                {totals.producing} agent{totals.producing === 1 ? "" : "s"} producing · {number(totals.policies)} polic{totals.policies === 1 ? "y" : "ies"} written · Avg {money(totals.avg)}/policy
              </div>
            </div>
          )}
        </Panel>

        {/* Table */}
        {current.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : rows.length === 0 ? (
          <Panel>
            <div className="py-12 text-center space-y-2">
              <div className="font-medium">No production recorded for {label}.</div>
              <p className="text-sm text-muted-foreground">Agents who post deals will appear here.</p>
              <Button asChild size="sm" className="mt-1"><Link to="/post-deal">Post a Deal →</Link></Button>
            </div>
          </Panel>
        ) : (
          <Panel pad={false} className="overflow-hidden">
            <div className="max-h-[560px] overflow-y-auto relative">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-2 z-10">
                  <tr>
                    {["Rank", "Agent", "ALP", "Policies", "Avg/Policy", "Trend"].map((h, i) => (
                      <th key={h} className={cn("px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground", i >= 2 ? "text-right" : "text-left", h === "Trend" && "text-center")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((agent, i) => (
                    <LeaderRow key={agent.id} agent={agent} rank={i + 1} isYou={agent.id === selfId} prior={priorMap.get(agent.id)} />
                  ))}
                </tbody>
                {/* Sticky footer: your position, always visible */}
                {myRow && (
                  <tfoot className="sticky bottom-0 z-10">
                    <LeaderRow agent={myRow} rank={myRank!} isYou prior={priorMap.get(myRow.id)} sticky />
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
      <td className="px-4 py-3 text-right tnum">{agent.policies}</td>
      <td className="px-4 py-3 text-right tnum">{money(avg)}</td>
      <td className="px-4 py-3 text-center"><span className="inline-flex"><TrendIcon current={agent.premium} prior={prior} /></span></td>
    </tr>
  );
}
