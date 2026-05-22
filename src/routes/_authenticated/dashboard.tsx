import { createFileRoute } from "@tanstack/react-router";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { DollarSign, FileCheck2, Users2, TrendingUp, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/kpi-card";
import { StatusBadge } from "@/components/status-badge";
import { money, number } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Agent Cloud" }] }),
  component: Dashboard,
});

const chartData = [
  { m: "Jan", ap: 18400, policies: 12 },
  { m: "Feb", ap: 22100, policies: 15 },
  { m: "Mar", ap: 28950, policies: 19 },
  { m: "Apr", ap: 24300, policies: 17 },
  { m: "May", ap: 33850, policies: 22 },
  { m: "Jun", ap: 41200, policies: 28 },
  { m: "Jul", ap: 38600, policies: 26 },
  { m: "Aug", ap: 47900, policies: 31 },
  { m: "Sep", ap: 52100, policies: 34 },
];

const statusCounts: { label: string; value: number; key: string }[] = [
  { label: "Active", value: 142, key: "active" },
  { label: "In Review", value: 18, key: "in_review" },
  { label: "Lapse Pending", value: 6, key: "lapse_pending" },
  { label: "Lapsed", value: 11, key: "lapsed" },
  { label: "Cancelled", value: 4, key: "cancelled" },
  { label: "Withdrawn", value: 2, key: "withdrawn" },
  { label: "Not Taken", value: 3, key: "not_taken" },
  { label: "Postponed", value: 5, key: "postponed" },
];

function Dashboard() {
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Here's how your book is performing this month.</p>
        </div>
        <Tabs defaultValue="month">
          <TabsList>
            <TabsTrigger value="week">7d</TabsTrigger>
            <TabsTrigger value="month">30d</TabsTrigger>
            <TabsTrigger value="quarter">QTD</TabsTrigger>
            <TabsTrigger value="ytd">YTD</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Annual Premium" value={money(287_350)} delta={12.4} icon={DollarSign} hint="vs last period" />
        <KpiCard label="Policies Issued" value={number(34)} delta={8.1} icon={FileCheck2} hint="vs last period" />
        <KpiCard label="New Clients" value={number(58)} delta={-3.2} icon={Users2} hint="vs last period" />
        <KpiCard label="Conversion" value="24.6%" delta={2.7} icon={TrendingUp} hint="vs last period" />
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Annual Premium Trend</CardTitle>
            <Button variant="outline" size="sm">Export</Button>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ left: 4, right: 12, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ap" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => money(v)} />
                  <Area type="monotone" dataKey="ap" stroke="var(--color-primary)" strokeWidth={2} fill="url(#ap)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Enrollment Tracker</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Monthly Goal</span>
                <span className="font-medium">{money(287_350)} / {money(400_000)}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: "72%" }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">72% to goal — keep going.</p>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Policies</span>
                <span className="font-medium">34 / 50</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-success" style={{ width: "68%" }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Activations</span>
                <span className="font-medium">12 / 20</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-warning" style={{ width: "60%" }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Policy Status</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {statusCounts.map((s) => (
                <div key={s.key} className="rounded-lg border p-3">
                  <div className="text-2xl font-bold">{s.value}</div>
                  <div className="mt-2"><StatusBadge status={s.key} /></div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle>Sophai Insights</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-md border-l-4 border-primary bg-primary/5 p-3">
              <p className="font-medium">Hot lead waiting</p>
              <p className="text-muted-foreground text-xs mt-1">Maria Chen hasn't been contacted in 3 days — last quote: $48/mo IUL.</p>
            </div>
            <div className="rounded-md border-l-4 border-warning bg-warning/5 p-3">
              <p className="font-medium">6 lapse-pending policies</p>
              <p className="text-muted-foreground text-xs mt-1">Send a payment reminder before the 15th.</p>
            </div>
            <div className="rounded-md border-l-4 border-success bg-success/5 p-3">
              <p className="font-medium">You're 28% above last September</p>
              <p className="text-muted-foreground text-xs mt-1">Carrier mix is healthier — keep IUL momentum.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
