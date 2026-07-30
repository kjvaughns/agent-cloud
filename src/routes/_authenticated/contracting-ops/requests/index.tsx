import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Search } from "lucide-react";
import { Panel } from "@/components/page-shell";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { listContractingRequests } from "@/lib/contracting-ops.functions";
import {
  CONTRACT_TYPE_LABELS, REQUEST_STATUSES, REQUEST_STATUS_META, type ContractType, type RequestStatus,
} from "@/lib/contracting-ops/types";
import { AgePill, EmptyState, OwnerChip, StatusBadge } from "@/components/contracting/shared";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contracting-ops/requests/")({
  component: RequestsPage,
  head: () => ({ meta: [{ title: "Contract Requests | Agent Cloud" }] }),
});

type Scope = "open" | "all" | "mine" | "unassigned";

function RequestsPage() {
  const fn = useServerFn(listContractingRequests);
  const [scope, setScope] = useState<Scope>("open");
  const [status, setStatus] = useState<RequestStatus | "">("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "requests", status],
    queryFn: () => fn({ data: status ? { status } : {} }),
  });

  const rows = useMemo(() => {
    let out = (data?.rows ?? []) as any[];
    if (scope === "open") out = out.filter((r) => REQUEST_STATUS_META[r.status as RequestStatus]?.open);
    if (scope === "unassigned") out = out.filter((r) => !r.assigned_to);
    if (search.trim()) {
      const s = search.toLowerCase();
      out = out.filter((r) =>
        r.agent_name.toLowerCase().includes(s) ||
        r.carrier_name.toLowerCase().includes(s) ||
        String(r.reference ?? "").toLowerCase().includes(s) ||
        String(r.agent_npn ?? "").includes(s));
    }
    return out;
  }, [data, scope, search]);

  // Status options are limited to statuses actually present, so the filter
  // never offers a choice that returns nothing.
  const presentStatuses = useMemo(() => {
    const set = new Set((data?.rows ?? []).map((r: any) => r.status));
    return REQUEST_STATUSES.filter((s) => set.has(s));
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["open", "unassigned", "all"] as Scope[]).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              scope === s
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "open" ? "Open" : s === "unassigned" ? "Unassigned" : "All"}
          </button>
        ))}

        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Agent, NPN, carrier or reference"
            className="pl-8"
          />
        </div>
      </div>

      {presentStatuses.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatus("")}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium",
              status === "" ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground",
            )}
          >
            Any status
          </button>
          {presentStatuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(status === s ? "" : s)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                status === s ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground",
              )}
            >
              {REQUEST_STATUS_META[s].label}
            </button>
          ))}
        </div>
      )}

      <Panel pad={false}>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No contracting requests here"
              body="Create a contracting request when an agent needs a new carrier contract, transfer, state appointment or hierarchy change."
            />
          </div>
        ) : (
          <>
            {/* Column headers on desktop only — on a phone each row reads as a
                card, where headers would be noise. */}
            <div className="hidden items-center gap-3 border-b border-border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground lg:flex">
              <span className="flex-[2]">Agent</span>
              <span className="flex-1">Carrier</span>
              <span className="flex-1">Type</span>
              <span className="flex-1">Status</span>
              <span className="w-20">Waiting on</span>
              <span className="w-24">Readiness</span>
              <span className="w-24">Age</span>
              <span className="w-5" />
            </div>

            <ul className="divide-y divide-border-soft">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link
                    to="/contracting-ops/requests/$requestId"
                    params={{ requestId: r.id }}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-surface-2/40 lg:flex-nowrap"
                  >
                    <span className="min-w-0 flex-[2]">
                      <span className="block truncate text-sm font-medium text-foreground">{r.agent_name}</span>
                      <span className="tnum block truncate text-[11px] text-muted-foreground">
                        {r.reference ?? "—"}{r.agent_npn ? ` · NPN ${r.agent_npn}` : ""}
                      </span>
                    </span>

                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{r.carrier_name}</span>

                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {CONTRACT_TYPE_LABELS[r.contract_type as ContractType] ?? r.contract_type}
                    </span>

                    <span className="flex-1"><StatusBadge status={r.status} /></span>

                    <span className="w-20"><OwnerChip status={r.status} /></span>

                    <span className="w-24">
                      <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-2">
                          <span
                            className={cn("block h-full rounded-full", r.readiness_pct === 100 ? "bg-success" : "bg-primary")}
                            style={{ width: `${r.readiness_pct}%` }}
                          />
                        </span>
                        <span className="tnum text-[11px] text-muted-foreground">{r.readiness_pct}%</span>
                      </span>
                    </span>

                    <span className="w-24"><AgePill days={r.days_open} overdue={r.is_overdue} /></span>

                    <ChevronRight className="hidden h-4 w-4 shrink-0 text-text-dim lg:block" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      {rows.length > 0 && (
        <p className="text-[11px] text-text-dim">
          Showing {rows.length} request{rows.length === 1 ? "" : "s"}. You see the agents your role covers —
          agents see their own, managers see their downline.
        </p>
      )}
    </div>
  );
}
