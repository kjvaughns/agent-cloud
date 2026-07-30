import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@/hooks/use-server-fn";
import { listReadyToSell, recomputeReadyToSell } from "@/lib/contracting-workflow.functions";
import { READY_TO_SELL_LABELS, type ReadyToSellStatus } from "@/lib/contracting-ops/types";
import { Column, FilterChips, Pill, RecordTable, Stacked } from "@/components/contracting/table";
import { EmptyState } from "@/components/contracting/shared";

export const Route = createFileRoute("/_authenticated/contracting-ops/ready-to-sell")({
  component: ReadyToSellPage,
  head: () => ({ meta: [{ title: "Ready to Sell | Agent Cloud" }] }),
});

/**
 * Tone by status. Colour is a secondary cue only — every badge carries its own
 * words, because an operator who cannot distinguish amber from red still has
 * to work this list.
 */
const TONE: Record<ReadyToSellStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  ready: "success",
  contract_submitted: "info",
  contract_pending: "info",
  hierarchy_change_pending: "info",
  comp_approval_pending: "info",
  missing_writing_number: "warning",
  missing_eo: "warning",
  missing_aml: "warning",
  missing_pdb: "warning",
  missing_appointment: "warning",
  missing_license: "danger",
  not_eligible: "neutral",
};

function ReadyToSellPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listReadyToSell);
  const recomputeFn = useServerFn(recomputeReadyToSell);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ReadyToSellStatus | "">("");

  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "ready-to-sell"],
    queryFn: () => listFn(),
  });

  const refresh = useMutation({
    mutationFn: () => recomputeFn(),
    onSuccess: (r: any) => {
      toast.success(`Recomputed ${r?.computed ?? 0} agent and carrier combinations`);
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not refresh"),
  });

  const all = (data?.rows ?? []) as any[];

  const rows = useMemo(() => {
    let out = all;
    if (status) out = out.filter((r) => r.status === status);
    if (search.trim()) {
      const s = search.toLowerCase();
      out = out.filter((r) =>
        r.agent_name.toLowerCase().includes(s) ||
        r.carrier_name.toLowerCase().includes(s) ||
        String(r.agent_npn ?? "").includes(s) ||
        (r.sellable_states ?? []).some((st: string) => st.toLowerCase() === s));
    }
    return out;
  }, [all, status, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of all) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [all]);

  const readyAgents = useMemo(
    () => new Set(all.filter((r) => r.status === "ready").map((r) => r.agent_id)).size,
    [all],
  );

  const columns: Column<any>[] = [
    { key: "agent", header: "Agent", className: "flex-[2]",
      render: (r) => <Stacked top={r.agent_name} bottom={r.agent_npn ? `NPN ${r.agent_npn}` : undefined} /> },
    { key: "carrier", header: "Carrier",
      render: (r) => <span className="truncate text-sm text-muted-foreground">{r.carrier_name}</span> },
    { key: "status", header: "Status", className: "w-44",
      render: (r) => <Pill tone={TONE[r.status as ReadyToSellStatus] ?? "neutral"}>
        {READY_TO_SELL_LABELS[r.status as ReadyToSellStatus] ?? r.status}
      </Pill> },
    { key: "states", header: "Sellable states", className: "flex-1",
      render: (r) => (
        <span className="truncate text-xs text-muted-foreground">
          {(r.sellable_states ?? []).length
            ? (r.sellable_states as string[]).slice(0, 8).join(", ") + ((r.sellable_states.length > 8) ? ` +${r.sellable_states.length - 8}` : "")
            : "—"}
        </span>
      ) },
    { key: "blockers", header: "What's missing", className: "flex-1", secondary: true,
      render: (r) => (
        <span className="truncate text-xs text-muted-foreground">
          {(r.blockers ?? []).map((b: any) => b.label).join("; ") || "Nothing"}
        </span>
      ) },
  ];

  if (!isLoading && all.length === 0) {
    return (
      <EmptyState
        title="Nothing to show yet"
        body="Ready to Sell statuses appear once licensing, contracting and writing number records exist. Run a refresh to compute them from what you have today."
        action={
          <Button size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} />
            {refresh.isPending ? "Computing…" : "Compute now"}
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-success/30 bg-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Agents ready somewhere</div>
          <div className="tnum mt-1.5 text-2xl font-bold text-foreground">{readyAgents}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Combinations ready</div>
          <div className="tnum mt-1.5 text-2xl font-bold text-foreground">{counts.ready ?? 0}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Total tracked</div>
          <div className="tnum mt-1.5 text-2xl font-bold text-foreground">{all.length}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
                 placeholder="Agent, NPN, carrier or state" className="pl-8" />
        </div>
        <div className="ml-auto flex items-center gap-3">
          {data?.computed_at && (
            <span className="text-[11px] text-text-dim">
              Computed {new Date(data.computed_at).toLocaleString()}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refresh.isPending ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <FilterChips
        value={status}
        onChange={setStatus}
        allLabel="Any status"
        options={Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([v, count]) => ({
            value: v as ReadyToSellStatus,
            label: READY_TO_SELL_LABELS[v as ReadyToSellStatus] ?? v,
            count,
          }))}
      />

      <Panel pad={false}>
        <RecordTable
          rows={rows}
          columns={columns}
          loading={isLoading}
          empty={{
            title: "Nothing matches those filters",
            body: "Clear the search or pick a different status.",
          }}
        />
      </Panel>

      <p className="text-[11px] text-text-dim">
        A combination is Ready to Sell when the agent holds a current licence and an active
        appointment in the same state, has an active writing number, and their E&amp;O, AML and PDB
        records are current. Licensing here is manually verified — it is not a live NIPR feed.
      </p>
    </div>
  );
}
