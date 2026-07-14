import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { subDays, startOfDay } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { getLeaderboardData, type LeaderboardAgent } from "@/lib/dashboard.functions";
import { getTeamDownline } from "@/lib/team.functions";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Icon } from "@/components/ui/icon";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  head: () => ({ meta: [{ title: "Leaderboard — Agent Cloud" }] }),
  component: LeaderboardPage,
});

const RANGES: { value: string; label: string; days: number | null }[] = [
  { value: "7d", label: "7 Days", days: 7 },
  { value: "30d", label: "30 Days", days: 30 },
  { value: "90d", label: "90 Days", days: 90 },
  { value: "all", label: "All Time", days: null },
];

function initials(name: string) {
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";
}

function Podium({ rows, selfId }: { rows: LeaderboardAgent[]; selfId: string }) {
  const top = rows.slice(0, 3);
  if (top.length < 3) return null;
  // Order for a visual podium: 2nd, 1st, 3rd
  const order = [top[1], top[0], top[2]];
  const heights = ["h-20", "h-28", "h-16"];
  const ranks = [2, 1, 3];
  return (
    <Panel title="Top Performers">
      <div className="grid grid-cols-3 gap-3 items-end pt-2">
        {order.map((a, i) => {
          const you = a.id === selfId;
          return (
            <div key={a.id} className="flex flex-col items-center gap-2 min-w-0">
              <Avatar className="h-11 w-11">
                <AvatarFallback className={cn("text-sm", ranks[i] === 1 ? "bg-primary/20 text-gold-bright" : "bg-surface-2 text-foreground")}>
                  {initials(a.name)}
                </AvatarFallback>
              </Avatar>
              <div className="text-center min-w-0 w-full">
                <div className={cn("text-xs font-medium truncate", you && "text-gold-bright")}>{a.name || "—"}</div>
                <div className="tnum font-display font-bold text-sm" style={{ fontFamily: "var(--font-display)" }}>{money(a.premium)}</div>
              </div>
              <div className={cn("w-full rounded-t-lg border border-b-0 border-border flex items-start justify-center pt-1.5", heights[i], ranks[i] === 1 ? "bg-gold-glow" : "bg-surface-2")}>
                <span className={cn("font-display font-bold", ranks[i] === 1 ? "text-primary text-lg" : "text-text-dim")} style={{ fontFamily: "var(--font-display)" }}>
                  {ranks[i] === 1 ? "★" : ranks[i]}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function AgentTable({ rows, selfId, isLoading }: { rows: LeaderboardAgent[]; selfId: string; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
      </div>
    );
  }
  if (!rows.length) {
    return <div className="text-center text-muted-foreground py-12">No data for this period.</div>;
  }
  return (
    <Panel pad={false} className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-surface-2">
          <tr>
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground w-16">Rank</th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Agent</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Policies</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Premium</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((agent, i) => {
            const rank = i + 1;
            const isYou = agent.id === selfId;
            return (
              <tr key={agent.id} className={cn("border-b border-border-soft last:border-0 transition-colors hover:bg-surface-2", isYou && "bg-gold-glow")}>
                <td className="px-4 py-3">
                  <span className={cn("tnum font-display font-bold", rank === 1 ? "text-primary" : "text-text-dim")} style={{ fontFamily: "var(--font-display)" }}>
                    {rank === 1 ? "★" : `#${rank}`}
                  </span>
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
                <td className="px-4 py-3 text-right tnum">{agent.policies}</td>
                <td className="px-4 py-3 text-right tnum font-semibold">{money(agent.premium)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function LeaderboardPage() {
  const [range, setRange] = useState("30d");

  const { rangeStart, rangeEnd } = useMemo(() => {
    const end = new Date();
    const opt = RANGES.find((r) => r.value === range)!;
    const start = opt.days ? startOfDay(subDays(end, opt.days)) : new Date("2000-01-01");
    return { rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
  }, [range]);

  const fetchLeaderboard = useServerFn(getLeaderboardData);
  const fetchDownline = useServerFn(getTeamDownline);

  const { data: lbData, isLoading: lbLoading } = useQuery({
    queryKey: ["leaderboard", rangeStart, rangeEnd],
    queryFn: () => fetchLeaderboard({ data: { rangeStart, rangeEnd } }),
  });

  const { data: downline, isLoading: downlineLoading } = useQuery({
    queryKey: ["team-downline"],
    queryFn: () => fetchDownline({ data: undefined }),
  });

  const teamRows = useMemo(() => {
    if (!lbData?.agents || !downline) return [];
    const uplineMap = new Map<string, string>();
    for (const agent of downline) {
      if (agent.upline_id) uplineMap.set(agent.id, agent.upline_id);
    }
    const teamAgg = new Map<string, { id: string; name: string; premium: number; policies: number }>();
    for (const agent of lbData.agents) {
      const teamLead = uplineMap.get(agent.id) ?? agent.id;
      if (!teamAgg.has(teamLead)) {
        const leadAgent = downline.find((d) => d.id === teamLead);
        teamAgg.set(teamLead, {
          id: teamLead,
          name: leadAgent ? `${leadAgent.first_name ?? ""} ${leadAgent.last_name ?? ""}`.trim() : agent.name,
          premium: 0,
          policies: 0,
        });
      }
      const entry = teamAgg.get(teamLead)!;
      entry.premium += agent.premium;
      entry.policies += agent.policies;
    }
    return Array.from(teamAgg.values()).sort((a, b) => b.premium - a.premium);
  }, [lbData, downline]);

  const selfId = lbData?.selfId ?? "";

  return (
    <PageShell>
      <div className="max-w-[1200px] mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand
          title="Leaderboard"
          subtitle="Agency production rankings for your team"
          actions={<DateRangePicker options={RANGES.map((r) => ({ value: r.value, label: r.label }))} value={range} onChange={setRange} />}
        />

        {!lbLoading && (lbData?.agents?.length ?? 0) >= 3 && (
          <Podium rows={lbData!.agents} selfId={selfId} />
        )}

        <Tabs defaultValue="agents">
          <TabsList>
            <TabsTrigger value="agents"><Icon name="users" size={14} /> <span className="ml-1.5">Agents</span></TabsTrigger>
            <TabsTrigger value="teams"><Icon name="trophy" size={14} /> <span className="ml-1.5">Teams</span></TabsTrigger>
          </TabsList>

          <TabsContent value="agents" className="mt-4">
            <AgentTable rows={lbData?.agents ?? []} selfId={selfId} isLoading={lbLoading} />
          </TabsContent>

          <TabsContent value="teams" className="mt-4">
            <AgentTable rows={teamRows} selfId={selfId} isLoading={lbLoading || downlineLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
}
