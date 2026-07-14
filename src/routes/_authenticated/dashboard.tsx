import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import {
  AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
  PieChart, Pie, Cell,
} from "recharts";
import { DollarSign, Users, FileText, FolderOpen, ArrowRight, AlertTriangle, CheckCircle2, ChevronRight, UserPlus, Bell, TrendingUp, AlertCircle } from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { money, number } from "@/lib/format";
import { POLICY_STATUSES } from "@/lib/policy-status";
import { getDashboardMetrics, getAgencyFeed, getDashboardHero, getCommissionSummary, getAtRiskPolicies, getLeaderboardData } from "@/lib/dashboard.functions";
import { getProducerProfile } from "@/lib/account.functions";
import { sendAgentReminder } from "@/lib/team.functions";
import { AiDailyBriefing } from "@/components/ai/daily-briefing";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PageShell, Panel } from "@/components/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { LinkAction } from "@/components/ui/section-label";
import { Icon } from "@/components/ui/icon";
import { SmoothAreaChart } from "@/components/ui/area-chart";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { NovaRail } from "@/components/nova-rail";
import { useTheme } from "@/hooks/use-theme";

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
  const [view, setView] = useState<"personal" | "agency">("personal");

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

  const fetchAgencyFeed = useServerFn(getAgencyFeed);
  const { data: agencyFeed, isLoading: agencyFeedLoading } = useQuery({
    queryKey: ["dashboard-agency-feed"],
    queryFn: () => fetchAgencyFeed(),
    staleTime: 60_000,
  });

  const { novaRail } = useTheme();

  const fetchHero = useServerFn(getDashboardHero);
  const { data: hero } = useQuery({ queryKey: ["dashboard-hero"], queryFn: () => fetchHero(), staleTime: 60_000 });

  const fetchCommission = useServerFn(getCommissionSummary);
  const { data: commission } = useQuery({ queryKey: ["dashboard-commission"], queryFn: () => fetchCommission(), staleTime: 60_000 });

  const fetchAtRisk = useServerFn(getAtRiskPolicies);
  const { data: atRisk } = useQuery({ queryKey: ["dashboard-atrisk"], queryFn: () => fetchAtRisk(), staleTime: 60_000 });

  const fetchLeaders = useServerFn(getLeaderboardData);
  const { data: leaders } = useQuery({
    queryKey: ["dashboard-leaders", rangeStart, rangeEnd],
    queryFn: () => fetchLeaders({ data: { rangeStart, rangeEnd } }),
    staleTime: 60_000,
  });

  const profileFn = useServerFn(getProducerProfile);
  const { data: profileData } = useQuery({
    queryKey: ["producer-profile-completion"],
    queryFn: () => profileFn(),
    staleTime: 5 * 60_000,
  });
  const completion = profileData?.completion ?? { pct: 0, missing: [] as string[] };
  const missing = (completion.missing as string[]) ?? [];
  const pct = completion.pct as number;

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

  const donutTotal = data?.donut.total ?? 0;

  return (
    <PageShell>
      {pct < 100 && pct > 0 && (
        <div className="mb-[var(--gap)]"><ProfileCompletionBanner pct={pct} missing={missing} /></div>
      )}
      <div className={cn("cgrid", !novaRail && "nonova")}>
        <div className="col">
          <HeroPanel hero={hero} range={range} setRange={setRange} />

          <div className="duo">
            <LeaderboardPanel leaders={leaders} />
            <CommissionPanel c={commission} />
          </div>

          <OnboardingPanel feed={agencyFeed} loading={agencyFeedLoading} />

          {/* Detailed analytics (preserved features) */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1">
              <Button size="sm" variant={view === "personal" ? "default" : "outline"} onClick={() => setView("personal")}>My View</Button>
              <Button size="sm" variant={view === "agency" ? "default" : "outline"} onClick={() => setView("agency")}>Agency View</Button>
            </div>
            <div className="flex">
              <Button size="sm" variant={metric === "prod" ? "default" : "outline"} onClick={() => setMetric("prod")} className="rounded-r-none">$ Prod</Button>
              <Button size="sm" variant={metric === "policies" ? "default" : "outline"} onClick={() => setMetric("policies")} className="rounded-l-none"># Policies</Button>
            </div>
          </div>

          {view === "agency" && (
            <div className="duo">
              <ActivationQueueWidget feed={agencyFeed} loading={agencyFeedLoading} />
              <TeamActivityFeed feed={agencyFeed} loading={agencyFeedLoading} />
            </div>
          )}

          <div className="duo">
            <Panel
              title="Production Trend"
              action={
                <span className="text-[11px] text-muted-foreground tnum">
                  Team {metric === "prod" ? money(sumRange(recent, "team_prod")) : number(recent.reduce((a, t) => a + Number(t.team_policies), 0))}{" "}
                  <span className={teamDelta >= 0 ? "text-success" : "text-destructive"}>{teamDelta >= 0 ? "↑" : "↓"}{Math.abs(teamDelta).toFixed(0)}%</span>
                </span>
              }
            >
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="indGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} /></linearGradient>
                      <linearGradient id="teamGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="m" fontSize={12} stroke="var(--color-muted-foreground)" tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} stroke="var(--color-muted-foreground)" tickLine={false} axisLine={false}
                      tickFormatter={(v) => metric === "prod" ? `$${(v / 1000).toFixed(0)}K` : String(v)} />
                    <Tooltip
                      contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                      formatter={(v: number) => metric === "prod" ? money(v) : number(v)} />
                    <Area type="monotone" dataKey="team" stroke="var(--color-success)" strokeWidth={2} fill="url(#teamGrad)" />
                    {view === "personal" && (
                      <Area type="monotone" dataKey="individual" stroke="var(--color-primary)" strokeWidth={2} fill="url(#indGrad)" />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel title="Enrollment" action={<LinkAction href="/book-of-business">View all</LinkAction>}>
              <div className="flex items-center gap-4 flex-1">
                <div className="h-24 w-24 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutData} dataKey="value" innerRadius={26} outerRadius={42} stroke="none">
                        {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 grid place-items-center text-lg font-bold tnum">{donutTotal}</div>
                </div>
                <div className="flex-1 text-xs space-y-1.5">
                  <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-success" /> Active <span className="ml-auto font-semibold tnum">{data?.donut.active ?? 0}</span></div>
                  <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: "#a855f7" }} /> In Review <span className="ml-auto font-semibold tnum">{data?.donut.in_review ?? 0}</span></div>
                  <div className="flex items-center gap-2 pt-1 border-t border-border"><span className="text-muted-foreground">Active downline</span> <span className="ml-auto font-semibold tnum">{data?.active_downline ?? 0}</span></div>
                  <div className="flex items-center gap-2"><span className="text-muted-foreground">Active contracts</span> <span className="ml-auto font-semibold tnum">{data?.active_contracts ?? 0}</span></div>
                </div>
              </div>
            </Panel>
          </div>

          <Panel title="Policy Status">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {POLICY_STATUSES.map((s) => (
                <Link key={s.value} to="/book-of-business" search={{ status: s.value } as any} className={`rounded-lg border p-3 transition hover:scale-[1.02] ${s.cardCls}`}>
                  <div className="text-[11px] font-medium opacity-80">{s.label}</div>
                  <div className="text-xl font-bold mt-1 tnum">{data?.status_grid?.[s.value] ?? 0}</div>
                </Link>
              ))}
            </div>
          </Panel>

          <AiDailyBriefing />
        </div>

        {novaRail && <DashboardRail atRisk={atRisk?.rows ?? []} />}
      </div>
    </PageShell>
  );
}

// ── Reference-match dashboard panels ─────────────────────────────────────────

function pctStr(n: number, suffix = "%") {
  return `${n >= 0 ? "+" : ""}${n.toFixed(0)}${suffix}`;
}

function HeroPanel({ hero, range, setRange }: { hero: any; range: string; setRange: (v: string) => void }) {
  const kpis = [
    { label: "Today ALP", value: money(hero?.todayAlp ?? 0), delta: `${(hero?.todayDelta ?? 0) >= 0 ? "+" : ""}${money(hero?.todayDelta ?? 0)}`, up: (hero?.todayDelta ?? 0) >= 0 },
    { label: "Week ALP", value: money(hero?.weekAlp ?? 0), delta: pctStr(hero?.weekDeltaPct ?? 0), up: (hero?.weekDeltaPct ?? 0) >= 0 },
    { label: "Active Policies", value: number(hero?.activePolicies ?? 0), delta: `+${hero?.activeToday ?? 0} today`, up: true },
    { label: "Team ALP", value: money(hero?.teamAlp ?? 0), delta: `${pctStr(hero?.teamDeltaPct ?? 0)} MoM`, up: (hero?.teamDeltaPct ?? 0) >= 0 },
  ];
  return (
    <Panel pad={false} className="overflow-hidden">
      <div className="hgrid hgrid-swap">
        <div className="hero-right grid grid-cols-2 border-r border-border">
          {kpis.map((k, i) => (
            <div
              key={k.label}
              className={cn(
                "flex flex-col justify-center min-h-[96px]",
                i < 2 && "border-b border-border",
                i % 2 === 0 && "border-r border-border",
              )}
              style={{ padding: "var(--pad)" }}
            >
              <StatTile label={k.label} value={k.value} delta={k.delta} deltaUp={k.up} />
            </div>
          ))}
        </div>
        <div className="min-w-0" style={{ padding: "var(--pad)" }}>
          <div className="flex justify-between items-start gap-3">
            <div>
              <div className="font-display text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>Month-to-date ALP</div>
              <div className="flex items-baseline gap-3 mt-1.5">
                <div className="tnum font-display font-bold leading-none text-gold-bright" style={{ fontFamily: "var(--font-display)", fontSize: "clamp(34px,4.5vw,46px)", letterSpacing: "-0.02em" }}>
                  {money(hero?.mtdAlp ?? 0)}
                </div>
                <div className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-success rounded-full px-2 py-0.5" style={{ background: "rgba(69,185,104,.12)" }}>
                  <Icon name="up" size={13} /> {pctStr(hero?.weekDeltaPct ?? 0)}
                </div>
              </div>
              <div className="text-[11.5px] text-muted-foreground mt-1.5">
                Goal {money(hero?.mtdGoal ?? 80000)} · <span className="text-foreground">{hero?.mtdPct ?? 0}% there</span> · {hero?.daysLeft ?? 0} days left
              </div>
            </div>
            <DateRangePicker options={RANGES.map((r) => ({ value: r.value, label: r.label }))} value={range} onChange={setRange} />
          </div>
          <div className="mt-3.5"><SmoothAreaChart data={(hero?.trend?.length ?? 0) >= 2 ? hero.trend : [0, 0]} /></div>
        </div>
      </div>
    </Panel>
  );
}

function LeaderboardPanel({ leaders }: { leaders: any }) {
  const agents: any[] = (leaders?.agents ?? []).slice(0, 5);
  const selfId = leaders?.selfId;
  return (
    <Panel title="Leaderboard" action={<span className="text-[10.5px] text-muted-foreground">MTD ALP</span>}>
      {agents.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">No production yet this period.</div>
      ) : (
        <div className="flex flex-col gap-1 flex-1">
          {agents.map((a, i) => {
            const rank = i + 1;
            const you = a.id === selfId;
            return (
              <div key={a.id} className={cn("flex items-center gap-3 px-2.5 py-2 rounded-lg border", you ? "bg-gold-glow border-primary/30" : "border-transparent")}>
                <div className={cn("w-[18px] text-center font-display font-bold tnum", rank === 1 ? "text-primary text-[15px]" : "text-text-dim text-xs")} style={{ fontFamily: "var(--font-display)" }}>
                  {rank === 1 ? "★" : rank}
                </div>
                <div className={cn("flex-1 text-[12.5px] truncate", you ? "font-bold text-gold-bright" : "font-medium")}>{a.name || "Agent"}</div>
                <div className="tnum font-display font-bold text-[12.5px]" style={{ fontFamily: "var(--font-display)" }}>{money(a.premium)}</div>
                {you && <div className="text-[8.5px] px-1.5 py-0.5 bg-primary text-gold-foreground rounded font-extrabold tracking-[0.05em]">YOU</div>}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function CommissionPanel({ c }: { c: any }) {
  const items = [
    { label: "Advance Paid", value: money(c?.advance ?? 0), sub: "this month", neg: false },
    { label: "Trail Income", value: money(c?.trail ?? 0), sub: "year 2+", neg: false },
    { label: "Override", value: money(c?.override ?? 0), sub: "downline", neg: false },
    { label: "Chargebacks", value: money(c?.chargebacks ?? 0), sub: `${c?.chargebackCount ?? 0} policies`, neg: (c?.chargebacks ?? 0) < 0 },
  ];
  return (
    <Panel title="Commission" action={<LinkAction href="/finances">Finances</LinkAction>}>
      <div className="grid grid-cols-2 gap-2.5 flex-1">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col justify-center rounded-[10px] border border-border-soft bg-surface-2 p-3.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{it.label}</div>
            <div className={cn("tnum font-display font-bold text-xl mt-1.5", it.neg ? "text-destructive" : "text-gold-bright")} style={{ fontFamily: "var(--font-display)" }}>{it.value}</div>
            <div className="text-[10.5px] text-muted-foreground mt-0.5">{it.sub}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function OnboardingPanel({ feed, loading }: { feed: any; loading: boolean }) {
  const queue: any[] = (feed?.activationQueue ?? []).slice(0, 5);
  const rows = queue.map((a) => {
    const missingCount = (a.missing ?? []).length;
    const pct = Math.max(5, Math.round(((4 - Math.min(4, missingCount)) / 4) * 100));
    const status = missingCount === 0 ? "Ready to contract" : `Pending ${a.missing[0]}`;
    const color = pct >= 100 ? "var(--green)" : pct >= 70 ? "var(--gold)" : pct >= 40 ? "var(--amber)" : "var(--red)";
    return { name: `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() || "Agent", pct, status, color };
  });
  return (
    <Panel title="Agent Onboarding" action={<LinkAction href="/contracting/invite">Invite</LinkAction>}>
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}</div>
      ) : rows.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">No agents in onboarding. Invite your first agent to get started.</div>
      ) : (
        <div className="flex flex-col gap-3.5 flex-1">
          {rows.map((a, i) => (
            <div key={i}>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[12.5px] font-medium">{a.name}</span>
                <div className="flex gap-2.5 items-center">
                  <span className="text-[10.5px] text-muted-foreground">{a.status}</span>
                  <span className="tnum font-display font-bold text-xs" style={{ fontFamily: "var(--font-display)", color: a.color }}>{a.pct}%</span>
                </div>
              </div>
              <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${a.pct}%`, background: a.color }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function DashboardRail({ atRisk }: { atRisk: any[] }) {
  const navigate = useNavigate();
  const top = atRisk[0];
  const insight = atRisk.length
    ? `${atRisk.length} ${atRisk.length === 1 ? "policy is" : "policies are"} flagged at-risk. Top priority: Policy ${top?.policy_number ?? top?.id} — client hasn't paid in ${top?.days ?? 0} days. I'd recommend a call today.`
    : "No at-risk policies right now. Your book looks healthy this week.";
  return (
    <aside className="col">
      <Panel
        title={<span className="text-destructive">Needs attention</span>}
        action={<LinkAction href="/book-of-business">View all</LinkAction>}
        style={{ borderColor: "rgba(239,83,80,.28)" }}
      >
        {atRisk.length === 0 ? (
          <div className="py-4 text-sm text-muted-foreground flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> All policies current.</div>
        ) : (
          <div className="flex flex-col gap-2 flex-1">
            {atRisk.map((r) => (
              <div key={r.id} className="flex items-center gap-2.5 rounded-[9px] border border-border-soft bg-surface-2 px-2.5 py-2.5">
                <span className="text-destructive shrink-0"><Icon name="alert" size={15} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">Policy {r.policy_number ?? "—"} · {r.client}</div>
                  <div className="text-[10.5px] text-muted-foreground">{r.days} days unpaid · {money(r.monthly_premium)}/mo</div>
                </div>
                <a href="/phone" className="text-[10.5px] font-semibold text-primary whitespace-nowrap">Call →</a>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <NovaRail
        insight={insight}
        context="Dashboard — agency owner view. At-risk policies and this week's production."
        actions={[
          { label: "Show all at-risk policies", onClick: () => navigate({ to: "/book-of-business", search: { status: "lapse_pending" } as any }) },
          { label: "Draft a retention script", onClick: () => navigate({ to: "/resources/scripts" }) },
          { label: "Summarize this week", onClick: () => navigate({ to: "/analytics" }) },
        ]}
      />
    </aside>
  );
}

// ── Agency Command Center Widgets ────────────────────────────────────────────

function initials(f?: string | null, l?: string | null) {
  return `${(f ?? "?")[0] ?? "?"}${(l ?? "")[0] ?? ""}`.toUpperCase();
}

function ActivationQueueWidget({ feed, loading }: { feed: any; loading: boolean }) {
  const qc = useQueryClient();
  const reminderFn = useServerFn(sendAgentReminder);
  const remind = useMutation({
    mutationFn: (agentId: string) => reminderFn({ data: { agentId } }),
    onSuccess: (res: any) => {
      if (res?.ok) toast.success("Reminder sent");
      else if (res?.reason === "throttled") toast.info("Already reminded in last 24h");
      else toast.error("Couldn't send reminder");
      qc.invalidateQueries({ queryKey: ["dashboard-agency-feed"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });

  const queue: any[] = feed?.activationQueue ?? [];
  const stuckContracts: number = feed?.stuckContracts ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Activation Queue</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Agents needing profile help</p>
        </div>
        <div className="flex gap-2 items-center">
          {stuckContracts > 0 && (
            <Link to="/contracting">
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertCircle className="h-3 w-3" /> {stuckContracts} stuck contract{stuckContracts !== 1 ? "s" : ""}
              </Badge>
            </Link>
          )}
          <Link to="/team" className="text-xs text-primary hover:underline">View All →</Link>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : queue.length === 0 ? (
          <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            All direct agents have complete profiles.
          </div>
        ) : (
          <div className="space-y-2">
            {queue.map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg border bg-muted/30">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="text-xs">{initials(a.first_name, a.last_name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{a.first_name} {a.last_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    Missing: {a.missing.slice(0, 3).join(", ")}{a.missing.length > 3 ? ` +${a.missing.length - 3}` : ""}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs shrink-0"
                  onClick={() => remind.mutate(a.id)}
                  disabled={remind.isPending}
                >
                  <Bell className="h-3 w-3 mr-1" /> Remind
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TeamActivityFeed({ feed, loading }: { feed: any; loading: boolean }) {
  const policies: any[] = feed?.recentPolicies ?? [];
  const newAgents: any[] = feed?.newAgents ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Team Activity</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Recent from your direct downline</p>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <>
            {newAgents.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">New This Week</div>
                <div className="space-y-1.5">
                  {newAgents.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      <Avatar className="h-6 w-6 shrink-0">
                        <AvatarFallback className="text-[10px]">{initials(a.first_name, a.last_name)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{a.first_name} {a.last_name}</span>
                      <Badge variant="outline" className="text-[10px] py-0 h-4 text-emerald-600 border-emerald-500/30 bg-emerald-500/10">New Agent</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">{new Date(a.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {policies.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Recent Policies</div>
                <div className="space-y-1.5">
                  {policies.map((p: any) => {
                    const agentName = `${p.profiles?.first_name ?? ""} ${p.profiles?.last_name ?? ""}`.trim() || "Agent";
                    const carrierName = p.carriers?.name ?? "Carrier";
                    return (
                      <div key={p.id} className="flex items-center gap-2 text-sm">
                        <TrendingUp className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="font-medium truncate max-w-[110px]">{agentName}</span>
                        <span className="text-xs text-muted-foreground truncate">{p.product ?? carrierName}</span>
                        <span className="text-xs font-medium ml-auto shrink-0">{money(Number(p.annual_premium ?? 0))}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {policies.length === 0 && newAgents.length === 0 && (
              <div className="py-4 text-sm text-muted-foreground text-center">
                No recent activity from your team.
              </div>
            )}

            <div className="pt-1">
              <Link to="/team" className="text-xs text-primary hover:underline flex items-center gap-1">
                <UserPlus className="h-3 w-3" /> Invite new agent
              </Link>
            </div>
          </>
        )}
      </CardContent>
    </Card>
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

// ── Profile Completion Banner ─────────────────────────────────────────────

const COMPLETION_ITEMS: Record<string, {
  label: string; description: string; link: string; linkLabel: string; priority: number;
}> = {
  "Name & Phone":             { label: "Name & Phone",        description: "Add your full name and phone number",                              link: "/account/producer-profile",              linkLabel: "Complete Profile",          priority: 1 },
  "Date of Birth":            { label: "Date of Birth",        description: "Required for contracting with carriers",                          link: "/account/producer-profile",              linkLabel: "Complete Profile",          priority: 2 },
  "Home Address":             { label: "Home Address",         description: "Required for E&O and carrier contracting",                        link: "/account/producer-profile",              linkLabel: "Complete Profile",          priority: 3 },
  "NPN Number":               { label: "NPN Number",           description: "Your National Producer Number — found on your state license",     link: "/account/producer-profile",              linkLabel: "Add NPN",                   priority: 4 },
  "SSN (last 4)":             { label: "SSN (last 4)",         description: "Last 4 digits of your Social Security Number",                   link: "/account/producer-profile",              linkLabel: "Complete Profile",          priority: 5 },
  "E&O Certificate":          { label: "E&O Certificate",      description: "Upload your Errors & Omissions insurance certificate",           link: "/account/producer-profile",              linkLabel: "Upload E&O",                priority: 6 },
  "Banking / Direct Deposit": { label: "Banking Information",  description: "Add your bank account for commission direct deposit",            link: "/account/producer-profile",              linkLabel: "Add Banking",               priority: 7 },
  "Driver's License":         { label: "Driver's License",     description: "Upload a copy of your driver's license",                         link: "/account/producer-profile",              linkLabel: "Upload License",            priority: 8 },
  "AML Certificate":          { label: "AML Certificate",      description: "Upload your Anti-Money Laundering training certificate",         link: "/account/producer-profile",              linkLabel: "Upload AML",                priority: 9 },
  "Background Questions":     { label: "Background Questions", description: "Complete the required producer background disclosure",            link: "/account/producer-profile",              linkLabel: "Complete",                  priority: 10 },
  "State License":            { label: "State License",        description: "Add at least one active state insurance license",                link: "/resources/state-licenses",              linkLabel: "Sync Licenses",             priority: 11 },
  "Transfer Request (carrier release)": {
    label: "Transfer Request", description: "You need to submit a carrier release from your previous upline",
    link: "/contracting/transfers", linkLabel: "Complete Transfer Request", priority: 0,
  },
};

function ProfileCompletionBanner({ pct, missing }: { pct: number; missing: string[] }) {
  const [expanded, setExpanded] = useState(pct < 50);

  const color = pct >= 80 ? "emerald" : pct >= 50 ? "amber" : "red";
  const colorCls = {
    red:     { bar: "bg-red-500",    border: "border-red-500/40",    bg: "bg-red-500/5",    text: "text-red-700 dark:text-red-400" },
    amber:   { bar: "bg-amber-500",  border: "border-amber-500/40",  bg: "bg-amber-500/5",  text: "text-amber-700 dark:text-amber-400" },
    emerald: { bar: "bg-emerald-500",border: "border-emerald-500/40",bg: "bg-emerald-500/5",text: "text-emerald-700 dark:text-emerald-400" },
  }[color];

  const sortedMissing = [...missing].sort((a, b) =>
    (COMPLETION_ITEMS[a]?.priority ?? 99) - (COMPLETION_ITEMS[b]?.priority ?? 99)
  );
  const hasTransferRequest = missing.includes("Transfer Request (carrier release)");

  return (
    <div className={cn("rounded-xl border-2 p-4 space-y-3 transition-all", colorCls.border, colorCls.bg)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {pct >= 80
            ? <CheckCircle2 className={cn("h-5 w-5 shrink-0", colorCls.text)} />
            : <AlertTriangle className={cn("h-5 w-5 shrink-0", colorCls.text)} />
          }
          <div className="flex-1 min-w-0">
            <div className={cn("font-bold text-sm", colorCls.text)}>
              {pct < 50 ? "Producer Profile Incomplete — Action Required"
               : pct < 80 ? "Almost There — Finish Your Profile"
               : "Profile Nearly Complete"}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden max-w-[200px]">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", colorCls.bar)}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={cn("text-xs font-bold shrink-0", colorCls.text)}>{pct}%</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {missing.length} item{missing.length !== 1 ? "s" : ""} remaining
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className={cn("text-xs font-medium shrink-0 flex items-center gap-1", colorCls.text)}
        >
          {expanded ? "Hide" : "Show details"}
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
      </div>

      {hasTransferRequest && (
        <div className="rounded-lg border-2 border-red-500 bg-red-50 dark:bg-red-950/30 p-3 flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-red-700 dark:text-red-400 text-sm flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              Urgent: Submit Your Transfer Request
            </div>
            <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">
              You need to complete a carrier release form before you can be fully contracted.
            </p>
          </div>
          <Link to={"/contracting/transfers" as any}>
            <Button size="sm" className="shrink-0 bg-red-600 hover:bg-red-700 text-white h-8">
              Complete Now →
            </Button>
          </Link>
        </div>
      )}

      {expanded && (
        <div className="space-y-2">
          {sortedMissing
            .filter((m) => m !== "Transfer Request (carrier release)")
            .map((item) => {
              const meta = COMPLETION_ITEMS[item];
              if (!meta) return null;
              return (
                <div key={item} className="flex items-center justify-between gap-3 py-1.5 border-b border-black/5 dark:border-white/5 last:border-0">
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{meta.label}</div>
                      <div className="text-xs text-muted-foreground">{meta.description}</div>
                    </div>
                  </div>
                  <Link to={meta.link as any}>
                    <Button size="sm" variant="outline" className="h-7 text-xs shrink-0">
                      {meta.linkLabel} →
                    </Button>
                  </Link>
                </div>
              );
            })}
        </div>
      )}

      {!expanded && !hasTransferRequest && (
        <Link to={"/account/producer-profile" as any}>
          <Button size="sm" variant="outline" className={cn("h-8 text-xs gap-1", colorCls.text)}>
            Complete Profile → {missing.length} items remaining
          </Button>
        </Link>
      )}
    </div>
  );
}
