import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
  PieChart, Pie, Cell,
} from "recharts";
import { DollarSign, Users, FileText, FolderOpen, ArrowRight } from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { money, number } from "@/lib/format";
import { POLICY_STATUSES } from "@/lib/policy-status";
import { getDashboardMetrics } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Agent Cloud" }] }),
  component: Dashboard,
});

const RANGES: { value: string; label: string; days: number | null }[] = [
  { value: "today", label: "Today", days: 1 },
  { value: "7d", label: "7 Days", days: 7 },
  { value: "30d", label: "30 Days", days: 30 },
  { value: "90d", label: "90 Days", days: 90 },
  { value: "all", label: "All Time", days: null },
];

function Dashboard() {
  const [range, setRange] = useState("30d");
  const [metric, setMetric] = useState<"prod" | "policies">("prod");

  const { rangeStart, rangeEnd, rangeLabel } = useMemo(() => {
    const end = new Date();
    const opt = RANGES.find((r) => r.value === range)!;
    const start = opt.days ? startOfDay(subDays(end, opt.days)) : new Date("2000-01-01");
    return { rangeStart: start.toISOString(), rangeEnd: end.toISOString(), rangeLabel: opt.label };
  }, [range]);

  const fetchMetrics = useServerFn(getDashboardMetrics);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-metrics", rangeStart, rangeEnd],
    queryFn: () => fetchMetrics({ data: { rangeStart, rangeEnd } }),
  });

  const trend = data?.trend ?? [];
  const trendData = trend.map((t) => ({
    m: format(new Date(t.month), "MMM yy"),
    individual: metric === "prod" ? Number(t.my_prod) : Number(t.my_policies),
    team: metric === "prod" ? Number(t.team_prod) : Number(t.team_policies),
  }));

  // Previous-period delta from trend (compare last 6 vs prior 6 months)
  const split = Math.floor(trend.length / 2);
  const sumRange = (arr: typeof trend, k: "my_prod" | "team_prod") =>
    arr.reduce((acc, t) => acc + Number(t[k] ?? 0), 0);
  const prior = trend.slice(0, split);
  const recent = trend.slice(split);
  const indDelta = sumRange(prior, "my_prod") > 0
    ? ((sumRange(recent, "my_prod") - sumRange(prior, "my_prod")) / sumRange(prior, "my_prod")) * 100
    : 0;
  const teamDelta = sumRange(prior, "team_prod") > 0
    ? ((sumRange(recent, "team_prod") - sumRange(prior, "team_prod")) / sumRange(prior, "team_prod")) * 100
    : 0;

  const donutData = [
    { name: "Active", value: data?.donut.active ?? 0, color: "#10b981" },
    { name: "In Review", value: data?.donut.in_review ?? 0, color: "#a855f7" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <Card className="w-72">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Enrollment Tracker</CardTitle>
                <p className="text-xs text-muted-foreground">Last 30 Days</p>
              </div>
              <Link to="/book-of-business" className="text-xs text-primary hover:underline">View All →</Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="h-24 w-24">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} dataKey="value" innerRadius={26} outerRadius={42} stroke="none">
                      {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1">
                <div className="text-2xl font-bold">{data?.donut.total ?? 0}</div>
                <div className="text-xs space-y-1 mt-1">
                  <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Active: {data?.donut.active ?? 0}</div>
                  <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-500" /> In Review: {data?.donut.in_review ?? 0}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time range filter */}
      <div className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Button key={r.value} size="sm" variant={range === r.value ? "default" : "outline"} onClick={() => setRange(r.value)}>
            {r.label}
          </Button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile icon={DollarSign} color="text-blue-500" label="Individual Production (You)" value={money(data?.my_prod ?? 0)} sub={rangeLabel} loading={isLoading} />
        <KpiTile icon={Users} color="text-emerald-500" label="Total Production (Team)" value={money(data?.team_prod ?? 0)} sub={rangeLabel} loading={isLoading} />
        <KpiTile icon={FileText} color="text-blue-500" label="My Policies" value={number(data?.my_policies ?? 0)} sub={rangeLabel} loading={isLoading} />
        <KpiTile icon={FolderOpen} color="text-emerald-500" label="Team Policies" value={number(data?.team_policies ?? 0)} sub={rangeLabel} loading={isLoading} />
      </div>

      {/* Production trend */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <CardTitle>Production Trend</CardTitle>
            <div className="flex items-center gap-4">
              <div className="text-xs text-right space-y-0.5">
                <div><span className="inline-block h-2 w-2 rounded-full bg-blue-500 mr-1" />Individual: {metric === "prod" ? money(sumRange(recent, "my_prod")) : number(recent.reduce((a, t) => a + Number(t.my_policies), 0))} <span className={indDelta >= 0 ? "text-emerald-600" : "text-red-600"}>{indDelta >= 0 ? "↑" : "↓"} {Math.abs(indDelta).toFixed(0)}%</span></div>
                <div><span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-1" />Team: {metric === "prod" ? money(sumRange(recent, "team_prod")) : number(recent.reduce((a, t) => a + Number(t.team_policies), 0))} <span className={teamDelta >= 0 ? "text-emerald-600" : "text-red-600"}>{teamDelta >= 0 ? "↑" : "↓"} {Math.abs(teamDelta).toFixed(0)}%</span></div>
              </div>
              <div className="flex">
                <Button size="sm" variant={metric === "prod" ? "default" : "outline"} onClick={() => setMetric("prod")} className="rounded-r-none">$ Prod</Button>
                <Button size="sm" variant={metric === "policies" ? "default" : "outline"} onClick={() => setMetric("policies")} className="rounded-l-none"># Policies</Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="indGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                  <linearGradient id="teamGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="m" fontSize={12} stroke="var(--color-muted-foreground)" tickLine={false} axisLine={false} />
                <YAxis fontSize={12} stroke="var(--color-muted-foreground)" tickLine={false} axisLine={false}
                  tickFormatter={(v) => metric === "prod" ? `$${(v / 1000).toFixed(0)}K` : String(v)} />
                <Tooltip
                  contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                  formatter={(v: number) => metric === "prod" ? money(v) : number(v)} />
                <Area type="monotone" dataKey="team" stroke="#10b981" strokeWidth={2} fill="url(#teamGrad)" />
                <Area type="monotone" dataKey="individual" stroke="#3b82f6" strokeWidth={2} fill="url(#indGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Quick overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card><CardContent className="pt-6">
          <div className="text-3xl font-bold">{data?.active_downline ?? 0}</div>
          <div className="font-medium mt-1">Active Downline</div>
          <div className="text-xs text-muted-foreground">Agents ready to sell</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-3xl font-bold">{data?.active_contracts ?? 0}</div>
          <div className="font-medium mt-1">Active Contracts</div>
          <div className="text-xs text-muted-foreground">Across all carriers</div>
        </CardContent></Card>
      </div>

      {/* Policy Status grid */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Policy Status</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {POLICY_STATUSES.map((s) => (
            <Link key={s.value} to="/book-of-business" search={{ status: s.value } as any} className={`rounded-lg border p-4 transition hover:scale-[1.02] ${s.cardCls}`}>
              <div className="text-xs font-medium opacity-80">{s.label}</div>
              <div className="text-2xl font-bold mt-1">{data?.status_grid?.[s.value] ?? 0}</div>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-6 pt-2 text-sm">
        <Link to="/analytics" className="text-primary hover:underline flex items-center gap-1">View Detailed Analytics <ArrowRight className="h-3 w-3" /></Link>
        <Link to="/team" className="text-primary hover:underline flex items-center gap-1">View My Team <ArrowRight className="h-3 w-3" /></Link>
        <Link to="/book-of-business" className="text-primary hover:underline flex items-center gap-1">View Book of Business <ArrowRight className="h-3 w-3" /></Link>
      </div>
    </div>
  );
}

function KpiTile({
  icon: Icon, color, label, value, sub, loading,
}: { icon: any; color: string; label: string; value: string; sub: string; loading: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {loading ? <Skeleton className="h-7 w-24" /> : <div className="text-2xl font-bold">{value}</div>}
            <div className="text-sm font-medium mt-1">{label}</div>
            <div className="text-xs text-muted-foreground">{sub}</div>
          </div>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </CardContent>
    </Card>
  );
}
