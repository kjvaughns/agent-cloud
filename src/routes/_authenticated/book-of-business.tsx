import { createFileRoute, useHydrated, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Download, ArrowUpDown, ArrowDown, ArrowUp, Link2, X, Plus } from "lucide-react";
import Papa from "papaparse";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { POLICY_STATUSES, statusBadgeClass, statusLabel, type PolicyStatus } from "@/lib/policy-status";
import {
  listBookOfBusiness,
  listDownlineAgents,
  listCarriersForFilter,
} from "@/lib/book-of-business.functions";
import { PolicyDetailSheet } from "@/components/book-of-business/policy-detail-sheet";

export const Route = createFileRoute("/_authenticated/book-of-business")({
  head: () => ({
    meta: [
      { title: "Book of Business — Agent Cloud" },
      { name: "description", content: "All placed policies across your hierarchy with filtering, sorting, and export." },
    ],
  }),
  component: BookPage,
});

type Source = "agent" | "carrier";
type Scope = "hierarchy" | "mine" | "agent";
type SortKey =
  | "client_last_name" | "agent_last_name" | "carrier_name" | "product"
  | "policy_number" | "status" | "monthly_premium" | "annual_premium"
  | "effective_date" | "posted_at";

function BookPage() {
  const hydrated = useHydrated();
  const [source, setSource] = useState<Source>("agent");
  const [scope, setScope] = useState<Scope>("hierarchy");
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);
  const [carrierFilter, setCarrierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [statusToggles, setStatusToggles] = useState<Set<PolicyStatus>>(new Set());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "posted_at", dir: "desc" });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const listQ = useQuery({
    enabled: hydrated && source === "agent",
    queryKey: ["bob", "list", scope, selectedAgentId ?? "_"],
    queryFn: () => listBookOfBusiness({ data: { scope, agentId: selectedAgentId } }),
  });
  const agentsQ = useQuery({
    enabled: hydrated,
    queryKey: ["bob", "downline"],
    queryFn: () => listDownlineAgents(),
  });
  const carriersQ = useQuery({
    enabled: hydrated,
    queryKey: ["bob", "carriers"],
    queryFn: () => listCarriersForFilter(),
  });

  const allRows = listQ.data ?? [];

  const filtered = useMemo(() => {
    let r = allRows.slice();
    if (carrierFilter !== "all") r = r.filter((x: any) => x.carrier_id === carrierFilter);
    if (statusFilter !== "all") r = r.filter((x: any) => x.status === statusFilter);
    if (statusToggles.size > 0) r = r.filter((x: any) => statusToggles.has(x.status));
    if (query.trim()) {
      const q = query.toLowerCase();
      r = r.filter((x: any) =>
        `${x.client_first_name ?? ""} ${x.client_last_name ?? ""} ${x.policy_number ?? ""} ${x.carrier_name ?? ""}`
          .toLowerCase()
          .includes(q),
      );
    }
    r.sort((a: any, b: any) => {
      const av = a[sort.key] ?? "";
      const bv = b[sort.key] ?? "";
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return r;
  }, [allRows, carrierFilter, statusFilter, statusToggles, query, sort]);

  const totals = useMemo(() => {
    const totalPremium = filtered.reduce((s: number, x: any) => s + Number(x.annual_premium ?? 0), 0);
    const active = filtered.filter((x: any) => x.status === "active").length;
    return {
      count: filtered.length,
      premium: totalPremium,
      activeRate: filtered.length ? Math.round((active / filtered.length) * 100) : 0,
      avg: filtered.length ? totalPremium / filtered.length : 0,
    };
  }, [filtered]);

  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of allRows) map.set(r.status, (map.get(r.status) ?? 0) + 1);
    return map;
  }, [allRows]);

  const showAgentCol = scope === "hierarchy";
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const openRow = openRowId ? filtered.find((r: any) => r.id === openRowId) ?? null : null;

  function toggleSort(k: SortKey) {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));
  }
  function toggleStatusCard(s: PolicyStatus) {
    setStatusToggles((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
    setPage(0);
  }
  function clearFilters() {
    setCarrierFilter("all"); setStatusFilter("all"); setStatusToggles(new Set()); setQuery("");
  }
  function exportCSV() {
    const rows = filtered.map((r: any) => ({
      Client: `${r.client_last_name ?? ""}, ${r.client_first_name ?? ""}`,
      Agent: `${r.agent_first_name ?? ""} ${r.agent_last_name ?? ""}`.trim(),
      Carrier: r.carrier_name ?? "",
      Product: r.product ?? "",
      "Policy #": r.policy_number ?? "",
      Status: statusLabel(r.status),
      "Monthly Premium": r.monthly_premium ?? "",
      "Annual Premium": r.annual_premium ?? "",
      "Effective Date": r.effective_date ?? "",
      Posted: r.posted_at ?? "",
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AgentCloud_BookOfBusiness_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const carrierName = carriersQ.data?.find((c) => c.id === carrierFilter)?.name;
  const activeChips: { label: string; clear: () => void }[] = [];
  if (carrierName) activeChips.push({ label: carrierName, clear: () => setCarrierFilter("all") });
  if (statusFilter !== "all") activeChips.push({ label: statusLabel(statusFilter), clear: () => setStatusFilter("all") });
  statusToggles.forEach((s) => activeChips.push({ label: statusLabel(s), clear: () => toggleStatusCard(s) }));

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Book of Business</h1>
          <p className="text-sm text-muted-foreground">View all your deals and track your team's production.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCSV} disabled={!filtered.length}>
            <Download className="h-4 w-4 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={carrierFilter} onValueChange={(v) => { setCarrierFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Carriers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Carriers</SelectItem>
                {carriersQ.data?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={scope === "agent" ? `agent:${selectedAgentId ?? ""}` : scope}
              onValueChange={(v) => {
                if (v === "hierarchy") { setScope("hierarchy"); setSelectedAgentId(undefined); }
                else if (v === "mine") { setScope("mine"); setSelectedAgentId(undefined); }
                else if (v.startsWith("agent:")) { setScope("agent"); setSelectedAgentId(v.slice(6)); }
                setPage(0);
              }}
            >
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hierarchy">Entire Hierarchy</SelectItem>
                <SelectItem value="mine">My Policies Only</SelectItem>
                {(agentsQ.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={`agent:${a.id}`}>
                    {[a.first_name, a.last_name].filter(Boolean).join(" ") || "Agent"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={() => { setScope("mine"); setSelectedAgentId(undefined); setPage(0); }}>
              View My Policies
            </Button>

            <div className="flex-1" />

            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
              <SelectTrigger className="w-[170px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {POLICY_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(0); }}
                placeholder="Search client, policy, carrier..."
                className="w-[260px] pl-8"
              />
            </div>
          </div>

          {/* Active filter chips */}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activeChips.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs">
                  {c.label}
                  <button onClick={c.clear} className="ml-0.5 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                </span>
              ))}
              <button onClick={clearFilters} className="text-xs text-muted-foreground underline">Clear all</button>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Showing {filtered.length} of {allRows.length} policies
          </div>

          {/* Status summary cards */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {POLICY_STATUSES.map((s) => {
              const active = statusToggles.has(s.value);
              return (
                <button
                  key={s.value}
                  onClick={() => toggleStatusCard(s.value)}
                  className={cn(
                    "min-w-[120px] rounded-lg border p-3 text-left transition",
                    s.cardCls,
                    active ? "ring-2 ring-primary" : "hover:opacity-90",
                  )}
                >
                  <div className="text-[11px] uppercase tracking-wide opacity-80">{s.label}</div>
                  <div className="text-xl font-semibold">{statusCounts.get(s.value) ?? 0}</div>
                </button>
              );
            })}
            <div className="min-w-[120px] rounded-lg border bg-card p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</div>
              <div className="text-xl font-semibold">{allRows.length}</div>
            </div>
          </div>

          {/* Summary stats bar */}
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 md:grid-cols-4">
            <Stat label="Total Policies" value={String(totals.count)} />
            <Stat label="Total Annual Premium" value={money(totals.premium, { maximumFractionDigits: 2 })} />
            <Stat label="Active Rate" value={`${totals.activeRate}%`} />
            <Stat label="Avg Policy Size" value={money(totals.avg, { maximumFractionDigits: 2 })} />
          </div>

          {/* Table */}
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 backdrop-blur z-10">
                  <tr className="text-left">
                    <Th onClick={() => toggleSort("client_last_name")} sort={sort} k="client_last_name">Client Name</Th>
                    {showAgentCol && <Th onClick={() => toggleSort("agent_last_name")} sort={sort} k="agent_last_name">Agent</Th>}
                    <Th onClick={() => toggleSort("carrier_name")} sort={sort} k="carrier_name">Carrier</Th>
                    <Th onClick={() => toggleSort("product")} sort={sort} k="product">Product</Th>
                    <Th onClick={() => toggleSort("policy_number")} sort={sort} k="policy_number">Policy #</Th>
                    <Th onClick={() => toggleSort("status")} sort={sort} k="status">Status</Th>
                    <Th onClick={() => toggleSort("monthly_premium")} sort={sort} k="monthly_premium" className="text-right">Monthly</Th>
                    <Th onClick={() => toggleSort("annual_premium")} sort={sort} k="annual_premium" className="text-right">Annual</Th>
                    <Th onClick={() => toggleSort("effective_date")} sort={sort} k="effective_date">Effective</Th>
                    <Th onClick={() => toggleSort("posted_at")} sort={sort} k="posted_at">Posted</Th>
                  </tr>
                </thead>
                <tbody>
                  {listQ.isLoading || !hydrated ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-t">
                        <td colSpan={showAgentCol ? 10 : 9} className="p-3"><Skeleton className="h-6 w-full" /></td>
                      </tr>
                    ))
                  ) : pageRows.length === 0 ? (
                    <tr><td colSpan={showAgentCol ? 10 : 9}>
                      <EmptyState
                        hasFilters={activeChips.length > 0 || !!query}
                        onClear={clearFilters}
                      />
                    </td></tr>
                  ) : (
                    pageRows.map((r: any) => (
                      <tr
                        key={r.id}
                        onClick={() => setOpenRowId(r.id)}
                        className="border-t cursor-pointer hover:bg-muted/40 transition-colors"
                      >
                        <td className="p-3 font-medium">
                          {r.client_last_name}, {r.client_first_name}
                          {r.carrier_integration && <Link2 className="inline-block ml-1.5 h-3 w-3 text-muted-foreground" />}
                        </td>
                        {showAgentCol && (
                          <td className="p-3 text-muted-foreground text-xs">
                            {[r.agent_first_name, r.agent_last_name].filter(Boolean).join(" ")}
                          </td>
                        )}
                        <td className="p-3">{r.carrier_name ?? "—"}</td>
                        <td className="p-3">{r.product ?? "—"}</td>
                        <td className="p-3 font-mono text-xs">{r.policy_number ?? "—"}</td>
                        <td className="p-3">
                          <span className={cn("inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium", statusBadgeClass(r.status))}>
                            {statusLabel(r.status)}
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums">{r.monthly_premium ? money(r.monthly_premium, { maximumFractionDigits: 2 }) : "—"}</td>
                        <td className="p-3 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                          {r.annual_premium ? money(r.annual_premium, { maximumFractionDigits: 2 }) : "—"}
                        </td>
                        <td className="p-3">{r.effective_date ? new Date(r.effective_date).toLocaleDateString() : "—"}</td>
                        <td className="p-3">{r.posted_at ? new Date(r.posted_at).toLocaleDateString() : "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filtered.length > 0 && (
              <div className="flex items-center justify-between border-t p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Rows per page</span>
                  <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
                    <SelectTrigger className="w-[90px] h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}
                  </span>
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>‹</Button>
                  <span className="text-xs">Page {page + 1} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>›</Button>
                </div>
              </div>
            )}
          </div>

      <PolicyDetailSheet row={openRow} open={!!openRowId} onOpenChange={(v) => !v && setOpenRowId(null)} />
    </div>
  );
}

function Th({ children, onClick, sort, k, className }: { children: React.ReactNode; onClick: () => void; sort: { key: string; dir: string }; k: string; className?: string }) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn("p-3 font-semibold text-xs uppercase tracking-wide text-muted-foreground", className)}>
      <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-foreground">
        {children} <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="p-10 text-center">
      {hasFilters ? (
        <>
          <p className="text-sm text-muted-foreground mb-3">No policies match your current filters.</p>
          <Button variant="outline" onClick={onClear}>Clear Filters</Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-3">No policies yet. Start by posting your first deal.</p>
          <Button asChild>
            <Link to="/post-deal"><Plus className="h-4 w-4 mr-1.5" /> Post a Deal</Link>
          </Button>
        </>
      )}
    </div>
  );
}
