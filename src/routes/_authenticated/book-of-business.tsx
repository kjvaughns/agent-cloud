import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { MOCK_POLICIES, CARRIERS } from "@/lib/mock-data";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtCurrency } from "@/lib/format";
import { Search, Download, ArrowUpDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/book-of-business")({
  head: () => ({ meta: [
    { title: "Book of Business — Agent Cloud" },
    { name: "description", content: "All policies you've written across carriers." },
  ]}),
  component: BookPage,
});

type SortKey = "client_name" | "carrier" | "product" | "annual_premium" | "issued_date" | "status";

function BookPage() {
  const [view, setView] = useState<"agent" | "carrier">("agent");
  const [query, setQuery] = useState("");
  const [carrier, setCarrier] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "issued_date", dir: "desc" });

  const rows = useMemo(() => {
    let r = MOCK_POLICIES.slice();
    const q = query.toLowerCase();
    if (q) r = r.filter((p) => `${p.client_name} ${p.policy_number} ${p.carrier}`.toLowerCase().includes(q));
    if (carrier !== "all") r = r.filter((p) => p.carrier === carrier);
    if (status !== "all") r = r.filter((p) => p.status === status);
    r.sort((a, b) => {
      const av = a[sort.key] as string | number;
      const bv = b[sort.key] as string | number;
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return r;
  }, [query, carrier, status, sort]);

  const totals = useMemo(() => ({
    count: rows.length,
    premium: rows.reduce((s, p) => s + p.annual_premium, 0),
    face: rows.reduce((s, p) => s + p.face_amount, 0),
    active: rows.filter((p) => p.status === "active").length,
  }), [rows]);

  const toggleSort = (k: SortKey) => setSort((s) => ({ key: k, dir: s.key === k && s.dir === "asc" ? "desc" : "asc" }));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Book of Business</h1>
          <p className="text-sm text-muted-foreground">All policies you've written, sortable and exportable.</p>
        </div>
        <Button variant="outline"><Download className="h-4 w-4" /> Export CSV</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Policies" value={String(totals.count)} />
        <Stat label="Active" value={String(totals.active)} />
        <Stat label="Annual Premium" value={fmtCurrency(totals.premium)} />
        <Stat label="Face Amount" value={fmtCurrency(totals.face)} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={view} onValueChange={(v) => setView(v as "agent" | "carrier")}>
          <TabsList>
            <TabsTrigger value="agent">By Agent</TabsTrigger>
            <TabsTrigger value="carrier">By Carrier</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search policies..." className="pl-8 w-64" />
        </div>
        <Select value={carrier} onValueChange={setCarrier}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Carrier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All carriers</SelectItem>
            {CARRIERS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            {["all","active","in_review","lapse_pending","lapsed","cancelled","withdrawn","not_taken","postponed"].map((s) =>
              <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s.replace("_"," ")}</SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead label="Client" onClick={() => toggleSort("client_name")} />
              <SortHead label="Carrier" onClick={() => toggleSort("carrier")} />
              <SortHead label="Product" onClick={() => toggleSort("product")} />
              <TableHead>Policy #</TableHead>
              <SortHead label="Annual Premium" onClick={() => toggleSort("annual_premium")} className="text-right" />
              <TableHead className="text-right">Face Amount</TableHead>
              <SortHead label="Issued" onClick={() => toggleSort("issued_date")} />
              <SortHead label="Status" onClick={() => toggleSort("status")} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id} className="cursor-pointer">
                <TableCell className="font-medium">{p.client_name}</TableCell>
                <TableCell>{p.carrier}</TableCell>
                <TableCell>{p.product}</TableCell>
                <TableCell className="font-mono text-xs">{p.policy_number}</TableCell>
                <TableCell className="text-right">{fmtCurrency(p.annual_premium)}</TableCell>
                <TableCell className="text-right">{fmtCurrency(p.face_amount)}</TableCell>
                <TableCell>{new Date(p.issued_date).toLocaleDateString()}</TableCell>
                <TableCell><StatusBadge status={p.status} /></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-12">No policies match your filters.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function SortHead({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <TableHead className={className}>
      <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}<ArrowUpDown className="h-3 w-3 opacity-60" />
      </button>
    </TableHead>
  );
}
