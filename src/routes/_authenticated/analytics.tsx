import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, RefreshCw, Trophy, TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown, AlertTriangle, Star, AlertCircle, Lightbulb } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { fmtCurrency } from "@/lib/format";
import {
  getAnalyticsOverview, getDailyReport, getAgentAnalytics, getTeamLeaderboard,
  getCarrierBreakdown, getTrends, getPolicyAnalytics, getQualityMetrics,
  getRecruitingFunnel, getChallenges, getTrophies, getAIInsights,
  type AIInsight,
} from "@/lib/analytics.functions";
import { supabase } from "@/integrations/supabase/client";
import { AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [
    { title: "Business Analytics — Agent Cloud" },
    { name: "description", content: "AI-powered analytics, challenges, and team performance for your insurance agency." },
  ]}),
  component: AnalyticsPage,
});

type RangeKey = "7d" | "30d" | "90d" | "ytd" | "all";
const CHART_COLORS = ["hsl(217 91% 60%)", "hsl(142 71% 45%)", "hsl(262 83% 58%)", "hsl(25 95% 53%)", "hsl(0 84% 60%)", "hsl(199 89% 48%)", "hsl(48 96% 53%)", "hsl(280 80% 60%)"];

function AnalyticsPage() {
  const [range, setRange] = useState<RangeKey>("30d");

  return (
    <div className="p-6 space-y-6">
      <Header range={range} onRange={setRange} />
      <ChallengeCards />
      <TrophyCabinet />
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="daily">Daily Report</TabsTrigger>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="individual">Individual</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="carriers">Carriers</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="policy">Policy</TabsTrigger>
          <TabsTrigger value="quality">Quality</TabsTrigger>
          <TabsTrigger value="recruiting">Recruiting</TabsTrigger>
          <TabsTrigger value="coach">AI Coach</TabsTrigger>
        </TabsList>
        <TabsContent value="daily" className="mt-4"><DailyReportPanel /></TabsContent>
        <TabsContent value="overview" className="mt-4"><OverviewPanel range={range} /></TabsContent>
        <TabsContent value="individual" className="mt-4"><IndividualPanel range={range} /></TabsContent>
        <TabsContent value="team" className="mt-4"><TeamPanel range={range} /></TabsContent>
        <TabsContent value="carriers" className="mt-4"><CarriersPanel range={range} /></TabsContent>
        <TabsContent value="trends" className="mt-4"><TrendsPanel /></TabsContent>
        <TabsContent value="policy" className="mt-4"><PolicyPanel /></TabsContent>
        <TabsContent value="quality" className="mt-4"><QualityPanel /></TabsContent>
        <TabsContent value="recruiting" className="mt-4"><RecruitingPanel /></TabsContent>
        <TabsContent value="coach" className="mt-4"><AICoachPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function Header({ range, onRange }: { range: RangeKey; onRange: (r: RangeKey) => void }) {
  const fetchInsights = useServerFn(getAIInsights);
  const refresh = useMutation({
    mutationFn: () => fetchInsights({ data: { tab: "overview", force: true } }),
    onSuccess: () => window.dispatchEvent(new Event("ai-insights-refreshed")),
  });
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Business Analytics</h1>
        <p className="text-sm text-muted-foreground">Track your team's performance and business growth</p>
      </div>
      <div className="flex items-center gap-2">
        <Select value={range} onValueChange={(v) => onRange(v as RangeKey)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="ytd">This Year</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          <Sparkles className="h-4 w-4 mr-2" />AI Insights
        </Button>
        <Button variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          <RefreshCw className={`h-4 w-4 ${refresh.isPending ? "animate-spin" : ""}`} />
        </Button>
      </div>
    </div>
  );
}

// ---------------- Challenges ----------------
function ChallengeCards() {
  const fetchChallenges = useServerFn(getChallenges);
  const q = useQuery({ queryKey: ["challenges"], queryFn: () => fetchChallenges() });
  const completedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!q.data) return;
    let cancelled = false;
    const celebrate = async () => {
      const { default: confetti } = await import("canvas-confetti");
      if (!cancelled) confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
    };

    for (const c of q.data) {
      if (c.completed && !completedRef.current.has(c.id)) {
        completedRef.current.add(c.id);
        celebrate();
      } else if (c.completed) {
        completedRef.current.add(c.id);
      }
    }
    return () => {
      cancelled = true;
    };
  }, [q.data]);

  const colors = { daily: "bg-blue-500", weekly: "bg-green-500", monthly: "bg-purple-500", quarterly: "bg-orange-500" } as const;
  const order: Array<"daily"|"weekly"|"monthly"|"quarterly"> = ["daily", "weekly", "monthly", "quarterly"];

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-lg font-semibold">AI-Powered Sales Challenges</h2>
        <p className="text-xs text-muted-foreground">Hit your goals and earn trophies</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {order.map((p) => {
          const c = q.data?.find((x) => x.period === p);
          if (!c) return <Card key={p}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>;
          const pct = Math.min(100, Math.round(((c.current_value ?? 0) / Math.max(1, c.target_value ?? 1)) * 100));
          const isPremium = c.type === "premium";
          return (
            <Card key={c.id} className={c.completed ? "border-amber-400 border-2 shadow-lg" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold capitalize">{p} Challenge</div>
                  {c.completed && <Trophy className="h-5 w-5 text-amber-500" />}
                </div>
                <div className="text-xs text-muted-foreground mb-3">{c.description}</div>
                <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
                  <div className={`h-full ${colors[p]} transition-all duration-700`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="font-medium">
                    {isPremium ? fmtCurrency(c.current_value ?? 0) : c.current_value ?? 0}
                    {" / "}
                    {isPremium ? fmtCurrency(c.target_value ?? 0) : c.target_value ?? 0}
                  </span>
                  <span className="text-muted-foreground">{pct}%</span>
                </div>
                {c.completed && <div className="text-xs text-amber-600 mt-2 font-semibold">🏆 Completed!</div>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Trophy Cabinet ----------------
function TrophyCabinet() {
  const fetchTrophies = useServerFn(getTrophies);
  const q = useQuery({ queryKey: ["trophies"], queryFn: () => fetchTrophies() });
  const trophies = q.data ?? [];
  const byType = (t: string) => trophies.filter((x) => x.type === t).length;
  const dotColors: Record<string, string> = { daily: "bg-blue-500", weekly: "bg-green-500", monthly: "bg-purple-500", quarterly: "bg-orange-500" };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <h3 className="font-semibold">Trophy Cabinet</h3>
            <Badge variant="secondary">{trophies.length} Total</Badge>
          </div>
          <Dialog>
            <DialogTrigger asChild><Button variant="link" size="sm">View All →</Button></DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader><DialogTitle>Trophy Cabinet</DialogTitle></DialogHeader>
              <div className="grid grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
                {trophies.length === 0 && <div className="col-span-3 text-center text-sm text-muted-foreground py-8">No trophies yet. Complete challenges to earn them!</div>}
                {trophies.map((t) => (
                  <Card key={t.id}><CardContent className="p-4 text-center">
                    <Trophy className="h-10 w-10 mx-auto text-amber-500" />
                    <div className="text-xs font-medium mt-2 capitalize">{t.type} Trophy</div>
                    <div className="text-[10px] text-muted-foreground">{new Date(t.earned_at).toLocaleDateString()}</div>
                  </CardContent></Card>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex gap-4 text-xs flex-wrap">
          {(["daily","weekly","monthly","quarterly"] as const).map((p) => (
            <div key={p} className="flex items-center gap-1.5">
              <div className={`h-2.5 w-2.5 rounded-full ${dotColors[p]}`} />
              <span className="capitalize">{p}: {byType(p)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Insight Card ----------------
function InsightCard({ card }: { card: AIInsight }) {
  const variants = {
    needs_attention: { bg: "bg-amber-500/10 border-amber-500/40", icon: AlertTriangle, color: "text-amber-600", label: "Needs Attention" },
    learn_from: { bg: "bg-green-500/10 border-green-500/40", icon: Star, color: "text-green-600", label: "Learn From" },
    risk_alert: { bg: "bg-red-500/10 border-red-500/40", icon: AlertCircle, color: "text-red-600", label: "Risk Alert" },
    coaching: { bg: "bg-blue-500/10 border-blue-500/40", icon: Lightbulb, color: "text-blue-600", label: "Coaching" },
  } as const;
  const v = variants[card.type];
  const Icon = v.icon;
  return (
    <Card className={`border ${v.bg}`}>
      <CardContent className="p-4 space-y-2">
        <div className={`flex items-center gap-2 text-sm font-semibold ${v.color}`}><Icon className="h-4 w-4" />{v.label}</div>
        <div className="font-medium text-sm">{card.title}</div>
        <p className="text-xs text-muted-foreground">{card.body}</p>
        {typeof card.dollar_impact === "number" && card.dollar_impact > 0 && (
          <div className="text-xs font-semibold text-green-600">💰 {fmtCurrency(card.dollar_impact)} potential</div>
        )}
        {card.action_text && <Button size="sm" variant="outline" className="mt-1" asChild={!!card.action_url}>
          {card.action_url ? <a href={card.action_url}>{card.action_text}</a> : <span>{card.action_text}</span>}
        </Button>}
      </CardContent>
    </Card>
  );
}

function AIInsightSection({ tab }: { tab: "overview" | "coach" }) {
  const fetchInsights = useServerFn(getAIInsights);
  const q = useQuery({
    queryKey: ["ai-insights", tab],
    queryFn: () => fetchInsights({ data: { tab, force: false } }),
    retry: false,
  });
  useEffect(() => {
    const h = () => q.refetch();
    window.addEventListener("ai-insights-refreshed", h);
    return () => window.removeEventListener("ai-insights-refreshed", h);
  }, [q]);

  if (q.isLoading) return <div className="grid md:grid-cols-3 gap-3">{[0,1,2].map((i) => <Skeleton key={i} className="h-32" />)}</div>;
  if (q.isError) return <Card><CardContent className="p-4 text-sm text-destructive">{(q.error as Error).message}</CardContent></Card>;
  const cards = q.data?.cards ?? [];
  if (!cards.length) return <Card><CardContent className="p-4 text-sm text-muted-foreground">No insights yet. Click "AI Insights" above to generate.</CardContent></Card>;
  return <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">{cards.map((c, i) => <InsightCard key={i} card={c} />)}</div>;
}

// ---------------- Overview ----------------
function OverviewPanel({ range }: { range: RangeKey }) {
  const fetchOverview = useServerFn(getAnalyticsOverview);
  const q = useQuery({ queryKey: ["overview", range], queryFn: () => fetchOverview({ data: { range } }) });
  const d = q.data;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold mb-1">AI-Powered Insights</h3>
        <p className="text-xs text-muted-foreground mb-3">Powered by your last 30 days of data</p>
        <AIInsightSection tab="overview" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Deals" value={String(d?.kpis.deals ?? 0)} delta={d?.kpis.deals_delta} />
        <KpiCard label="Total Premium" value={fmtCurrency(d?.kpis.premium ?? 0)} delta={d?.kpis.premium_delta} />
        <KpiCard label="Active Producers" value={String(d?.kpis.producers ?? 0)} delta={d?.kpis.producers_delta} />
        <KpiCard label="Avg Deal Size" value={fmtCurrency(d?.kpis.avg_deal ?? 0)} />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Conversion Rate</div>
          <div className="text-3xl font-bold mt-1">{d?.conversion_rate ?? 0}%</div>
          <div className="text-xs text-muted-foreground mt-1">Producers with at least one deal</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Premium Growth</div>
          <div className="text-3xl font-bold mt-1">{d?.monthly_growth ?? 0}%</div>
          <div className="text-xs text-muted-foreground mt-1">vs prior period</div>
        </CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle className="text-base">Top Carriers This Period</CardTitle></CardHeader><CardContent>
        {d?.top_carriers?.length ? (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={d.top_carriers} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis type="category" dataKey="carrier" stroke="var(--color-muted-foreground)" fontSize={11} width={120} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} formatter={(v: number) => fmtCurrency(v)} />
                <Bar dataKey="premium" radius={[0,6,6,0]}>
                  {d.top_carriers.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <Table className="mt-3">
              <TableHeader><TableRow><TableHead>Carrier</TableHead><TableHead>Deals</TableHead><TableHead>Premium</TableHead><TableHead>% of Total</TableHead></TableRow></TableHeader>
              <TableBody>{d.top_carriers.map((c) => (
                <TableRow key={c.carrier}>
                  <TableCell>{c.carrier}</TableCell>
                  <TableCell>{c.deals}</TableCell>
                  <TableCell>{fmtCurrency(c.premium)}</TableCell>
                  <TableCell>{d.total_premium > 0 ? ((c.premium / d.total_premium) * 100).toFixed(1) : 0}%</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </>
        ) : <div className="text-sm text-muted-foreground text-center py-8">No carrier data in this period.</div>}
      </CardContent></Card>
    </div>
  );
}

// ---------------- Daily Report ----------------
function DailyReportPanel() {
  const fetchDaily = useServerFn(getDailyReport);
  const q = useQuery({ queryKey: ["daily-report"], queryFn: () => fetchDaily() });
  const d = q.data;
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Daily Report — {new Date().toLocaleDateString()}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Policies Posted" value={String(d?.policies_today ?? 0)} />
        <KpiCard label="Calls Made" value={String(d?.calls_today ?? 0)} />
        <KpiCard label="SMS Sent" value={String(d?.sms_today ?? 0)} />
        <KpiCard label="New Clients" value={String(d?.new_clients_today ?? 0)} />
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <Card><CardHeader><CardTitle className="text-base">Active Agents Today</CardTitle></CardHeader><CardContent>
          {d?.active_agents?.length ? (
            <ul className="space-y-1 text-sm">{d.active_agents.map((a) => <li key={a.id}>• {a.name}</li>)}</ul>
          ) : <p className="text-sm text-muted-foreground">No agent activity yet today.</p>}
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Alerts</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
          <div>
            <div className="font-medium text-amber-600 mb-1">Lapse Pending ({d?.lapse_pending?.length ?? 0})</div>
            <ul className="space-y-0.5 text-xs">{d?.lapse_pending?.slice(0, 5).map((p) => <li key={p.id}>• {p.client_name} — {p.carrier}</li>)}</ul>
          </div>
          <div>
            <div className="font-medium text-blue-600 mb-1">Upcoming Effective (next 7d)</div>
            <ul className="space-y-0.5 text-xs">{d?.upcoming_effective?.slice(0, 5).map((p) => <li key={p.id}>• {p.client_name} — {new Date(p.effective_date).toLocaleDateString()}</li>)}</ul>
          </div>
        </CardContent></Card>
      </div>
    </div>
  );
}

// ---------------- Individual ----------------
function IndividualPanel({ range }: { range: RangeKey }) {
  const [agentId, setAgentId] = useState<string | null>(null);
  const downlineQ = useQuery({
    queryKey: ["downline-agents"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_downline_agents");
      if (error) throw error;
      return (data ?? []) as { id: string; first_name: string; last_name: string }[];
    },
  });
  const fetchAgent = useServerFn(getAgentAnalytics);
  const agentQ = useQuery({
    queryKey: ["agent-analytics", agentId, range],
    queryFn: () => fetchAgent({ data: { agentId: agentId!, range } }),
    enabled: !!agentId,
  });
  const d = agentQ.data;

  return (
    <div className="space-y-4">
      <Select value={agentId ?? ""} onValueChange={setAgentId}>
        <SelectTrigger className="w-[280px]"><SelectValue placeholder="Select an agent" /></SelectTrigger>
        <SelectContent>
          {(downlineQ.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.first_name} {a.last_name}</SelectItem>)}
        </SelectContent>
      </Select>
      {!agentId && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Select an agent to view their analytics.</CardContent></Card>}
      {d && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Policies" value={String(d.kpis?.policies ?? 0)} />
            <KpiCard label="Premium" value={fmtCurrency(d.kpis?.premium ?? 0)} />
            <KpiCard label="Avg Deal" value={fmtCurrency(d.kpis?.avg_deal ?? 0)} />
            <KpiCard label="Last Active" value={d.kpis?.last_active ? new Date(d.kpis.last_active).toLocaleDateString() : "—"} />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Card><CardHeader><CardTitle className="text-base">6-Month Production</CardTitle></CardHeader><CardContent>
              <ResponsiveContainer width="100%" height={240}><BarChart data={d.monthly ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} />
                <Tooltip formatter={(v: number) => fmtCurrency(v)} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
                <Bar dataKey="premium" fill={CHART_COLORS[0]} radius={[6,6,0,0]} />
              </BarChart></ResponsiveContainer>
            </CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Status Breakdown</CardTitle></CardHeader><CardContent>
              <ResponsiveContainer width="100%" height={240}><PieChart>
                <Pie data={d.status_dist ?? []} dataKey="count" nameKey="status" outerRadius={80}>
                  {(d.status_dist ?? []).map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart></ResponsiveContainer>
            </CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader><CardContent>
            <ul className="space-y-1 text-sm">{(d.activity ?? []).map((a: any, i: number) => (
              <li key={i} className="flex justify-between border-b py-1.5">
                <span>{a.label}</span><span className="text-xs text-muted-foreground">{new Date(a.at).toLocaleString()}</span>
              </li>
            ))}</ul>
          </CardContent></Card>
        </>
      )}
    </div>
  );
}

// ---------------- Team ----------------
function TeamPanel({ range }: { range: RangeKey }) {
  const fetchTeam = useServerFn(getTeamLeaderboard);
  const q = useQuery({ queryKey: ["team-lb", range], queryFn: () => fetchTeam({ data: { range } }) });
  const d = q.data;
  return (
    <div className="space-y-4">
      <Card><CardHeader><CardTitle className="text-base">Production Leaderboard</CardTitle></CardHeader><CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Rank</TableHead><TableHead>Agent</TableHead><TableHead>Policies</TableHead><TableHead>Premium</TableHead><TableHead>Avg Deal</TableHead><TableHead>Trend</TableHead></TableRow></TableHeader>
          <TableBody>{(d?.rows ?? []).map((r, i) => (
            <TableRow key={r.id} className={r.id === d?.self_id ? "bg-blue-500/10" : ""}>
              <TableCell>{i + 1}</TableCell>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell>{r.policies}</TableCell>
              <TableCell>{fmtCurrency(r.premium)}</TableCell>
              <TableCell>{fmtCurrency(r.avg_deal)}</TableCell>
              <TableCell>{r.trend === "up" ? <ArrowUp className="h-4 w-4 text-green-600" /> : r.trend === "down" ? <ArrowDown className="h-4 w-4 text-red-600" /> : <Minus className="h-4 w-4 text-muted-foreground" />}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

// ---------------- Carriers ----------------
function CarriersPanel({ range }: { range: RangeKey }) {
  const fetchC = useServerFn(getCarrierBreakdown);
  const q = useQuery({ queryKey: ["carriers", range], queryFn: () => fetchC({ data: { range } }) });
  const rows = q.data?.rows ?? [];
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        {rows.slice(0, 9).map((r) => (
          <Card key={r.carrier}><CardContent className="p-4">
            <div className="font-semibold">{r.carrier ?? "Unknown"}</div>
            <div className="text-xs text-muted-foreground mt-1">Deals: {r.deals}</div>
            <div className="text-xs">Premium: {fmtCurrency(r.premium)}</div>
            <div className="text-xs">Avg: {fmtCurrency(r.avg_deal)}</div>
            {r.top_agent && <div className="text-xs text-muted-foreground mt-1">Top agent: {r.top_agent}</div>}
          </CardContent></Card>
        ))}
      </div>
      <Card><CardContent className="p-4">
        <Table>
          <TableHeader><TableRow><TableHead>Carrier</TableHead><TableHead>Deals</TableHead><TableHead>Premium</TableHead><TableHead>Avg Deal</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((r) => (
            <TableRow key={r.carrier}><TableCell>{r.carrier ?? "Unknown"}</TableCell><TableCell>{r.deals}</TableCell><TableCell>{fmtCurrency(r.premium)}</TableCell><TableCell>{fmtCurrency(r.avg_deal)}</TableCell></TableRow>
          ))}</TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

// ---------------- Trends ----------------
function TrendsPanel() {
  const [mode, setMode] = useState<"premium" | "policies">("premium");
  const fetchT = useServerFn(getTrends);
  const q = useQuery({ queryKey: ["trends"], queryFn: () => fetchT() });
  const series = q.data?.series ?? [];
  const myKey = mode === "premium" ? "my_premium" : "my_policies";
  const teamKey = mode === "premium" ? "team_premium" : "team_policies";
  const best = [...series].sort((a, b) => (b as any)[teamKey] - (a as any)[teamKey])[0];
  const worst = [...series].sort((a, b) => (a as any)[teamKey] - (b as any)[teamKey])[0];

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button size="sm" variant={mode === "premium" ? "default" : "outline"} onClick={() => setMode("premium")}>$ Premium</Button>
        <Button size="sm" variant={mode === "policies" ? "default" : "outline"} onClick={() => setMode("policies")}># Policies</Button>
      </div>
      <Card><CardHeader><CardTitle className="text-base">12-Month Trend</CardTitle></CardHeader><CardContent>
        <ResponsiveContainer width="100%" height={300}><AreaChart data={series}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} />
          <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} formatter={(v: number) => mode === "premium" ? fmtCurrency(v) : v} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area type="monotone" dataKey={myKey} stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.3} name="You" />
          <Area type="monotone" dataKey={teamKey} stroke={CHART_COLORS[1]} fill={CHART_COLORS[1]} fillOpacity={0.2} name="Team" />
        </AreaChart></ResponsiveContainer>
      </CardContent></Card>
      {best && worst && (
        <div className="grid md:grid-cols-2 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Best month</div><div className="text-lg font-bold">{best.month} — {fmtCurrency((best as any).team_premium)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Slowest month</div><div className="text-lg font-bold">{worst.month} — {fmtCurrency((worst as any).team_premium)}</div></CardContent></Card>
        </div>
      )}
    </div>
  );
}

// ---------------- Policy ----------------
function PolicyPanel() {
  const fetchP = useServerFn(getPolicyAnalytics);
  const q = useQuery({ queryKey: ["policy-analytics"], queryFn: () => fetchP() });
  const d = q.data;
  const total = (d?.status_dist ?? []).reduce((s, x) => s + x.count, 0);
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <Card><CardHeader><CardTitle className="text-base">Status Distribution</CardTitle></CardHeader><CardContent>
          <ResponsiveContainer width="100%" height={260}><PieChart>
            <Pie data={d?.status_dist ?? []} dataKey="count" nameKey="status" outerRadius={90}>
              {(d?.status_dist ?? []).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart></ResponsiveContainer>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Breakdown</CardTitle></CardHeader><CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Count</TableHead><TableHead>%</TableHead><TableHead>Avg Premium</TableHead></TableRow></TableHeader>
            <TableBody>{(d?.status_dist ?? []).map((s) => (
              <TableRow key={s.status}><TableCell>{s.status}</TableCell><TableCell>{s.count}</TableCell><TableCell>{total > 0 ? ((s.count / total) * 100).toFixed(1) : 0}%</TableCell><TableCell>{fmtCurrency(s.avg_premium)}</TableCell></TableRow>
            ))}</TableBody>
          </Table>
        </CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle className="text-base">Policies at Risk</CardTitle></CardHeader><CardContent>
        {d?.at_risk?.length ? (
          <Table>
            <TableHeader><TableRow><TableHead>Client</TableHead><TableHead>Carrier</TableHead><TableHead>Premium</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>{d.at_risk.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{p.client_name}</TableCell><TableCell>{p.carrier}</TableCell><TableCell>{fmtCurrency(p.monthly_premium)}/mo</TableCell>
                <TableCell><Button size="sm" variant="outline" asChild><a href={`/phone?client=${p.client_id}`}>Follow Up</a></Button></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        ) : <p className="text-sm text-muted-foreground">No policies at risk.</p>}
      </CardContent></Card>
    </div>
  );
}

// ---------------- Quality ----------------
function QualityPanel() {
  const fetchQ = useServerFn(getQualityMetrics);
  const q = useQuery({ queryKey: ["quality"], queryFn: () => fetchQ() });
  const d = q.data;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard label="Persistency (13-mo)" value={d?.persistency_pct != null ? `${d.persistency_pct}%` : "—"} />
        <KpiCard label="Lapse Rate (12-mo)" value={`${d?.lapse_rate_pct ?? 0}%`} />
        <KpiCard label="Avg Policy Duration" value={`${d?.avg_duration_months ?? 0} mo`} />
      </div>
      <Card><CardHeader><CardTitle className="text-base">Lapse Rate Trend</CardTitle></CardHeader><CardContent>
        <ResponsiveContainer width="100%" height={260}><LineChart data={d?.lapse_trend ?? []}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} />
          <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
          <ReferenceLine y={15} stroke="hsl(0 84% 60%)" strokeDasharray="4 4" label={{ value: "Industry avg", fontSize: 10 }} />
          <Line type="monotone" dataKey="lapse_rate" stroke={CHART_COLORS[0]} strokeWidth={2} />
        </LineChart></ResponsiveContainer>
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">By Carrier</CardTitle></CardHeader><CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Carrier</TableHead><TableHead>Placed</TableHead><TableHead>Active</TableHead><TableHead>Lapsed</TableHead><TableHead>Persistency</TableHead></TableRow></TableHeader>
          <TableBody>{(d?.by_carrier ?? []).map((c: any) => (
            <TableRow key={c.carrier}><TableCell>{c.carrier ?? "—"}</TableCell><TableCell>{c.placed}</TableCell><TableCell>{c.active}</TableCell><TableCell>{c.lapsed}</TableCell><TableCell>{c.persistency_pct}%</TableCell></TableRow>
          ))}</TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

// ---------------- Recruiting ----------------
function RecruitingPanel() {
  const fetchR = useServerFn(getRecruitingFunnel);
  const q = useQuery({ queryKey: ["recruiting"], queryFn: () => fetchR() });
  const funnel = q.data?.funnel ?? [];
  const monthly = q.data?.monthly_onboarded ?? [];
  const order = ["new", "callback", "in_course", "getting_licensed", "onboarded"];
  const sorted = order.map((s) => funnel.find((f) => f.stage === s) ?? { stage: s, count: 0 });
  const total = sorted[0]?.count ?? 0;
  const onboarded = sorted[sorted.length - 1]?.count ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Total Prospects" value={String(funnel.reduce((s, f) => s + f.count, 0))} />
        <KpiCard label="Onboarded" value={String(onboarded)} />
        <KpiCard label="Conversion" value={total > 0 ? `${((onboarded / total) * 100).toFixed(1)}%` : "—"} />
      </div>
      <Card><CardHeader><CardTitle className="text-base">Recruiting Funnel</CardTitle></CardHeader><CardContent className="space-y-2">
        {sorted.map((s, i) => {
          const pct = total > 0 ? (s.count / total) * 100 : 0;
          return (
            <div key={s.stage}>
              <div className="flex justify-between text-sm mb-1"><span className="capitalize">{s.stage.replace(/_/g, " ")}</span><span className="font-medium">{s.count}</span></div>
              <Progress value={pct} />
            </div>
          );
        })}
      </CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">New Agents Over Time</CardTitle></CardHeader><CardContent>
        <ResponsiveContainer width="100%" height={240}><BarChart data={monthly}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} />
          <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)" }} />
          <Bar dataKey="count" fill={CHART_COLORS[2]} radius={[6,6,0,0]} />
        </BarChart></ResponsiveContainer>
      </CardContent></Card>
    </div>
  );
}

// ---------------- AI Coach ----------------
function AICoachPanel() {
  const fetchI = useServerFn(getAIInsights);
  const refresh = useMutation({ mutationFn: () => fetchI({ data: { tab: "coach", force: true } }) });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />AI Coach</h3>
          <p className="text-xs text-muted-foreground">Personalized recommendations based on your data</p>
        </div>
        <Button onClick={() => refresh.mutate()} disabled={refresh.isPending}><RefreshCw className={`h-4 w-4 mr-2 ${refresh.isPending ? "animate-spin" : ""}`} />Refresh Coaching</Button>
      </div>
      <AIInsightSection tab="coach" />
    </div>
  );
}
