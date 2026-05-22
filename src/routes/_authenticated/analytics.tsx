import { createFileRoute } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { fmtCurrency } from "@/lib/format";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { Trophy, Target, TrendingUp, Sparkles, Award, Flame } from "lucide-react";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [
    { title: "Analytics — Agent Cloud" },
    { name: "description", content: "Deep insights into your sales, conversion, and team performance." },
  ]}),
  component: AnalyticsPage,
});

const TABS = ["Overview","Production","Conversion","Carriers","Products","Sources","Activity","Team","Challenges","Trophy Cabinet"];

const premiumTrend = Array.from({ length: 12 }, (_, i) => ({
  month: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][i],
  ap: 8000 + Math.round(Math.sin(i / 2) * 3000 + i * 800),
}));
const carrierMix = [
  { name: "Mutual of Omaha", value: 28 },
  { name: "Americo", value: 19 },
  { name: "Foresters", value: 16 },
  { name: "Aetna", value: 12 },
  { name: "Other", value: 25 },
];
const sourceMix = [
  { name: "Facebook Ads", count: 42 },
  { name: "Direct Mail", count: 31 },
  { name: "Referrals", count: 28 },
  { name: "Web Leads", count: 17 },
  { name: "Cold Call", count: 9 },
];
const COLORS = ["#3B82F6","#22C55E","#F59E0B","#A855F7","#64748B"];

function AnalyticsPage() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">Sales performance, conversion funnels, and Sophai insights.</p>
      </div>
      <Tabs defaultValue="Overview">
        <TabsList className="flex-wrap h-auto">
          {TABS.map((t) => <TabsTrigger key={t} value={t}>{t}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="Overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <KpiCard label="Annual Premium" value={fmtCurrency(184320)} change="+18%" />
            <KpiCard label="Policies issued" value="62" change="+12%" />
            <KpiCard label="Avg policy" value={fmtCurrency(2974)} change="+4%" />
            <KpiCard label="Conversion rate" value="34%" change="+3%" />
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2"><CardContent className="p-4">
              <h3 className="font-semibold mb-3">Premium trend</h3>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={premiumTrend}>
                  <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3B82F6" stopOpacity={0.4} /><stop offset="100%" stopColor="#3B82F6" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Area type="monotone" dataKey="ap" stroke="#3B82F6" strokeWidth={2} fill="url(#g1)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <h3 className="font-semibold mb-3">Carrier mix</h3>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={carrierMix} dataKey="value" nameKey="name" outerRadius={80} innerRadius={40}>
                    {carrierMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent></Card>
          </div>
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3"><Sparkles className="h-4 w-4 text-primary" /><h3 className="font-semibold">Sophai Insights</h3></div>
            <div className="grid md:grid-cols-3 gap-3">
              {[
                { icon: TrendingUp, title: "Your close rate is up 4 pts", body: "Compared to last 30 days. Final-expense quotes leading the lift." },
                { icon: Target, title: "Best dial window: 5–7pm", body: "Calls in this window convert 38% vs 24% average." },
                { icon: Flame, title: "Hot lead aging", body: "12 hot leads have no follow-up in 5+ days." },
              ].map((c, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 text-sm font-medium"><c.icon className="h-4 w-4 text-primary" />{c.title}</div>
                  <p className="text-xs text-muted-foreground mt-1">{c.body}</p>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="Sources" className="mt-4">
          <Card><CardContent className="p-4">
            <h3 className="font-semibold mb-3">Lead sources</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={sourceMix}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="count" fill="#3B82F6" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="Challenges" className="mt-4 grid md:grid-cols-2 gap-3">
          {[
            { title: "May Premium Sprint", goal: "$25,000 AP", progress: 68, prize: "$500 bonus" },
            { title: "30-day dial streak", goal: "30 days · 50 dials/day", progress: 90, prize: "Sophai Pro · 6 mo" },
            { title: "5-star reviews", goal: "10 reviews", progress: 40, prize: "Featured agent badge" },
            { title: "Referral generator", goal: "20 referrals", progress: 55, prize: "Lead credits" },
          ].map((c) => (
            <Card key={c.title}><CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{c.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Goal: {c.goal}</div>
                </div>
                <Trophy className="h-5 w-5 text-amber-500" />
              </div>
              <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${c.progress}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs mt-2">
                <span className="text-muted-foreground">{c.progress}% complete</span>
                <span className="font-medium">{c.prize}</span>
              </div>
            </CardContent></Card>
          ))}
        </TabsContent>

        <TabsContent value="Trophy Cabinet" className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {["Rookie of the Year","Top Closer Q1","100-Policy Club","Referral King","Streak Master","Million-Dollar AP","Sophai Pioneer","Team Builder"].map((t, i) => (
            <Card key={t}><CardContent className="p-4 text-center">
              <Award className={`h-10 w-10 mx-auto ${i % 2 === 0 ? "text-amber-500" : "text-muted-foreground"}`} />
              <div className="font-semibold text-sm mt-2">{t}</div>
              <div className="text-xs text-muted-foreground">{i % 2 === 0 ? "Earned 2026" : "Locked"}</div>
            </CardContent></Card>
          ))}
        </TabsContent>

        {["Production","Conversion","Carriers","Products","Activity","Team"].map((t) => (
          <TabsContent key={t} value={t} className="mt-4">
            <Card><CardContent className="p-12 text-center text-sm text-muted-foreground">{t} breakdown coming soon. Toggle filters in Overview for now.</CardContent></Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
