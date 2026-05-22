import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/kpi-card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtCurrency } from "@/lib/format";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { Download, DollarSign } from "lucide-react";

export const Route = createFileRoute("/_authenticated/finances")({
  head: () => ({ meta: [
    { title: "Finances — Agent Cloud" },
    { name: "description", content: "Commissions paid, pending, and forecasted earnings." },
  ]}),
  component: FinancesPage,
});

const forecast = Array.from({ length: 12 }, (_, i) => ({
  month: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][i],
  paid: i < 5 ? 4200 + i * 600 : 0,
  pending: i < 5 ? 800 + i * 120 : 0,
  projected: 4200 + i * 720,
}));

const commissions = [
  { date: "May 21", client: "John Smith", carrier: "Mutual of Omaha", product: "Term 20", amount: 1284, status: "Paid" },
  { date: "May 18", client: "Mary Garcia", carrier: "Americo", product: "Final Expense", amount: 642, status: "Paid" },
  { date: "May 16", client: "Robert Lee", carrier: "Aetna", product: "Whole Life", amount: 1820, status: "Pending" },
  { date: "May 14", client: "Patricia Brown", carrier: "Foresters", product: "IUL", amount: 2415, status: "Pending" },
  { date: "May 10", client: "Michael Davis", carrier: "Gerber Life", product: "Final Expense", amount: 318, status: "Chargeback" },
];

function FinancesPage() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finances</h1>
          <p className="text-sm text-muted-foreground">Commission earnings, pending payouts, and forecasts.</p>
        </div>
        <Button variant="outline"><Download className="h-4 w-4" /> Export 1099</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="YTD earnings" value={fmtCurrency(38420)} change="+22%" />
        <KpiCard label="Pending payouts" value={fmtCurrency(6240)} />
        <KpiCard label="Projected EOY" value={fmtCurrency(112000)} change="+18%" />
        <KpiCard label="Avg commission" value={fmtCurrency(984)} />
      </div>

      <Card><CardContent className="p-4">
        <h3 className="font-semibold mb-3">12-month forecast</h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={forecast}>
            <defs>
              <linearGradient id="paid" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.5} /><stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} /></linearGradient>
              <linearGradient id="proj" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
            <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v) => `$${v/1000}k`} />
            <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, color: "var(--color-card-foreground)" }} formatter={(v: number) => fmtCurrency(v)} />
            <Area type="monotone" dataKey="projected" stroke="var(--color-primary)" strokeWidth={2} fill="url(#proj)" name="Projected" />
            <Area type="monotone" dataKey="paid" stroke="var(--color-success)" strokeWidth={2} fill="url(#paid)" name="Paid" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent></Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2"><CardContent className="p-0">
          <div className="p-4 border-b font-semibold">Recent commissions</div>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Client</TableHead><TableHead>Carrier</TableHead>
              <TableHead>Product</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {commissions.map((c, i) => (
                <TableRow key={i}>
                  <TableCell>{c.date}</TableCell>
                  <TableCell className="font-medium">{c.client}</TableCell>
                  <TableCell>{c.carrier}</TableCell>
                  <TableCell>{c.product}</TableCell>
                  <TableCell className="text-right font-mono">{fmtCurrency(c.amount)}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      c.status === "Paid" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" :
                      c.status === "Pending" ? "bg-amber-500/15 text-amber-600 border-amber-500/30" :
                      "bg-rose-500/15 text-rose-600 border-rose-500/30"
                    }`}>{c.status}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3"><DollarSign className="h-4 w-4 text-emerald-500" /><h3 className="font-semibold">Breakdown by carrier</h3></div>
          <div className="space-y-3">
            {[
              { name: "Mutual of Omaha", amount: 12400, pct: 32 },
              { name: "Americo", amount: 8240, pct: 21 },
              { name: "Aetna", amount: 6120, pct: 16 },
              { name: "Foresters", amount: 5840, pct: 15 },
              { name: "Other", amount: 5820, pct: 16 },
            ].map((c) => (
              <div key={c.name}>
                <div className="flex justify-between text-sm"><span>{c.name}</span><span className="font-mono">{fmtCurrency(c.amount)}</span></div>
                <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${c.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </CardContent></Card>
      </div>
    </div>
  );
}
