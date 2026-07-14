import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Crown } from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { getLeaderboardData, type LeaderboardAgent } from "@/lib/dashboard.functions";
import { getTeamDownline } from "@/lib/team.functions";

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

function AgentTable({ rows, selfId, isLoading }: { rows: LeaderboardAgent[]; selfId: string; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
      </div>
    );
  }
  if (!rows.length) {
    return <div className="text-center text-muted-foreground py-12">No data for this period.</div>;
  }
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground w-16">Rank</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Agent</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Policies</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Premium</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((agent, i) => {
              const rank = i + 1;
              const rankCls =
                rank === 1 ? "text-primary font-bold" :
                rank === 2 ? "text-slate-400 font-semibold" :
                rank === 3 ? "text-amber-600 font-semibold" : "text-muted-foreground";
              const isYou = agent.id === selfId;
              return (
                <tr key={agent.id} className={cn("border-b last:border-0 transition-colors hover:bg-muted/20", isYou && "bg-primary/10")}>
                  <td className={cn("px-4 py-3 font-mono text-sm", rankCls)}>
                    {rank === 1 && <Crown className="inline h-3.5 w-3.5 mr-1 text-primary -mt-0.5" />}
                    #{rank}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-xs bg-primary/15 text-primary">{initials(agent.name)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{agent.name || "—"}</span>
                      {isYou && <span className="text-xs text-primary font-medium">(You)</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">{agent.policies}</td>
                  <td className="px-4 py-3 text-right font-medium">{money(agent.premium)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
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
    <div className="p-4 md:p-6 space-y-6 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leaderboard</h1>
        <p className="text-muted-foreground mt-1">Agency production rankings for your team.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Button key={r.value} size="sm" variant={range === r.value ? "default" : "outline"} onClick={() => setRange(r.value)}>
            {r.label}
          </Button>
        ))}
      </div>

      <Tabs defaultValue="agents">
        <TabsList>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="mt-4">
          <AgentTable rows={lbData?.agents ?? []} selfId={selfId} isLoading={lbLoading} />
        </TabsContent>

        <TabsContent value="teams" className="mt-4">
          <AgentTable rows={teamRows} selfId={selfId} isLoading={lbLoading || downlineLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
