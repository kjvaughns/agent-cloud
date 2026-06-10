import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtCurrency } from "@/lib/format";
import { getFinancesData } from "@/lib/finances.functions";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Calendar as CalendarIcon,
  TrendingUp,
  DollarSign,
  Users,
  Info,
  ChevronLeft,
  ChevronRight,
  User,
  Download,
  Clock,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/finances")({
  head: () => ({
    meta: [
      { title: "Finances — Agent Cloud" },
      { name: "description", content: "Commission earnings, payouts, and forecasting." },
    ],
  }),
  component: FinancesPage,
});

type Row = Awaited<ReturnType<typeof getFinancesData>>["rows"][number];

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function FinancesPage() {
  const fn = useServerFn(getFinancesData);
  const { data, isLoading } = useQuery({
    queryKey: ["finances"],
    queryFn: () => fn(),
  });

  const rows: Row[] = data?.rows ?? [];

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [viewMonth, setViewMonth] = useState<Date>(() => new Date());

  function shiftMonth(dir: -1 | 1) {
    setViewMonth((prev) => {
      const d = new Date(prev);
      d.setMonth(d.getMonth() + dir);
      return d;
    });
  }

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const in90 = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

  const stats = useMemo(() => {
    let todayTotal = 0, forecast90 = 0, mtd = 0, ytd = 0;
    let directYtd = 0, overridePending = 0, trailPending = 0, renewalPending = 0;
    for (const r of rows) {
      const d = new Date(r.payment_date + "T00:00:00");
      const isTrail = r.payment_type === "trail" || r.payment_type === "deferred";
      const isDirect = r.payment_type === "advance" || isTrail;
      // Treat any scheduled commission whose payment_date is today or earlier as
      // earned. status='paid' is reserved for a future settlement flow; without
      // this, every imported policy would show $0 earned.
      const isEarned = r.status === "paid" || d <= today;
      if (r.payment_date === todayStr && isEarned) todayTotal += r.amount;
      if (d >= today && d <= in90) forecast90 += r.amount;
      if (d >= startOfMonth && d <= today && isEarned) mtd += r.amount;
      if (d >= startOfYear && d <= today && isEarned) ytd += r.amount;
      if (isDirect && d >= startOfYear && d <= today && isEarned) directYtd += r.amount;
      if (r.payment_type === "override" && d > today) overridePending += r.amount;
      if (isTrail && d > today) trailPending += r.amount;
      if (r.payment_type === "renewal" && d > today) renewalPending += r.amount;
    }
    return { todayTotal, forecast90, mtd, ytd, directYtd, overridePending, trailPending, renewalPending };
  }, [rows]);

  const forecastData = useMemo(() => {
    const months: { key: string; label: string; direct: number; override: number; trail: number; renewal: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      months.push({ key: monthKey(d), label: `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`, direct: 0, override: 0, trail: 0, renewal: 0 });
    }
    const idx = new Map(months.map((m, i) => [m.key, i]));
    for (const r of rows) {
      const d = new Date(r.payment_date + "T00:00:00");
      const k = monthKey(d);
      const i = idx.get(k);
      if (i === undefined) continue;
      if (r.payment_type === "override") months[i].override += r.amount;
      else if (r.payment_type === "renewal") months[i].renewal += r.amount;
      else if (r.payment_type === "trail" || r.payment_type === "deferred") months[i].trail += r.amount;
      else months[i].direct += r.amount;
    }
    return months;
  }, [rows]);

  const monthRows = useMemo(() => {
    const ym = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, "0")}`;
    return rows.filter((r) => {
      if (!r.payment_date.startsWith(ym)) return false;
      if (typeFilter === "all") return true;
      if (typeFilter === "trail") return r.payment_type === "trail" || r.payment_type === "deferred";
      return r.payment_type === typeFilter;
    });
  }, [rows, viewMonth, typeFilter]);

  const monthTotal = useMemo(() => monthRows.reduce((s, r) => s + r.amount, 0), [monthRows]);

  const groupedByDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of monthRows) {
      const day = r.payment_date.slice(0, 10);
      if (!m.has(day)) m.set(day, []);
      m.get(day)!.push(r);
    }
    return new Map([...m.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }, [monthRows]);

  const byCarrier = useMemo(() => {
    const m = new Map<string, { name: string; policies: Set<string>; direct: number; override: number; trail: number; renewal: number }>();
    for (const r of rows) {
      const k = r.carrier ?? "Unknown";
      if (!m.has(k)) m.set(k, { name: k, policies: new Set(), direct: 0, override: 0, trail: 0, renewal: 0 });
      const e = m.get(k)!;
      e.policies.add(r.policy_id);
      if (r.payment_type === "override") e.override += r.amount;
      else if (r.payment_type === "renewal") e.renewal += r.amount;
      else if (r.payment_type === "trail" || r.payment_type === "deferred") e.trail += r.amount;
      else e.direct += r.amount;
    }
    return Array.from(m.values())
      .map((e) => ({ name: e.name, count: e.policies.size, direct: e.direct, override: e.override, trail: e.trail, renewal: e.renewal, total: e.direct + e.override + e.trail + e.renewal }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  const byProduct = useMemo(() => {
    const m = new Map<string, { name: string; policies: Set<string>; total: number }>();
    for (const r of rows) {
      const k = r.product ?? "Unknown";
      if (!m.has(k)) m.set(k, { name: k, policies: new Set(), total: 0 });
      const e = m.get(k)!;
      e.policies.add(r.policy_id);
      e.total += r.amount;
    }
    return Array.from(m.values())
      .map((e) => ({ name: e.name, count: e.policies.size, total: e.total, avg: e.total / Math.max(1, e.policies.size) }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const hasData = rows.length > 0;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Finances</h1>
        <p className="text-sm text-muted-foreground">Financial analytics &amp; forecasting</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile
          icon={<CalendarIcon className="h-4 w-4 text-muted-foreground" />}
          label="Today"
          value={fmtCurrency(stats.todayTotal)}
          sub={today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          zeroIsRed
        />
        <KpiTile
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          label="Forecast 90-Day"
          value={fmtCurrency(stats.forecast90)}
          sub="Expected next 90 days"
          valueClass="text-emerald-600"
        />
        <KpiTile
          label="Month-to-Date (MTD)"
          value={fmtCurrency(stats.mtd)}
          sub={today.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        />
        <KpiTile
          label="Year-to-Date (YTD)"
          value={fmtCurrency(stats.ytd)}
          sub={`Since Jan 1, ${today.getFullYear()}`}
        />
      </div>

      {/* Commission type breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-[#C9A227]">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <DollarSign className="h-3.5 w-3.5 text-[#C9A227]" /> Direct YTD
            </div>
            <div className="text-xl font-bold mt-1">{fmtCurrency(stats.directYtd)}</div>
            <p className="text-xs text-muted-foreground">Advance + trail paid</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5 text-emerald-500" /> Override Pending
            </div>
            <div className="text-xl font-bold mt-1">{fmtCurrency(stats.overridePending)}</div>
            <p className="text-xs text-muted-foreground">From downline production</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 text-purple-500" /> Trail Pending
            </div>
            <div className="text-xl font-bold mt-1">{fmtCurrency(stats.trailPending)}</div>
            <p className="text-xs text-muted-foreground">Months 10–12 deferred</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-sky-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5 text-sky-500" /> Renewal Pending
            </div>
            <div className="text-xl font-bold mt-1">{fmtCurrency(stats.renewalPending)}</div>
            <p className="text-xs text-muted-foreground">Years 2+ renewals</p>
          </CardContent>
        </Card>
      </div>

      {/* Forecast chart */}
      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold mb-3">12-month rolling forecast</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={forecastData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
              <Tooltip
                contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                formatter={(v: number) => fmtCurrency(v)}
              />
              <Legend />
              <Line type="monotone" dataKey="direct" stroke="#C9A227" strokeWidth={2} name="Direct" dot={false} />
              <Line type="monotone" dataKey="override" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" name="Override" dot={false} />
              <Line type="monotone" dataKey="trail" stroke="#a855f7" strokeWidth={2} strokeDasharray="3 3" name="Trail" dot={false} />
              <Line type="monotone" dataKey="renewal" stroke="#0ea5e9" strokeWidth={1.5} strokeDasharray="4 4" name="Renewal" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* How payouts are calculated */}
      <Card>
        <CardContent className="p-2">
          <Accordion type="single" collapsible>
            <AccordionItem value="how" className="border-0">
              <AccordionTrigger className="px-3">
                <span className="flex items-center gap-2 font-semibold text-sm">
                  <Info className="h-4 w-4" /> How payouts are calculated
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-3 space-y-4 text-sm">
                <section>
                  <h4 className="font-semibold mb-1">Standard Products (most carriers)</h4>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                    <li>75% of first-year commission is paid on the effective date (advance)</li>
                    <li>Remaining 25% is split equally across months 10, 11, and 12 (trail)</li>
                  </ul>
                  <pre className="mt-2 bg-muted/50 p-3 rounded text-xs overflow-x-auto">{`Annual Premium: $1,200
Agent Commission Level: 80%
Total Year 1: $1,200 × 80% = $960
Advance: $960 × 75% = $720
Month 10/11/12 (trail): $960 × 25% / 3 = $80 each`}</pre>
                </section>
                <section>
                  <h4 className="font-semibold mb-1">GTL (Group Term Life) Exception</h4>
                  <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                    <li>Advance = 50% of first-year commission, capped at $600</li>
                    <li>Balance split equally across months 7–12 (trail)</li>
                  </ul>
                  <pre className="mt-2 bg-muted/50 p-3 rounded text-xs overflow-x-auto">{`Total Year 1: $900
Advance: MIN($900 × 50%, $600) = $450
Balance: $900 - $450 = $450
Months 7-12 (trail): $450 / 6 = $75/month`}</pre>
                </section>
                <section>
                  <h4 className="font-semibold mb-1">Override Commissions</h4>
                  <p className="text-muted-foreground">
                    Override = Downline annual premium × (Your level % − Direct downline's level %).
                    You at 80%, downline at 70% → you earn 10% override. Same 75/25 advance/trail split applies.
                  </p>
                </section>
                <section>
                  <h4 className="font-semibold mb-1">Renewals</h4>
                  <p className="text-muted-foreground">
                    Renewal commissions are paid at the start of policy years 2–5 and 6–10, at the rate
                    specified in your commission grid for each carrier.
                  </p>
                </section>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Scheduled payouts */}
      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Scheduled Payouts</h3>
                <p className="text-xs text-muted-foreground">Your upcoming and past commission payments</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const cols = ["date", "client", "carrier", "product", "policy_number", "type", "commission_pct", "amount", "status"];
                  const lines = [cols.join(","), ...monthRows.map((r) =>
                    [r.payment_date, `"${r.client_name}"`, r.carrier ?? "", r.product ?? "", r.policy_number ?? "", r.payment_type, r.commission_pct ?? "", r.amount, r.status].join(",")
                  )];
                  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `payouts-${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, "0")}.csv`;
                  a.click();
                }}
              >
                <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
              </Button>
            </div>

            {/* Month navigator */}
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => shiftMonth(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-28 text-center">
                {viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => shiftMonth(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 ml-2">{fmtCurrency(monthTotal)}</span>
            </div>

            <div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="advance">Advance</SelectItem>
                  <SelectItem value="trail">Trail (deferred)</SelectItem>
                  <SelectItem value="override">Override</SelectItem>
                  <SelectItem value="renewal">Renewal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!hasData ? (
            <EmptyState
              title="No commission payments scheduled yet"
              body="Post your first deal to see your payout schedule here."
              cta={<Button asChild><Link to="/post-deal">Post a Deal</Link></Button>}
            />
          ) : groupedByDay.size === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No payments for this month.</div>
          ) : (
            <Accordion type="multiple" className="divide-y">
              {Array.from(groupedByDay.entries()).map(([day, dayRows]) => {
                const dayTotal = dayRows.reduce((s, r) => s + r.amount, 0);
                const d = new Date(day + "T00:00:00");
                const monthAbbr = d.toLocaleDateString("en-US", { month: "short" });
                const dayNum = d.getDate();
                const fullDate = d.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" });
                return (
                  <AccordionItem key={day} value={day} className="border-0">
                    <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary shrink-0 flex-col leading-tight">
                          <span className="text-[10px] font-semibold uppercase">{monthAbbr}</span>
                          <span className="text-lg font-bold leading-none">{dayNum}</span>
                        </div>
                        <div className="text-left flex-1 min-w-0">
                          <div className="font-medium text-sm">{fullDate}</div>
                          <div className="text-xs text-muted-foreground">{dayRows.length} payment{dayRows.length !== 1 ? "s" : ""}</div>
                        </div>
                        <div className="text-sm font-semibold text-right mr-2">{fmtCurrency(dayTotal)}</div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-3 pt-0 space-y-2">
                      {dayRows.map((r) => <PayoutRow key={r.id} row={r} />)}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Breakdown tabs */}
      <Card>
        <CardContent className="p-4">
          <Tabs defaultValue="carrier">
            <TabsList className="overflow-x-auto flex-nowrap w-full justify-start">
              <TabsTrigger value="carrier">By Carrier</TabsTrigger>
              <TabsTrigger value="product">By Product</TabsTrigger>
              <TabsTrigger value="month">By Month</TabsTrigger>
              <TabsTrigger value="overrides" className="whitespace-nowrap">By Agent (Overrides)</TabsTrigger>
            </TabsList>

            <TabsContent value="carrier" className="space-y-4 pt-4">
              {byCarrier.length === 0 ? (
                <EmptyState title="No carrier data yet" body="Post a deal to see commissions break down by carrier." />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={byCarrier} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis type="number" tickFormatter={(v) => `$${Math.round(v / 1000)}k`} stroke="var(--color-muted-foreground)" fontSize={12} />
                      <YAxis type="category" dataKey="name" width={120} stroke="var(--color-muted-foreground)" fontSize={12} />
                      <Tooltip formatter={(v: number) => fmtCurrency(v)} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                      <Bar dataKey="total" fill="#C9A227" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <Table>
                    <TableHeader><TableRow><TableHead>Carrier</TableHead><TableHead className="text-right"># Policies</TableHead><TableHead className="text-right">Direct</TableHead><TableHead className="text-right">Trail</TableHead><TableHead className="text-right">Override</TableHead><TableHead className="text-right">Renewal</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                    <TableBody>{byCarrier.map((c) => (
                      <TableRow key={c.name}><TableCell>{c.name}</TableCell><TableCell className="text-right">{c.count}</TableCell><TableCell className="text-right font-mono">{fmtCurrency(c.direct)}</TableCell><TableCell className="text-right font-mono">{fmtCurrency(c.trail)}</TableCell><TableCell className="text-right font-mono">{fmtCurrency(c.override)}</TableCell><TableCell className="text-right font-mono">{fmtCurrency(c.renewal)}</TableCell><TableCell className="text-right font-mono font-semibold">{fmtCurrency(c.total)}</TableCell></TableRow>
                    ))}</TableBody>
                  </Table>
                </>
              )}
            </TabsContent>

            <TabsContent value="product" className="pt-4">
              {byProduct.length === 0 ? (
                <EmptyState title="No product data yet" body="Once you post deals, products will appear here." />
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right"># Policies</TableHead><TableHead className="text-right">Avg Premium</TableHead><TableHead className="text-right">Total Commission</TableHead></TableRow></TableHeader>
                  <TableBody>{byProduct.map((p) => (
                    <TableRow key={p.name}><TableCell>{p.name}</TableCell><TableCell className="text-right">{p.count}</TableCell><TableCell className="text-right font-mono">{fmtCurrency(p.avg)}</TableCell><TableCell className="text-right font-mono font-semibold">{fmtCurrency(p.total)}</TableCell></TableRow>
                  ))}</TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="month" className="space-y-4 pt-4">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={forecastData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: number) => fmtCurrency(v)} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                  <Area type="monotone" dataKey="direct" stackId="1" stroke="#C9A227" fill="#C9A227" fillOpacity={0.3} name="Direct" />
                  <Area type="monotone" dataKey="trail" stackId="1" stroke="#a855f7" fill="#a855f7" fillOpacity={0.3} name="Trail" />
                  <Area type="monotone" dataKey="override" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Override" />
                  <Area type="monotone" dataKey="renewal" stackId="1" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.3} name="Renewal" />
                </AreaChart>
              </ResponsiveContainer>
              <Table>
                <TableHeader><TableRow><TableHead>Month</TableHead><TableHead className="text-right">Direct</TableHead><TableHead className="text-right">Trail</TableHead><TableHead className="text-right">Override</TableHead><TableHead className="text-right">Renewal</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>{forecastData.map((m) => (
                  <TableRow key={m.key}><TableCell>{m.label}</TableCell><TableCell className="text-right font-mono">{fmtCurrency(m.direct)}</TableCell><TableCell className="text-right font-mono">{fmtCurrency(m.trail)}</TableCell><TableCell className="text-right font-mono">{fmtCurrency(m.override)}</TableCell><TableCell className="text-right font-mono">{fmtCurrency(m.renewal)}</TableCell><TableCell className="text-right font-mono font-semibold">{fmtCurrency(m.direct + m.trail + m.override + m.renewal)}</TableCell></TableRow>
                ))}</TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="overrides" className="pt-4">
              <EmptyState
                title="No override commissions yet"
                body="Grow your downline to start earning override income."
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiTile({
  icon, label, value, sub, valueClass, zeroIsRed,
}: { icon?: React.ReactNode; label: string; value: string; sub?: string; valueClass?: string; zeroIsRed?: boolean }) {
  const isZero = value.includes("0.00") || value === "$0";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          {icon}
        </div>
        <div className={`text-2xl font-bold mt-1 ${valueClass ?? ""} ${zeroIsRed && isZero ? "text-rose-500" : ""}`}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function TypeBadge({ type }: { type: string }) {
  const cls: Record<string, string> = {
    advance: "bg-[#C9A227]/15 text-[#AD8819] border-[#C9A227]/30",
    trail: "bg-purple-500/15 text-purple-600 border-purple-500/30",
    deferred: "bg-purple-500/15 text-purple-600 border-purple-500/30",
    override: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    renewal: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  };
  const label = type === "deferred" ? "trail" : type;
  return <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${cls[type] ?? "bg-muted"}`}>{label}</span>;
}

function PayoutRow({ row }: { row: Row }) {
  const isOverride = row.payment_type === "override";
  return (
    <div className={`rounded-lg border p-3 space-y-1 text-sm ${isOverride ? "bg-primary/5" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {isOverride ? <Users className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
          <span className="font-medium text-foreground">{row.client_name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <TypeBadge type={row.payment_type} />
          <StatusBadge status={row.status} />
          <span className="font-mono font-semibold">{fmtCurrency(row.amount)}</span>
        </div>
      </div>
      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
        {row.carrier && <span>{row.carrier}</span>}
        {row.product && <span>{row.product}</span>}
        {row.policy_number && <span className="font-mono">{row.policy_number}</span>}
        {row.commission_pct != null && <span>{row.commission_pct}%</span>}
        {row.policy_year != null && row.policy_year > 1 && <span>Yr {row.policy_year}</span>}
        {isOverride && row.writing_agent_name && <span>via {row.writing_agent_name}</span>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "paid"
    ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
    : "bg-amber-500/15 text-amber-600 border-amber-500/30";
  return <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${cls}`}>{status}</span>;
}

function EmptyState({ title, body, cta }: { title: string; body: string; cta?: React.ReactNode }) {
  return (
    <div className="p-10 text-center space-y-2">
      <h4 className="font-semibold">{title}</h4>
      <p className="text-sm text-muted-foreground">{body}</p>
      {cta && <div className="pt-2">{cta}</div>}
    </div>
  );
}
