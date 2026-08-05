import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import {
  listStatements, createStatement, reconcileStatement,
  getStatementDetail, type StatementLine,
} from "@/lib/reconciliation.functions";

export const Route = createFileRoute("/_authenticated/finances_/reconciliation")({
  head: () => ({ meta: [{ title: "Commission Reconciliation — Agent Cloud" }] }),
  component: ReconciliationPage,
});

/** Minimal CSV parse: handles quoted fields and embedded commas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const HEADER_HINTS: Record<string, string[]> = {
  policy_number: ["policy", "policy number", "policy #", "policyno", "contract"],
  insured_name: ["insured", "client", "insured name", "member"],
  agent_name: ["agent", "writing agent", "producer"],
  product: ["product", "plan"],
  paid_amount: ["amount", "commission", "paid", "net", "commission amount"],
  paid_date: ["date", "paid date", "process date"],
};

function mapHeaders(header: string[]) {
  const map: Record<string, number> = {};
  header.forEach((h, i) => {
    const norm = h.trim().toLowerCase();
    for (const [field, hints] of Object.entries(HEADER_HINTS)) {
      if (map[field] === undefined && hints.some((x) => norm === x || norm.includes(x))) {
        map[field] = i;
      }
    }
  });
  return map;
}

function money2(s: string) {
  const n = Number(String(s).replace(/[$,()\s]/g, "").replace(/^-?/, (m) => m));
  return Number.isFinite(n) ? n : 0;
}

function ReconciliationPage() {
  return <ReconciliationContent />;
}

/**
 * Rendered both as its own route and as the Reconciliation tab inside
 * Finances. `embedded` drops the page chrome so it sits inside the host
 * page's shell instead of nesting a second one.
 */
export function ReconciliationContent({ embedded = false }: { embedded?: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId
    ? <StatementDetail id={openId} onBack={() => setOpenId(null)} embedded={embedded} />
    : <StatementList onOpen={setOpenId} embedded={embedded} />;
}

/** Page chrome that collapses to a plain fragment when embedded. */
function Shell({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  if (embedded) return <div className="flex flex-col gap-[var(--gap)]">{children}</div>;
  return (
    <PageShell>
      <div className="max-w-[1100px] mx-auto flex flex-col gap-[var(--gap)]">{children}</div>
    </PageShell>
  );
}

function StatementList({ onOpen, embedded = false }: { onOpen: (id: string) => void; embedded?: boolean }) {
  const listFn = useServerFn(listStatements);
  const { data, isLoading } = useQuery({ queryKey: ["statements"], queryFn: () => listFn() });
  const rows = (data as any)?.statements ?? [];

  return (
    <Shell embedded={embedded}>
        <HeroBand
          title="Commission Reconciliation"
          subtitle="Compare what carriers actually paid against what the platform expected"
          actions={<UploadDialog />}
        />

        <Panel>
          <p className="text-sm text-muted-foreground">
            Upload a carrier statement as CSV. Each line is matched to a policy by policy number
            and compared to the commission the engine calculated when the deal was posted.
            Nothing here changes your commission schedule — it only reports the difference.
          </p>
        </Panel>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : rows.length === 0 ? (
          <Panel>
            <div className="py-12 text-center space-y-2">
              <div className="font-medium">No statements uploaded yet.</div>
              <p className="text-sm text-muted-foreground">Upload your first carrier statement to start reconciling.</p>
            </div>
          </Panel>
        ) : (
          <Panel pad={false} className="overflow-hidden">
            {/* The Panel clips to its rounded corners, which also clipped the
                table's right-hand columns off on a phone with no way to reach
                them. This inner scroller restores them. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-surface-2">
                <tr>
                  {["Carrier", "Statement Date", "Period", "Stated", "Parsed", "Status"].map((h, i) => (
                    <th key={h} className={cn(
                      "px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
                      i >= 3 && i <= 4 ? "text-right" : "text-left",
                    )}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((s: any) => (
                  <tr
                    key={s.id}
                    onClick={() => onOpen(s.id)}
                    className="border-t border-border-soft hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium">{s.carrier_name}</td>
                    <td className="px-4 py-3 tnum">{s.statement_date}</td>
                    <td className="px-4 py-3 text-muted-foreground tnum text-xs">
                      {s.period_start && s.period_end ? `${s.period_start} → ${s.period_end}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tnum">{s.stated_total != null ? money(Number(s.stated_total)) : "—"}</td>
                    <td className="px-4 py-3 text-right tnum">{s.parsed_total != null ? money(Number(s.parsed_total)) : "—"}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={s.status === "reconciled" ? "success" : s.status === "disputed" ? "warning" : "secondary"}
                        className="text-[10px] capitalize"
                      >
                        {s.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </Panel>
        )}
    </Shell>
  );
}

function UploadDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [fileName, setFileName] = useState("");
  const [lines, setLines] = useState<any[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  const createFn = useServerFn(createStatement);
  const reconcileFn = useServerFn(reconcileStatement);

  async function onFile(f: File) {
    setProblem(null);
    const rows = parseCsv(await f.text());
    if (rows.length < 2) { setProblem("That file has no data rows."); return; }

    const map = mapHeaders(rows[0]);
    if (map.policy_number === undefined || map.paid_amount === undefined) {
      setProblem("Couldn't find a policy number and an amount column. Expected headers like “Policy Number” and “Commission Amount”.");
      return;
    }

    const parsed = rows.slice(1).map((r) => ({
      policy_number: (r[map.policy_number] ?? "").trim() || null,
      insured_name: map.insured_name !== undefined ? (r[map.insured_name] ?? "").trim() || null : null,
      agent_name: map.agent_name !== undefined ? (r[map.agent_name] ?? "").trim() || null : null,
      product: map.product !== undefined ? (r[map.product] ?? "").trim() || null : null,
      paid_amount: money2(r[map.paid_amount] ?? "0"),
      paid_date: null,
    })).filter((l) => l.policy_number || l.paid_amount !== 0);

    setFileName(f.name);
    setLines(parsed);
  }

  const submit = useMutation({
    mutationFn: async () => {
      const { statement_id } = await createFn({
        data: {
          carrier_name: carrier.trim(),
          statement_date: date,
          file_name: fileName || null,
          lines,
        },
      });
      return reconcileFn({ data: { statement_id } });
    },
    onSuccess: (r: any) => {
      toast.success(`${r.matched} matched · ${r.variance} variance · ${r.unmatched} unmatched`);
      setOpen(false);
      setCarrier(""); setLines([]); setFileName(""); setProblem(null);
      qc.invalidateQueries({ queryKey: ["statements"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Upload failed"),
  });

  const total = lines.reduce((a, l) => a + l.paid_amount, 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Upload className="h-4 w-4 mr-1" /> Upload Statement</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Upload carrier statement</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">Carrier</label>
            <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Mutual of Omaha" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Statement date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">CSV file</label>
            <Input
              type="file" accept=".csv,text/csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
          </div>
          {problem && <p className="text-xs text-destructive">{problem}</p>}
          {lines.length > 0 && (
            <div className="rounded-lg border border-border p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Lines</span><span className="tnum">{lines.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total paid</span><span className="tnum font-semibold">{money(total)}</span></div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={() => submit.mutate()}
            disabled={!carrier.trim() || lines.length === 0 || submit.isPending}
          >
            {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload & reconcile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatementDetail({ id, onBack, embedded = false }: { id: string; onBack: () => void; embedded?: boolean }) {
  const [filter, setFilter] = useState<"all" | "variance" | "unmatched" | "matched">("variance");
  const detailFn = useServerFn(getStatementDetail);

  const { data, isLoading } = useQuery({
    queryKey: ["statement", id, filter],
    queryFn: () => detailFn({ data: { statement_id: id, filter } }),
  });

  const s = (data as any)?.statement;
  const sum = (data as any)?.summary;
  const lines = ((data as any)?.lines ?? []) as StatementLine[];

  return (
    <Shell embedded={embedded}>
        <Button variant="ghost" size="sm" className="self-start -ml-2" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> All statements
        </Button>

        <HeroBand
          title={s?.carrier_name ?? "Statement"}
          subtitle={s ? `Statement dated ${s.statement_date}` : undefined}
        />

        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-[var(--gap)]">
            <Panel><StatTile label="Paid by carrier" value={money(sum?.paid ?? 0)} /></Panel>
            <Panel><StatTile label="Expected" value={money(sum?.expected ?? 0)} /></Panel>
            <Panel>
              <StatTile
                label="Net variance"
                value={money(sum?.netVariance ?? 0)}
                tone={Math.abs(sum?.netVariance ?? 0) > 0.01 ? "red" : undefined}
                delta={(sum?.netVariance ?? 0) < 0 ? "underpaid" : (sum?.netVariance ?? 0) > 0 ? "overpaid" : "balanced"}
              />
            </Panel>
            <Panel>
              <StatTile
                label="Lines"
                value={String(sum?.lineCount ?? 0)}
                delta={`${sum?.matched ?? 0} matched · ${sum?.varianceCount ?? 0} off · ${sum?.unmatched ?? 0} unmatched`}
              />
            </Panel>
          </div>
        )}

        <div className="flex gap-1.5 flex-wrap">
          {(["variance", "unmatched", "matched", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors capitalize",
                filter === f
                  ? "bg-gold-glow text-gold-bright border-primary/40"
                  : "bg-surface-2 text-muted-foreground border-border hover:text-foreground",
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {isLoading ? (
          <Skeleton className="h-64" />
        ) : lines.length === 0 ? (
          <Panel>
            <div className="py-10 text-center text-sm text-muted-foreground">
              {filter === "variance" ? "No variances — every matched line paid what was expected." : "Nothing in this view."}
            </div>
          </Panel>
        ) : (
          <Panel pad={false} className="overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-2 z-10">
                  <tr>
                    {["Policy", "Insured", "Paid", "Expected", "Variance", "Status"].map((h, i) => (
                      <th key={h} className={cn(
                        "px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
                        i >= 2 && i <= 4 ? "text-right" : "text-left",
                      )}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-t border-border-soft hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-2.5 tnum">{l.policy_number || "—"}</td>
                      <td className="px-4 py-2.5">{l.insured_name || "—"}</td>
                      <td className="px-4 py-2.5 text-right tnum">{money(Number(l.paid_amount))}</td>
                      <td className="px-4 py-2.5 text-right tnum text-muted-foreground">
                        {l.expected_amount != null ? money(Number(l.expected_amount)) : "—"}
                      </td>
                      <td className={cn(
                        "px-4 py-2.5 text-right tnum font-medium",
                        (l.variance ?? 0) < -0.01 && "text-destructive",
                        (l.variance ?? 0) > 0.01 && "text-warning",
                      )}>
                        {l.variance != null ? money(Number(l.variance)) : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant={
                            l.match_status === "matched" ? "success"
                            : l.match_status === "variance" ? "warning"
                            : "secondary"
                          }
                          className="text-[10px] capitalize"
                        >
                          {l.match_status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
    </Shell>
  );
}
