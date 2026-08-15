import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import {
  AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
  PieChart, Pie, Cell,
} from "recharts";
import { DollarSign, Users, FileText, FolderOpen, ArrowRight, AlertTriangle, CheckCircle2, ChevronRight, UserPlus, Bell, TrendingUp, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { money, number } from "@/lib/format";
import { POLICY_STATUSES } from "@/lib/policy-status";
import { getDashboardMetrics, getAgencyFeed, getDashboardHero, getCommissionSummary, getAtRiskPolicies, getLeaderboardData, setMonthlyGoal, getProductionSeries } from "@/lib/dashboard.functions";
import { sendAgentReminder } from "@/lib/team.functions";
import { AiDailyBriefing } from "@/components/ai/daily-briefing";
import { WorkQueue } from "@/components/work-queue";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PageShell, Panel } from "@/components/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { LinkAction } from "@/components/ui/section-label";
import { Icon } from "@/components/ui/icon";
import { SmoothAreaChart } from "@/components/ui/area-chart";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { NovaRail } from "@/components/nova-rail";
import { PendingAgentNotice } from "@/components/pending-agent-notice";
import { MyOnboarding } from "@/components/onboarding/my-onboarding";
import { useTheme } from "@/hooks/use-theme";
import { useMyAccess } from "@/hooks/use-my-access";
import { audienceFor } from "@/lib/navigation";
import { StaffDashboard } from "@/components/staff-dashboard";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Agent Cloud" }] }),
  component: DashboardRoute,
});

/**
 * Who this dashboard is for.
 *
 * Everything in `Dashboard` below — the production goal, the leaderboard, the
 * commission tiles, "get ready to sell" — answers questions a producer has
 * about their own book. Back-office staff have no book, so every panel reads
 * as either zero or somebody else's job, and login sent them here anyway.
 *
 * They get their own home rather than a redirect. A redirect works, but it
 * means /dashboard is a page staff can never see and the sidebar has no Home
 * row for them — the app quietly has a hole where its front door should be.
 * Two dashboards behind one route is the smaller cost.
 *
 * The branch sits in the component rather than `beforeLoad` on purpose: it
 * covers every way in — the login form, the OAuth callback, an old bookmark —
 * from one place, and reuses the access query the app has already cached
 * instead of adding a role fetch to the router.
 */
function DashboardRoute() {
  const { access, loading } = useMyAccess();

  if (loading) {
    return (
      <PageShell>
        <Skeleton className="h-64 rounded-xl" />
      </PageShell>
    );
  }

  if (audienceFor({ role: access?.role ?? null }) === "staff") {
    return <StaffDashboard />;
  }

  return <Dashboard />;
}

/**
 * Period presets. All are "to date" — week means week-to-date, quarter means
 * quarter-to-date — so every option reads consistently against the Month
 * default rather than mixing rolling windows with calendar periods.
 */
const RANGES: { value: string; label: string }[] = [
  { value: "today",   label: "Today" },
  { value: "week",    label: "This Week" },
  { value: "month",   label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "year",    label: "This Year" },
];

function rangeBounds(range: string, custom: { from: string; to: string } | null) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (range === "__custom" && custom?.from && custom?.to) {
    const from = new Date(custom.from + "T00:00:00");
    // Inclusive of the chosen end date.
    const to = new Date(custom.to + "T23:59:59.999");
    return {
      start: from,
      end: to,
      label: `${from.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${to.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      headline: "Production",
    };
  }

  switch (range) {
    case "today":
      return { start: startOfToday, end: now, label: "Today", headline: "Today's ALP" };
    case "week": {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - d.getDay());
      return { start: d, end: now, label: "This Week", headline: "Week-to-date ALP" };
    }
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3) * 3;
      return { start: new Date(now.getFullYear(), q, 1), end: now, label: "This Quarter", headline: "Quarter-to-date ALP" };
    }
    case "year":
      return { start: new Date(now.getFullYear(), 0, 1), end: now, label: "This Year", headline: "Year-to-date ALP" };
    case "month":
    default:
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, label: "This Month", headline: "Month-to-date ALP" };
  }
}

function Dashboard() {
  const [range, setRange] = useState("month");
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [metric, setMetric] = useState<"prod" | "policies">("prod");
  const [view, setView] = useState<"personal" | "agency">("personal");

  const { rangeStart, rangeEnd, rangeLabel, rangeHeadline } = useMemo(() => {
    const b = rangeBounds(range, custom);
    return {
      rangeStart: b.start.toISOString(),
      rangeEnd: b.end.toISOString(),
      rangeLabel: b.label,
      rangeHeadline: b.headline,
    };
  }, [range, custom]);

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

  // Chart series for the selected period, so the line always matches the
  // numbers above it.
  const fetchSeries = useServerFn(getProductionSeries);
  const { data: seriesData, isLoading: seriesLoading } = useQuery({
    queryKey: ["dashboard-series", rangeStart, rangeEnd],
    queryFn: () => fetchSeries({ data: { rangeStart, rangeEnd } }),
    staleTime: 60_000,
  });

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

  // The producer-profile completion query went with the banner it fed. The
  // onboarding panel derives its own steps, so this was a request on every
  // dashboard load whose only consumer no longer exists.

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
      {/* The "Producer Profile Incomplete" banner used to sit here, listing
          five outstanding items above a checklist answering the same question
          one step at a time. The two disagreed — 40% and five items remaining
          against four of six — and named different next actions, which is
          worse than merely repeating each other. Its items are steps in the
          checklist below now. */}
      {/* A nudge to finish the producer profile, shown until it is complete or
          dismissed. Nothing waits on it — it is where the details carriers ask
          for are kept, so they are typed once. */}
      <div className="mb-[var(--gap)] empty:mb-0"><PendingAgentNotice /></div>
      {/* And the agent's own path to selling. A new agent's first question is
          "what do I do now"; this answers it with one step rather than five
          pages, and disappears once they are ready. */}
      <div className="mb-[var(--gap)] empty:mb-0"><MyOnboarding /></div>
      {/* Actions first, scoreboard second. The numbers below say how the
          agency is doing; this says what to do about it, and that is the
          question somebody actually has when they open the app. */}
      <div className="mb-[var(--gap)]"><WorkQueue /></div>

      <div className={cn("cgrid", !novaRail && "nonova")}>
        <div className="col">
          <HeroPanel
            hero={hero}
            metrics={data}
            series={seriesData?.series ?? []}
            seriesLoading={seriesLoading}
            range={range}
            setRange={setRange}
            onCustom={(from, to) => setCustom({ from, to })}
            rangeLabel={rangeLabel}
            rangeHeadline={rangeHeadline}
          />

          <div className="duo">
            <LeaderboardPanel leaders={leaders} rangeLabel={rangeLabel} />
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

function GoalEditor({ goal, isDefault }: { goal: number; isDefault: boolean }) {
  const qc = useQueryClient();
  const goalFn = useServerFn(setMonthlyGoal);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(goal));
  const save = useMutation({
    mutationFn: (g: number) => goalFn({ data: { goal: g } }),
    onSuccess: () => {
      toast.success("Monthly goal updated");
      qc.invalidateQueries({ queryKey: ["dashboard-hero"] });
      setEditing(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't save goal"),
  });
  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") { const g = Number(value); if (g > 0) save.mutate(g); }
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-20 h-5 px-1 text-[11.5px] tnum rounded border border-primary/50 bg-background outline-none"
          aria-label="Monthly ALP goal"
        />
        <button
          className="text-[10.5px] font-semibold text-primary"
          disabled={save.isPending}
          onClick={() => { const g = Number(value); if (g > 0) save.mutate(g); }}
        >
          {save.isPending ? "…" : "Save"}
        </button>
      </span>
    );
  }
  return (
    <button
      onClick={() => { setValue(String(goal)); setEditing(true); }}
      className="underline decoration-dotted underline-offset-2 hover:text-gold-bright transition-colors"
      title={isDefault ? "Default goal — click to set your own" : "Click to edit your monthly goal"}
    >
      {money(goal)}{isDefault ? " (set yours)" : ""}
    </button>
  );
}

/**
 * Hero band.
 *
 * The four tiles come from get_dashboard_metrics, which is already scoped to
 * the selected period, so changing the range moves every number here — the
 * previous version read fixed today/week/MTD fields that ignored the picker.
 *
 * The RPC reports team_prod and team_policies as downline-only, so the totals
 * here add the caller's own back in — "Total" means the whole agency.
 */
function HeroPanel({
  hero, metrics, series, seriesLoading, range, setRange, onCustom, rangeLabel, rangeHeadline,
}: {
  hero: any;
  metrics: any;
  series: { label: string; personal: number; team: number }[];
  seriesLoading: boolean;
  range: string;
  setRange: (v: string) => void;
  onCustom: (from: string, to: string) => void;
  rangeLabel: string;
  rangeHeadline: string;
}) {
  const myProd = Number(metrics?.my_prod ?? 0);
  const myPolicies = Number(metrics?.my_policies ?? 0);

  // The RPC reports team_prod and team_policies as downline-only — both are
  // filtered on NOT is_mine (20260610030000_fix_dashboard_team_prod). "Total"
  // means the whole agency, so the caller's own numbers are added back in.
  const totalProd = myProd + Number(metrics?.team_prod ?? 0);
  const totalPolicies = myPolicies + Number(metrics?.team_policies ?? 0);

  const kpis = [
    { label: "Personal Production", value: money(myProd), delta: rangeLabel },
    { label: "Total Production (Team)", value: money(totalProd), delta: "you + downline" },
    { label: "Total Policies (Personal)", value: number(myPolicies), delta: rangeLabel },
    { label: "Total Policies (Team)", value: number(totalPolicies), delta: "you + downline" },
  ];

  // Cumulative personal ALP across the period — the running total reads better
  // than per-bucket spikes at every range width.
  const chart = (() => {
    let running = 0;
    const pts = series.map((p) => (running += p.personal));
    return pts.length >= 2 ? pts : [0, ...pts];
  })();

  // The goal is a monthly target, so it is only meaningful on the month view.
  const showGoal = range === "month";

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
              <StatTile label={k.label} value={k.value} delta={k.delta} />
            </div>
          ))}
        </div>

        <div className="min-w-0" style={{ padding: "var(--pad)" }}>
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <div
                className="font-display text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {rangeHeadline}
              </div>
              <div className="flex items-baseline gap-3 mt-1.5 flex-wrap">
                <div
                  className="tnum font-display font-bold leading-none text-gold-bright"
                  style={{ fontFamily: "var(--font-display)", fontSize: "clamp(34px,4.5vw,46px)", letterSpacing: "-0.02em" }}
                >
                  {money(myProd)}
                </div>
                {showGoal && hero?.mtdDeltaPct != null && (
                  <div
                    className={cn(
                      "inline-flex items-center gap-1 text-[12.5px] font-semibold rounded-full px-2 py-0.5",
                      hero.mtdDeltaPct >= 0 ? "text-success" : "text-destructive",
                    )}
                    style={{ background: hero.mtdDeltaPct >= 0 ? "rgba(69,185,104,.12)" : "rgba(239,83,80,.12)" }}
                    title="vs prior month, same day"
                  >
                    <Icon name={hero.mtdDeltaPct >= 0 ? "up" : "down"} size={13} /> {pctStr(hero.mtdDeltaPct)}
                  </div>
                )}
              </div>

              {showGoal ? (
                <div className="text-[11.5px] text-muted-foreground mt-1.5">
                  Goal <GoalEditor goal={hero?.mtdGoal ?? 25000} isDefault={!!hero?.goalIsDefault} /> ·{" "}
                  <span className="text-foreground">{hero?.mtdPct ?? 0}% there</span> · {hero?.daysLeft ?? 0} days left
                </div>
              ) : (
                <div className="text-[11.5px] text-muted-foreground mt-1.5">
                  {rangeLabel} · <span className="text-foreground tnum">{number(myPolicies)}</span>{" "}
                  polic{myPolicies === 1 ? "y" : "ies"} ·{" "}
                  <span className="text-foreground tnum">
                    {money(myPolicies > 0 ? myProd / myPolicies : 0)}
                  </span>{" "}
                  avg
                </div>
              )}
            </div>

            <DateRangePicker
              options={RANGES}
              value={range}
              onChange={setRange}
              onCustom={onCustom}
            />
          </div>

          <div className="mt-3.5">
            {seriesLoading ? <Skeleton className="h-[120px]" /> : <SmoothAreaChart data={chart} />}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function LeaderboardPanel({ leaders, rangeLabel }: { leaders: any; rangeLabel: string }) {
  const agents: any[] = (leaders?.agents ?? []).slice(0, 5);
  const selfId = leaders?.selfId;
  return (
    <Panel title="Leaderboard" action={<span className="text-[10.5px] text-muted-foreground">{rangeLabel} ALP</span>}>
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
    { label: "Trail + Renewal", value: money(c?.trail ?? 0), sub: "this month", neg: false },
    { label: "Override", value: money(c?.override ?? 0), sub: "downline · this month", neg: false },
    { label: "Chargebacks", value: money(c?.chargebacks ?? 0), sub: `${c?.chargebackCount ?? 0} this month`, neg: (c?.chargebacks ?? 0) < 0 },
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
    // Real completion from agent_completion (profile fields + E&O/banking/DL/AML docs)
    const pct = Math.min(100, Math.max(0, Number(a.completion_pct ?? 0)));
    const status = pct >= 100 ? "Ready to contract" : a.missing?.length ? `Missing ${a.missing[0]}` : "In progress";
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
                <a href="/retention" className="text-[10.5px] font-semibold text-primary whitespace-nowrap">Work it →</a>
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
          { label: "Summarize this week", onClick: () => navigate({ to: "/reports" }) },
        ]}
      />
    </aside>
  );
}

// ── Agency Widgets ───────────────────────────────────────────────────────────

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
            <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
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
                      <Badge variant="outline" className="text-[10px] py-0 h-4 text-success border-success/30 bg-success/10">New Agent</Badge>
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
