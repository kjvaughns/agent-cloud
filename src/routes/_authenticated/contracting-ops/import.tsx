import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Download, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@/hooks/use-server-fn";
import {
  IMPORT_COLUMNS, IMPORT_KINDS, importContractingRecords, type ImportKind,
} from "@/lib/contracting-import.functions";
import { toCsv } from "@/lib/contracting-ops/packet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contracting-ops/import")({
  component: ImportPage,
  head: () => ({ meta: [{ title: "Import | Agent Cloud" }] }),
});

const KIND_LABELS: Record<ImportKind, string> = {
  writing_numbers: "Writing numbers",
  licenses: "Licences",
  carriers: "Carriers",
};

/**
 * Minimal CSV parser.
 *
 * Handles quoted fields containing commas, quotes and newlines, which is the
 * only part of the format that actually bites — a naive split on comma
 * silently corrupts any row with a company name in it.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function ImportPage() {
  const qc = useQueryClient();
  const importFn = useServerFn(importContractingRecords);

  const [kind, setKind] = useState<ImportKind>("writing_numbers");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<any | null>(null);
  const [fileName, setFileName] = useState("");

  const columns = IMPORT_COLUMNS[kind];

  const run = useMutation({
    mutationFn: (commit: boolean) =>
      importFn({ data: { kind, commit, rows: mapped } }),
    onSuccess: (r: any) => {
      setPreview(r);
      if (!r.dryRun) {
        toast.success(`Imported ${r.summary.written ?? 0} of ${r.summary.total} rows`);
        qc.invalidateQueries({ queryKey: ["contracting-ops"] });
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Import failed"),
  });

  // Rows keyed by our column names, built from the user's mapping.
  const mapped = useMemo(() => {
    if (!dataRows.length) return [];
    return dataRows.map((r) => {
      const out: Record<string, string> = {};
      for (const col of columns) {
        const sourceIdx = mapping[col.key];
        if (sourceIdx === undefined || sourceIdx === "") continue;
        out[col.key] = r[Number(sourceIdx)] ?? "";
      }
      return out;
    });
  }, [dataRows, mapping, columns]);

  const onFile = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      toast.error("That file needs a header row and at least one data row.");
      return;
    }
    const head = rows[0].map((h) => h.trim());
    setFileName(file.name);
    setHeaders(head);
    setDataRows(rows.slice(1));
    setPreview(null);

    // Guess the mapping from header names. Saves the common case entirely and
    // costs nothing when it guesses wrong — every guess is editable below.
    const guess: Record<string, string> = {};
    for (const col of columns) {
      const idx = head.findIndex((h) => {
        const n = h.toLowerCase().replace(/[^a-z]/g, "");
        const k = col.key.replace(/_/g, "");
        const l = col.label.toLowerCase().replace(/[^a-z]/g, "");
        return n === k || n === l || n.includes(k) || k.includes(n);
      });
      if (idx >= 0) guess[col.key] = String(idx);
    }
    setMapping(guess);
  };

  const missingRequired = columns.filter((c) => c.required && !mapping[c.key]);

  const downloadTemplate = () => {
    const csv = toCsv(columns.map((c) => c.label), [columns.map(() => "")]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${kind}-template.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setHeaders([]); setDataRows([]); setMapping({}); setPreview(null); setFileName("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {IMPORT_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => { setKind(k); reset(); }}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
              kind === k ? "border-primary/50 bg-primary/10 text-primary"
                         : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
        <Button variant="outline" size="sm" className="ml-auto" onClick={downloadTemplate}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Template CSV
        </Button>
      </div>

      <Panel title={`Import ${KIND_LABELS[kind].toLowerCase()}`}>
        {headers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-2/30 px-6 py-10 text-center">
            <Upload className="mx-auto h-6 w-6 text-text-dim" />
            <p className="mt-3 text-sm font-semibold text-foreground">Choose a CSV file</p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
              Any column order works — you map them in the next step. Download the template above if
              you would rather start from the expected shape.
            </p>
            <label className="mt-4 inline-block">
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
              />
              <span className="inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-gold-foreground">
                Select file
              </span>
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-foreground">{fileName}</span>
              <span className="tnum text-xs text-muted-foreground">{dataRows.length} rows</span>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>
                <X className="mr-1.5 h-3.5 w-3.5" /> Start over
              </Button>
            </div>

            <div>
              <Label>Match your columns</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {columns.map((col) => (
                  <div key={col.key} className="flex items-center gap-2">
                    <span className={cn(
                      "w-40 shrink-0 truncate text-xs",
                      col.required ? "font-semibold text-foreground" : "text-muted-foreground",
                    )}>
                      {col.label}{col.required && <span className="text-destructive"> *</span>}
                    </span>
                    <select
                      value={mapping[col.key] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [col.key]: e.target.value }))}
                      className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-xs"
                    >
                      <option value="">Not in my file</option>
                      {headers.map((h, i) => <option key={i} value={String(i)}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {missingRequired.length > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  Still to match: {missingRequired.map((c) => c.label).join(", ")}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={run.isPending || missingRequired.length > 0}
                onClick={() => run.mutate(false)}
              >
                {run.isPending ? "Checking…" : "Check the file"}
              </Button>
              <Button
                size="sm"
                disabled={run.isPending || !preview?.dryRun || preview?.summary?.create === 0}
                onClick={() => run.mutate(true)}
              >
                {preview?.dryRun
                  ? `Import ${preview.summary.create} row${preview.summary.create === 1 ? "" : "s"}`
                  : "Import"}
              </Button>
            </div>
            <p className="text-[11px] text-text-dim">
              Nothing is written until you import. The check runs the whole file first so you see
              every problem before any row lands.
            </p>
          </div>
        )}
      </Panel>

      {preview && (
        <Panel title={preview.dryRun ? "What this file will do" : "Import result"}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Rows", preview.summary.total, "neutral"],
              [preview.dryRun ? "Will add" : "Added", preview.dryRun ? preview.summary.create : (preview.summary.written ?? 0), "success"],
              ["Skipped", preview.summary.skip, "neutral"],
              ["Problems", preview.summary.error, preview.summary.error > 0 ? "danger" : "neutral"],
            ].map(([label, value, tone]) => (
              <div key={String(label)} className={cn(
                "rounded-lg border p-3",
                tone === "success" && "border-success/30",
                tone === "danger" && "border-destructive/30",
                tone === "neutral" && "border-border",
              )}>
                <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{String(label)}</div>
                <div className="tnum mt-1 text-xl font-bold text-foreground">{String(value)}</div>
              </div>
            ))}
          </div>

          {preview.results.some((r: any) => r.status !== "create") && (
            <ul className="mt-4 max-h-72 divide-y divide-border-soft overflow-y-auto rounded-lg border border-border">
              {preview.results
                .filter((r: any) => r.status !== "create")
                .map((r: any) => (
                  <li key={r.row} className="flex items-start gap-2 px-3 py-2 text-xs">
                    <span className="tnum w-10 shrink-0 text-text-dim">Row {r.row}</span>
                    {r.status === "error"
                      ? <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                      : <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-dim" />}
                    <span className={r.status === "error" ? "text-destructive" : "text-muted-foreground"}>
                      {r.message}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
