import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { money, number } from "@/lib/format";
import {
  getProductionReport, getCommissionReport, exportCsv, listExportLog,
} from "@/lib/reports.functions";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — Agent Cloud" }] }),
  component: ReportsPage,
});

const EXPORTS = [
  { type: "clients", label: "Clients", description: "Contact details for every client you can see" },
  { type: "policies", label: "Policies", description: "Placed business with premium and status" },
  { type: "commissions", label: "Commissions", description: "Scheduled and paid commission entries" },
  { type: "agents", label: "Agent roster", description: "Your team, without identity documents" },
  { type: "retention", label: "Retention", description: "At-risk cases and their outcomes" },
] as const;

function startOfYear() {
  return `${new Date().getFullYear()}-01-01`;
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function ReportsPage() {
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(todayStr());

  const prodFn = useServerFn(getProductionReport);
  const commFn = useServerFn(getCommissionReport);
  const exportFn = useServerFn(exportCsv);
  const logFn = useServerFn(listExportLog);

  const prod = useQuery({
    queryKey: ["report", "production", from, to],
    queryFn: () => prodFn({ data: { from, to } }),
  });
  const comm = useQuery({
    queryKey: ["report", "commission", from, to],
    queryFn: () => commFn({ data: { from, to } }),
  });
  const log = useQuery({ queryKey: ["export-log"], queryFn: () => logFn() });

  const [busy, setBusy] = useState<string | null>(null);

  const download = useMutation({
    mutationFn: async (type: string) => {
      setBusy(type);
      return exportFn({ data: { type: type as any, from, to } });
    },
    onSuccess: (r: any) => {
      // Build the file client-side from the server-generated CSV so the
      // browser never has to re-derive the data.
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${number(r.rowCount)} row${r.rowCount === 1 ? "" : "s"}`);
      log.refetch();
      setBusy(null);
    },
    onError: (e: any) => { toast.error(e?.message ?? "Export failed"); setBusy(null); },
  });

  const p = prod.data as any;
  const c = comm.data as any;

  return (
    <PageShell>
      <div className="max-w-[1100px] mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand
          title="Reports"
          subtitle="Production and commission summaries, and data export"
          actions={
            <div className="flex items-center gap-2">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px] text-xs" />
              <span className="text-muted-foreground text-xs">→</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px] text-xs" />
            </div>
          }
        />

        {/* Production */}
        {prod.isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-[var(--gap)]">
            <Panel><StatTile label="Total ALP" value={money(p?.totals.alp ?? 0)} tone="gold" /></Panel>
            <Panel><StatTile label="Policies" value={number(p?.totals.policies ?? 0)} /></Panel>
            <Panel><StatTile label="Avg / Policy" value={money(p?.totals.avgPolicy ?? 0)} /></Panel>
            <Panel><StatTile label="Producing Agents" value={number(p?.totals.producingAgents ?? 0)} /></Panel>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-[var(--gap)]">
          <Panel title="Production by Agent">
            {prod.isLoading ? <Skeleton className="h-40" /> : (p?.byAgent ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No production in this range.</p>
            ) : (
              <RankTable
                rows={(p.byAgent as any[]).slice(0, 10).map((a) => ({
                  label: a.name, value: money(a.alp), sub: `${a.policies} policies`,
                }))}
              />
            )}
          </Panel>

          <Panel title="Production by Product">
            {prod.isLoading ? <Skeleton className="h-40" /> : (p?.byProduct ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No production in this range.</p>
            ) : (
              <RankTable
                rows={(p.byProduct as any[]).slice(0, 10).map((x) => ({
                  label: x.name, value: money(x.alp), sub: `${x.policies} policies`,
                }))}
              />
            )}
          </Panel>
        </div>

        {/* Commission */}
        {comm.isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <div className="grid grid-cols-3 gap-[var(--gap)]">
            <Panel><StatTile label="Scheduled" value={money(c?.totals.scheduled ?? 0)} /></Panel>
            <Panel><StatTile label="Paid" value={money(c?.totals.paid ?? 0)} tone="gold" /></Panel>
            <Panel><StatTile label="Pending" value={money(c?.totals.pending ?? 0)} /></Panel>
          </div>
        )}

        {(c?.byCarrier ?? []).length > 0 && (
          <Panel title="Commission by Carrier">
            <RankTable
              rows={(c.byCarrier as any[]).slice(0, 10).map((x) => ({
                label: x.carrier, value: money(x.amount), sub: null,
              }))}
            />
          </Panel>
        )}

        {/* Export */}
        <Panel title="Export Data">
          <p className="text-sm text-muted-foreground mb-3">
            Exports contain only the records you already have access to, and use the date range above
            where it applies. Each export is recorded below.
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {EXPORTS.map((e) => (
              <button
                key={e.type}
                onClick={() => download.mutate(e.type)}
                disabled={busy !== null}
                className={cn(
                  "flex items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors",
                  "hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                <span className="mt-0.5 text-muted-foreground shrink-0">
                  {busy === e.type
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Download className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{e.label}</span>
                  <span className="block text-xs text-muted-foreground">{e.description}</span>
                </span>
              </button>
            ))}
          </div>
        </Panel>

        {((log.data as any)?.entries ?? []).length > 0 && (
          <Panel title="Recent Exports">
            <ul className="divide-y divide-border-soft -my-1">
              {((log.data as any).entries as any[]).slice(0, 8).map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="capitalize">{e.export_type}</span>
                  <span className="text-xs text-muted-foreground tnum">
                    {number(e.row_count)} rows · {e.actor} · {new Date(e.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}

function RankTable({ rows }: { rows: { label: string; value: string; sub: string | null }[] }) {
  return (
    <ul className="divide-y divide-border-soft -my-1">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className="flex items-center justify-between py-2 gap-3">
          <span className="text-sm truncate">{r.label}</span>
          <span className="text-right shrink-0">
            <span className="block text-sm tnum font-semibold">{r.value}</span>
            {r.sub && <span className="block text-[11px] text-muted-foreground tnum">{r.sub}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
