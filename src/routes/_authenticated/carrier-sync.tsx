import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import * as XLSX from "xlsx";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileSpreadsheet, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, Lock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRole } from "@/hooks/use-role";
import { listCarriersForFilter } from "@/lib/book-of-business.functions";
import {
  previewCarrierSync, applyCarrierSync, getMappingTemplate, saveMappingTemplate,
  listSyncLogs, POLICY_STATUS_VALUES, type SyncPreview,
} from "@/lib/carrier-sync.functions";
import { POLICY_STATUSES } from "@/lib/policy-status";

export const Route = createFileRoute("/_authenticated/carrier-sync")({
  head: () => ({ meta: [{ title: "Carrier Book Sync — Agent Cloud" }] }),
  component: CarrierSyncPage,
});

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  POLICY_STATUSES.map((s: any) => [s.value, s.label]),
);

type ParsedFile = { name: string; headers: string[]; rows: Record<string, string>[] };
type ColumnMap = { policy_number: string; status: string; client_name: string };

const STEPS = ["Upload", "Map Columns", "Preview", "Apply"];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border",
            i === current ? "bg-gold-glow text-gold-bright border-primary/40"
              : i < current ? "bg-surface-2 text-success border-border"
              : "bg-surface-2 text-muted-foreground border-border-soft",
          )}>
            <span className="tnum">{i < current ? "✓" : i + 1}</span> {s}
          </div>
          {i < STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-text-dim" />}
        </div>
      ))}
    </div>
  );
}

function guessColumn(headers: string[], patterns: RegExp[]): string {
  for (const re of patterns) {
    const hit = headers.find((h) => re.test(h));
    if (hit) return hit;
  }
  return "";
}

function CarrierSyncPage() {
  const { isAdmin, isAgencyOwner, loading: roleLoading } = useRole();
  const canSync = isAdmin || isAgencyOwner;

  if (roleLoading) return <PageShell><Skeleton className="h-60" /></PageShell>;
  if (!canSync) {
    return (
      <PageShell>
        <div className="max-w-xl mx-auto">
          <Panel>
            <div className="py-10 text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-full bg-surface-2 grid place-items-center">
                <Lock className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="font-display font-semibold" style={{ fontFamily: "var(--font-display)" }}>Owner access required</div>
              <p className="text-sm text-muted-foreground">
                Carrier book syncs are run by your agency owner. Your policy statuses update automatically after each weekly sync.
              </p>
              <Button asChild variant="outline"><Link to="/book-of-business">Back to Book of Business</Link></Button>
            </div>
          </Panel>
        </div>
      </PageShell>
    );
  }
  return <SyncWizard />;
}

function SyncWizard() {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [carrierId, setCarrierId] = useState("");
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [colMap, setColMap] = useState<ColumnMap>({ policy_number: "", status: "", client_name: "" });
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [saveTemplate, setSaveTemplate] = useState(true);
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [result, setResult] = useState<{ updated: number; skipped: number } | null>(null);

  const carriersFn = useServerFn(listCarriersForFilter);
  const { data: carriers } = useQuery({ queryKey: ["carriers-filter"], queryFn: () => carriersFn() });

  const logsFn = useServerFn(listSyncLogs);
  const { data: logs } = useQuery({ queryKey: ["carrier-sync-logs"], queryFn: () => logsFn() });

  const templateFn = useServerFn(getMappingTemplate);
  const saveTemplateFn = useServerFn(saveMappingTemplate);
  const previewFn = useServerFn(previewCarrierSync);
  const applyFn = useServerFn(applyCarrierSync);

  async function handleFile(f: File) {
    if (!f.name.match(/\.(csv|xls|xlsx)$/i)) {
      toast.error("Upload a .csv, .xls, or .xlsx file");
      return;
    }
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
    if (!json.length) {
      toast.error("No data rows found in the file");
      return;
    }
    const headers = Object.keys(json[0]);
    const rows = json.map((r) => Object.fromEntries(headers.map((h) => [h, String(r[h] ?? "").trim()])));
    setFile({ name: f.name, headers, rows });

    // Auto-detect columns, then let a saved template for this carrier win.
    let map: ColumnMap = {
      policy_number: guessColumn(headers, [/policy\s*(#|no|num)/i, /^policy$/i, /contract\s*(#|no|num)/i, /cert(ificate)?\s*(#|no)/i]),
      status: guessColumn(headers, [/status/i, /state\s*of\s*policy/i]),
      client_name: guessColumn(headers, [/insured/i, /client/i, /owner/i, /^name$/i, /full\s*name/i]),
    };
    if (carrierId) {
      try {
        const { template } = await templateFn({ data: { carrier_id: carrierId } });
        if (template?.column_map) {
          const t = template.column_map as Record<string, string>;
          map = {
            policy_number: headers.includes(t.policy_number) ? t.policy_number : map.policy_number,
            status: headers.includes(t.status) ? t.status : map.status,
            client_name: headers.includes(t.client_name) ? t.client_name : map.client_name,
          };
          if (template.status_map) setStatusOverrides(template.status_map as Record<string, string>);
          toast.success("Loaded your saved mapping for this carrier");
        }
      } catch { /* no template — fine */ }
    }
    setColMap(map);
    setStep(1);
  }

  const runPreview = useMutation({
    mutationFn: async () => {
      const rows = file!.rows
        .map((r) => ({
          policy_number: r[colMap.policy_number] ?? "",
          status_raw: r[colMap.status] ?? "",
          client_name: colMap.client_name ? r[colMap.client_name] : undefined,
        }))
        .filter((r) => r.policy_number && r.status_raw);
      return previewFn({ data: { carrier_id: carrierId, rows, status_overrides: statusOverrides } });
    },
    onSuccess: (p) => { setPreview(p); setStep(2); },
    onError: (e: any) => toast.error(e?.message ?? "Preview failed"),
  });

  const runApply = useMutation({
    mutationFn: async () =>
      applyFn({
        data: {
          carrier_id: carrierId,
          file_name: file!.name,
          total_rows: preview!.total_rows,
          unmatched: preview!.unmatched_rows.length,
          updates: preview!.updates.map((u) => ({ policy_id: u.policy_id, new_status: u.new_status })),
        },
      }),
    onSuccess: async (r: any) => {
      setResult({ updated: r.updated, skipped: r.skipped });
      setStep(3);
      qc.invalidateQueries({ queryKey: ["carrier-sync-logs"] });
      qc.invalidateQueries({ queryKey: ["bob"] });
      if (saveTemplate) {
        try {
          await saveTemplateFn({ data: { carrier_id: carrierId, column_map: colMap as any, status_map: statusOverrides } });
        } catch { /* non-fatal */ }
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync failed"),
  });

  const carrierName = useMemo(
    () => (carriers ?? []).find((c: any) => c.id === carrierId)?.name ?? "",
    [carriers, carrierId],
  );

  const mapReady = colMap.policy_number && colMap.status;

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand
          title="Carrier Book Sync"
          subtitle="Upload your weekly carrier book extract — Agent Cloud matches every policy and updates it to the carrier-accurate status."
          actions={<Button asChild variant="outline" size="sm"><Link to="/book-of-business"><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Book of Business</Link></Button>}
        />

        <StepBar current={step} />

        {/* Step 0: Upload */}
        {step === 0 && (
          <>
            <Panel title="1 · Choose Carrier & Upload">
              <div className="space-y-4">
                <div className="max-w-sm">
                  <div className="text-sm font-medium mb-1.5">Carrier</div>
                  <Select value={carrierId} onValueChange={setCarrierId}>
                    <SelectTrigger><SelectValue placeholder="Select the carrier this file came from" /></SelectTrigger>
                    <SelectContent>
                      {(carriers ?? []).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label
                  className={cn(
                    "block rounded-[var(--radius)] border-2 border-dashed p-10 text-center transition-colors",
                    carrierId ? "border-border hover:border-primary/50 cursor-pointer bg-surface-2/50" : "border-border-soft opacity-50 pointer-events-none",
                  )}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
                >
                  <input
                    type="file" className="hidden" accept=".csv,.xls,.xlsx"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
                  />
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                  <div className="mt-2 text-sm font-medium">{carrierId ? "Drop your carrier export here, or click to choose" : "Select a carrier first"}</div>
                  <div className="text-xs text-muted-foreground mt-1">.csv, .xls, or .xlsx — the book-of-business extract from the carrier portal</div>
                </label>
              </div>
            </Panel>

            <Panel title="Recent Syncs">
              {(logs?.rows?.length ?? 0) === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No syncs yet. Upload your first carrier extract above — from then on it's a weekly one-click habit.
                </div>
              ) : (
                <div className="divide-y divide-border-soft">
                  {logs!.rows.map((l: any) => (
                    <div key={l.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-medium truncate">{l.carriers?.name ?? "Carrier"}</span>
                      <span className="text-muted-foreground truncate text-xs">{l.file_name}</span>
                      <span className="ml-auto tnum text-xs shrink-0">
                        <span className="text-success font-semibold">{l.updated} updated</span>
                        {l.unmatched > 0 && <span className="text-warning"> · {l.unmatched} unmatched</span>}
                      </span>
                      <span className="text-xs text-text-dim tnum shrink-0">{new Date(l.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </>
        )}

        {/* Step 1: Map columns */}
        {step === 1 && file && (
          <Panel title={`2 · Map Columns — ${file.name}`}>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Tell Agent Cloud which columns hold each field. Detected automatically where possible — <span className="tnum">{file.rows.length.toLocaleString()}</span> rows found.
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                {([
                  ["policy_number", "Policy Number *"],
                  ["status", "Policy Status *"],
                  ["client_name", "Client / Insured Name"],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <div className="text-sm font-medium mb-1.5">{label}</div>
                    <Select value={colMap[key] || "__none"} onValueChange={(v) => setColMap((m) => ({ ...m, [key]: v === "__none" ? "" : v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— not in file —</SelectItem>
                        {file.headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              {mapReady && (
                <div className="rounded-[var(--radius)] border border-border-soft bg-surface-2 p-3 text-xs overflow-x-auto">
                  <div className="font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-2">Sample (first 3 rows)</div>
                  {file.rows.slice(0, 3).map((r, i) => (
                    <div key={i} className="flex gap-4 py-1 border-b border-border-soft last:border-0">
                      <span className="tnum font-medium">{r[colMap.policy_number]}</span>
                      <span className="text-warning">{r[colMap.status]}</span>
                      {colMap.client_name && <span className="text-muted-foreground">{r[colMap.client_name]}</span>}
                    </div>
                  ))}
                </div>
              )}

              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={saveTemplate} onCheckedChange={(v) => setSaveTemplate(!!v)} />
                Remember this mapping for {carrierName || "this carrier"}
              </label>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(0)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
                <Button onClick={() => runPreview.mutate()} disabled={!mapReady || runPreview.isPending}>
                  {runPreview.isPending ? "Matching…" : "Preview Changes"} <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </Panel>
        )}

        {/* Step 2: Preview */}
        {step === 2 && preview && (
          <>
            {preview.unknown_statuses.length > 0 && (
              <Panel title="Unrecognized Carrier Statuses">
                <p className="text-sm text-muted-foreground mb-3">
                  Map these carrier status labels to Agent Cloud statuses (or ignore them), then re-run the preview.
                </p>
                <div className="space-y-2">
                  {preview.unknown_statuses.map((s) => (
                    <div key={s} className="flex items-center gap-3">
                      <Badge variant="warning" className="shrink-0">{s}</Badge>
                      <ArrowRight className="h-3 w-3 text-text-dim shrink-0" />
                      <Select
                        value={statusOverrides[s.toLowerCase()] ?? ""}
                        onValueChange={(v) => setStatusOverrides((o) => ({ ...o, [s.toLowerCase()]: v }))}
                      >
                        <SelectTrigger className="max-w-[220px]"><SelectValue placeholder="Choose status…" /></SelectTrigger>
                        <SelectContent>
                          {POLICY_STATUS_VALUES.map((v) => (
                            <SelectItem key={v} value={v}>{STATUS_LABEL[v] ?? v}</SelectItem>
                          ))}
                          <SelectItem value="__ignore">Ignore these rows</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => runPreview.mutate()} disabled={runPreview.isPending}>
                  <RefreshCw className={cn("h-3.5 w-3.5 mr-1", runPreview.isPending && "animate-spin")} /> Re-run preview
                </Button>
              </Panel>
            )}

            <Panel
              title={`3 · Preview — ${preview.updates.length} change${preview.updates.length === 1 ? "" : "s"}`}
              action={<span className="text-xs text-muted-foreground tnum">{preview.no_change} already accurate · {preview.unmatched_rows.length} unmatched</span>}
            >
              {preview.updates.length === 0 ? (
                <div className="py-8 text-center space-y-1">
                  <CheckCircle2 className="h-8 w-8 mx-auto text-success" />
                  <div className="font-medium">Your book already matches the carrier.</div>
                  <p className="text-sm text-muted-foreground">Nothing to update from this file.</p>
                </div>
              ) : (
                <div className="max-h-[420px] overflow-y-auto -mx-2">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                        <th className="px-2 py-2">Policy #</th>
                        <th className="px-2 py-2">Client</th>
                        <th className="px-2 py-2">Agent</th>
                        <th className="px-2 py-2">Status Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.updates.map((u) => (
                        <tr key={u.policy_id} className="border-t border-border-soft">
                          <td className="px-2 py-2 tnum font-medium">{u.policy_number}</td>
                          <td className="px-2 py-2">
                            {u.client_name}
                            {u.name_mismatch && (
                              <span title="Client name in the file doesn't match this policy's client">
                                <AlertTriangle className="inline h-3.5 w-3.5 text-warning ml-1.5 -mt-0.5" />
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-muted-foreground">{u.agent_name}</td>
                          <td className="px-2 py-2">
                            <span className="text-muted-foreground">{STATUS_LABEL[u.current_status] ?? u.current_status}</span>
                            <ArrowRight className="inline h-3 w-3 mx-1.5 text-text-dim" />
                            <Badge variant={u.new_status === "active" ? "success" : u.new_status.startsWith("lapse") ? "warning" : "gold"}>
                              {STATUS_LABEL[u.new_status] ?? u.new_status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {preview.unmatched_rows.length > 0 && (
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    {preview.unmatched_rows.length} rows didn't match any policy in your book
                  </summary>
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-[var(--radius)] border border-border-soft bg-surface-2 p-2 text-xs space-y-1">
                    {preview.unmatched_rows.map((r, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="tnum">{r.policy_number}</span>
                        <span className="text-warning">{r.status_raw}</span>
                        {r.client_name && <span className="text-muted-foreground">{r.client_name}</span>}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Usually policies not yet entered in Agent Cloud, or written outside your hierarchy. Nothing is changed for these.
                  </p>
                </details>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
                <Button
                  onClick={() => runApply.mutate()}
                  disabled={preview.updates.length === 0 || runApply.isPending}
                >
                  {runApply.isPending ? "Applying…" : `Apply ${preview.updates.length} Update${preview.updates.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            </Panel>
          </>
        )}

        {/* Step 3: Done */}
        {step === 3 && result && (
          <Panel>
            <div className="py-10 text-center space-y-3">
              <div className="mx-auto h-14 w-14 rounded-full bg-success/10 grid place-items-center">
                <CheckCircle2 className="h-7 w-7 text-success" />
              </div>
              <div className="font-display font-bold text-xl" style={{ fontFamily: "var(--font-display)" }}>
                Book synced with {carrierName}
              </div>
              <p className="text-sm text-muted-foreground tnum">
                {result.updated} policies updated to carrier-accurate statuses{result.skipped > 0 ? ` · ${result.skipped} skipped` : ""}.
                Lapse-pending policies now appear in your at-risk queue automatically.
              </p>
              <div className="flex gap-2 justify-center pt-1">
                <Button asChild><Link to="/book-of-business">View Book of Business</Link></Button>
                <Button
                  variant="outline"
                  onClick={() => { setStep(0); setFile(null); setPreview(null); setResult(null); setStatusOverrides({}); }}
                >
                  Sync Another Carrier
                </Button>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}
