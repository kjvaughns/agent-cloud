import { createFileRoute, Link } from "@tanstack/react-router";
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
import { getDashboardMetrics, getAgencyFeed } from "@/lib/dashboard.functions";
import { getProducerProfile } from "@/lib/account.functions";
import { sendAgentReminder } from "@/lib/team.functions";
import { AiDailyBriefing } from "@/components/ai/daily-briefing";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
    enabled: view === "agency",
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

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto">
      {pct < 100 && pct > 0 && (
        <ProfileCompletionBanner pct={pct} missing={missing} />
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold font-heading tracking-wide">Dashboard</h1>
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

      {/* Time range filter + view toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {RANGES.map((r) => (
            <Button key={r.value} size="sm" variant={range === r.value ? "default" : "outline"} onClick={() => setRange(r.value)}>
              {r.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          <Button size="sm" variant={view === "personal" ? "default" : "outline"} onClick={() => setView("personal")}>My View</Button>
          <Button size="sm" variant={view === "agency" ? "default" : "outline"} onClick={() => setView("agency")}>Agency View</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {view === "personal" ? (
          <>
            <KpiTile icon={DollarSign} color="text-primary" label="Individual Production (You)" value={money(data?.my_prod ?? 0)} sub={rangeLabel} loading={isLoading} />
            <KpiTile icon={Users} color="text-emerald-500" label="Total Production (Team)" value={money(data?.team_prod ?? 0)} sub={rangeLabel} loading={isLoading} />
            <KpiTile icon={FileText} color="text-primary" label="My Policies" value={number(data?.my_policies ?? 0)} sub={rangeLabel} loading={isLoading} />
            <KpiTile icon={FolderOpen} color="text-emerald-500" label="Team Policies" value={number(data?.team_policies ?? 0)} sub={rangeLabel} loading={isLoading} />
          </>
        ) : (
          <>
            <KpiTile icon={DollarSign} color="text-primary" label="Total Agency Production" value={money(data?.team_prod ?? 0)} sub={rangeLabel} loading={isLoading} />
            <KpiTile icon={Users} color="text-emerald-500" label="Active Writers" value={number(data?.active_downline ?? 0)} sub="agents ready to sell" loading={isLoading} />
            <KpiTile icon={FileText} color="text-primary" label="Total Agency Policies" value={number(data?.team_policies ?? 0)} sub={rangeLabel} loading={isLoading} />
            <KpiTile icon={FolderOpen} color="text-emerald-500" label="Active Contracts" value={number(data?.active_contracts ?? 0)} sub="across all carriers" loading={isLoading} />
          </>
        )}
      </div>

      {/* Agency Command Center — only in agency view */}
      {view === "agency" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ActivationQueueWidget feed={agencyFeed} loading={agencyFeedLoading} />
          <TeamActivityFeed feed={agencyFeed} loading={agencyFeedLoading} />
        </div>
      )}

      {/* Production trend */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <CardTitle>Production Trend</CardTitle>
            <div className="flex items-center gap-4">
              <div className="text-xs text-right space-y-0.5">
                {view === "personal" && (
                  <div><span className="inline-block h-2 w-2 rounded-full bg-primary mr-1" />Individual: {metric === "prod" ? money(sumRange(recent, "my_prod")) : number(recent.reduce((a, t) => a + Number(t.my_policies), 0))} <span className={indDelta >= 0 ? "text-emerald-600" : "text-red-600"}>{indDelta >= 0 ? "↑" : "↓"} {Math.abs(indDelta).toFixed(0)}%</span></div>
                )}
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
                  <linearGradient id="indGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} /></linearGradient>
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
                {view === "personal" && (
                  <Area type="monotone" dataKey="individual" stroke="var(--color-primary)" strokeWidth={2} fill="url(#indGrad)" />
                )}
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

      <AiDailyBriefing />
    </div>
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
