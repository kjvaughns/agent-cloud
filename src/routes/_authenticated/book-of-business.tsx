import { createFileRoute, useHydrated, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Download, ArrowUpDown, ArrowDown, ArrowUp, Link2, X, Plus, RefreshCw } from "lucide-react";
import { useRole } from "@/hooks/use-role";
import Papa from "papaparse";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SampleChip } from "@/components/sample-chip";
import { EmptyState as SharedEmptyState } from "@/components/empty-state";
import { EMPTY_STATES, ghostFor } from "@/lib/empty-states";
import { money, number } from "@/lib/format";
import { POLICY_STATUSES, statusBadgeClass, statusLabel, type PolicyStatus } from "@/lib/policy-status";
import {
  listBookOfBusiness,
  listCarriersForFilter,
} from "@/lib/book-of-business.functions";
import { PolicyDetailSheet } from "@/components/book-of-business/policy-detail-sheet";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { ScopeToggle, ScopeAgentFilter } from "@/components/scope-toggle";
import { useScope } from "@/hooks/use-scope";
import { SCOPES, type Scope } from "@/lib/scope";
import { StatTile } from "@/components/ui/stat-tile";

export const Route = createFileRoute("/_authenticated/book-of-business")({
  head: () => ({
    meta: [
      { title: "Book of Business — Agent Cloud" },
      { name: "description", content: "All placed policies across your hierarchy with filtering, sorting, and export." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { policy?: string; scope?: Scope } => ({
    // Deep link from global search: opens that policy's detail sheet.
    policy: typeof s.policy === "string" ? s.policy : undefined,
    // Left un-clamped on purpose: validateSearch is synchronous and runs
    // before we know what this person may open. useScope narrows it.
    scope: SCOPES.includes(s.scope as Scope) ? (s.scope as Scope) : undefined,
  }),
  component: BookPage,
});

type Source = "agent" | "carrier";
type SortKey =
  | "client_last_name" | "agent_last_name" | "carrier_name" | "product"
  | "policy_number" | "status" | "monthly_premium" | "annual_premium"
  | "effective_date" | "posted_at";

function BookPage() {
  const hydrated = useHydrated();
  const [source, setSource] = useState<Source>("agent");
  const { scope, ready: scopeReady } = useScope();
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);
  const [carrierFilter, setCarrierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [statusToggles, setStatusToggles] = useState<Set<PolicyStatus>>(new Set());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "posted_at", dir: "desc" });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const { policy: policyParam } = Route.useSearch();
  const [openRowId, setOpenRowId] = useState<string | null>(policyParam ?? null);
  useEffect(() => { if (policyParam) setOpenRowId(policyParam); }, [policyParam]);

  const listQ = useQuery({
    // Held until capabilities arrive: firing at the default scope and then
    // again at the real one would fetch the wrong rows first and flash.
    enabled: hydrated && scopeReady && source === "agent",
    queryKey: ["bob", "list", scope, selectedAgentId ?? "_"],
    queryFn: () => listBookOfBusiness({ data: { scope, agentId: selectedAgentId } }),
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

  const showAgentCol = scope !== "mine";
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const openRow = openRowId ? filtered.find((r: any) => r.id === openRowId) ?? null : null;

  function toggleSort(k: SortKey) {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));
  }
  function toggleStatusCard(s: PolicyStatus) {
    setStatusToggles((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
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

  const { isAdmin, isAgencyOwner } = useRole();
  const canCarrierSync = isAdmin || isAgencyOwner;

  return (
    <PageShell>
      <div className="col">
        <HeroBand
          title="Book of Business"
          subtitle="View all your deals and track your team's production."
          actions={
            <>
              <ScopeToggle />
              {canCarrierSync && (
                <Button asChild>
                  <Link to="/carrier-sync"><RefreshCw className="h-4 w-4 mr-1.5" /> Sync from Carrier</Link>
                </Button>
              )}
              <Button variant="outline" onClick={exportCSV} disabled={!filtered.length}>
                <Download className="h-4 w-4 mr-1.5" /> Export CSV
              </Button>
            </>
          }
        />

        {/* Summary stats */}
        <Panel>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatTile label="Total Policies" value={number(totals.count)} />
            <StatTile label="Total Annual Premium" value={money(totals.premium, { maximumFractionDigits: 2 })} tone="gold" />
            <StatTile label="Active Rate" value={`${totals.activeRate}%`} delta={`${filtered.filter((x: any) => x.status === "active").length} active`} />
            <StatTile label="Avg Policy Size" value={money(totals.avg, { maximumFractionDigits: 2 })} />
          </div>
        </Panel>

        {/* Filters toolbar */}
        <Panel>
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

            {/* How wide, and which one person — two questions, two controls.
                They used to share one select, which is why "one agent" was a
                scope value that behaved unlike the other two. */}
            <ScopeAgentFilter value={selectedAgentId} onChange={(id) => { setSelectedAgentId(id); setPage(0); }} />

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
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {activeChips.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs">
                  {c.label}
                  <button onClick={c.clear} className="ml-0.5 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                </span>
              ))}
              <button onClick={clearFilters} className="text-xs text-muted-foreground underline">Clear all</button>
            </div>
          )}

          <div className="mt-3 text-xs text-muted-foreground">
            Showing <span className="tnum text-foreground">{filtered.length}</span> of <span className="tnum text-foreground">{allRows.length}</span> policies
          </div>
        </Panel>

        {/* Status summary toggle cards */}
        <div className="grid grid-cols-2 gap-gap sm:grid-cols-3 lg:grid-cols-6">
          {POLICY_STATUSES.map((s) => {
            const active = statusToggles.has(s.value);
            return (
              <button
                key={s.value}
                onClick={() => toggleStatusCard(s.value)}
                className={cn(
                  "rounded-[var(--radius)] border p-3 text-left transition",
                  s.cardCls,
                  active ? "ring-2 ring-primary" : "hover:opacity-90",
                )}
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.07em] opacity-80">{s.label}</div>
                <div className="tnum font-display font-bold mt-1.5 text-[22px] leading-none" style={{ fontFamily: "var(--font-display)" }}>
                  {number(statusCounts.get(s.value) ?? 0)}
                </div>
              </button>
            );
          })}
          <div className="rounded-[var(--radius)] border border-border bg-surface-2 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">Total</div>
            <div className="tnum font-display font-bold mt-1.5 text-[22px] leading-none" style={{ fontFamily: "var(--font-display)" }}>
              {number(allRows.length)}
            </div>
          </div>
        </div>

        {/* Table */}
        <Panel pad={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface-2 backdrop-blur">
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
                    <tr key={i} className="border-t border-border">
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
                      className="border-t border-border cursor-pointer hover:bg-surface-2 transition-colors"
                    >
                      <td className="p-3 font-medium">
                        {r.client_last_name}, {r.client_first_name}
                        {r.carrier_integration && <Link2 className="inline-block ml-1.5 h-3 w-3 text-muted-foreground" />}
                        {/* On the production table above all others: this is
                            the page where a number gets reported to somebody. */}
                        <SampleChip when={r.is_sample} className="ml-1.5 px-1.5 py-0 text-[10px] align-middle" />
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
                      <td className="p-3 text-right tnum">{r.monthly_premium ? money(r.monthly_premium, { maximumFractionDigits: 2 }) : "—"}</td>
                      <td className="p-3 text-right tnum font-semibold text-success">
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
            <div className="flex items-center justify-between border-t border-border p-3 text-sm">
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
                <span className="text-muted-foreground tnum">
                  {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}
                </span>
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>‹</Button>
                <span className="text-xs tnum">Page {page + 1} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>›</Button>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <PolicyDetailSheet row={openRow} open={!!openRowId} onOpenChange={(v) => !v && setOpenRowId(null)} />
    </PageShell>
  );
}

function Th({ children, onClick, sort, k, className }: { children: React.ReactNode; onClick: () => void; sort: { key: string; dir: string }; k: string; className?: string }) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn("p-3 font-semibold text-[10px] uppercase tracking-[0.07em] text-muted-foreground", className)}>
      <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-foreground">
        {children} <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}

/**
 * Two different empties, two different messages.
 *
 * A filtered-to-nothing list is not a first-use screen: teaching somebody what
 * a book of business is, when they have one and have just filtered it down to
 * zero, reads as if the product was not paying attention.
 */
function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  const copy = EMPTY_STATES["book-of-business"];
  return hasFilters ? (
    <SharedEmptyState
      kind="cleared"
      title={copy.clearedTitle}
      body={copy.clearedBody}
      className="m-4 border-none bg-transparent"
      action={<Button variant="outline" size="sm" onClick={onClear}>Clear filters</Button>}
    />
  ) : (
    <SharedEmptyState
      title={copy.title}
      body={copy.body}
      ghost={ghostFor("book-of-business")}
      className="m-4 border-none bg-transparent"
      action={
        <Button asChild size="sm">
          <Link to="/post-deal"><Plus className="h-4 w-4 mr-1.5" />Post your first deal</Link>
        </Button>
      }
      secondary={
        <Button asChild size="sm" variant="outline">
          <Link to="/import">Import a spreadsheet</Link>
        </Button>
      }
    />
  );
}
