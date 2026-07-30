import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { UploadCloud, Loader2, Check, X, Sparkles, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  createIntakeBatch, analyzeIntakeDoc, listIntake, setIntakeStatus,
  DOC_TYPE_LABEL, type IntakeDoc,
} from "@/lib/intake.functions";
import { fileToImageDataUrl, fileToText } from "@/lib/file-to-image";

export const Route = createFileRoute("/_authenticated/intake")({
  head: () => ({ meta: [{ title: "Document Intake — Agent Cloud" }] }),
  component: IntakePage,
});

const STATUS_STYLE: Record<string, { label: string; variant: any }> = {
  queued: { label: "Queued", variant: "secondary" },
  analyzing: { label: "Reading", variant: "info" },
  needs_review: { label: "Review", variant: "warning" },
  applied: { label: "Done", variant: "success" },
  dismissed: { label: "Dismissed", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
};

function IntakePage() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const batchFn = useServerFn(createIntakeBatch);
  const analyzeFn = useServerFn(analyzeIntakeDoc);
  const listFn = useServerFn(listIntake);
  const statusFn = useServerFn(setIntakeStatus);

  const { data, isLoading } = useQuery({
    queryKey: ["intake"],
    queryFn: () => listFn({ data: { status: "all" } }),
  });
  const docs = ((data as any)?.documents ?? []) as IntakeDoc[];

  /**
   * Upload, then analyze one file at a time.
   *
   * Sequential rather than parallel on purpose: a hundred concurrent vision
   * calls would hit the gateway's rate limit and fail most of the batch. This
   * is slower but finishes.
   */
  async function onFiles(files: FileList) {
    const list = Array.from(files).slice(0, 100);
    if (!list.length) return;

    setBusy(true);
    setProgress({ done: 0, total: list.length });

    try {
      const batch: any = await batchFn({
        data: {
          files: list.map((f) => ({
            file_name: f.name,
            mime_type: f.type || null,
            size_bytes: f.size,
          })),
        },
      });
      qc.invalidateQueries({ queryKey: ["intake"] });

      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const rec = batch.documents[i];
        if (!rec) continue;

        try {
          // Spreadsheets and text read far better as text than as a picture.
          const isText = /csv|text|json/.test(file.type) || /\.(csv|txt|tsv)$/i.test(file.name);
          const payload = isText
            ? { id: rec.id, text: await fileToText(file) }
            : { id: rec.id, image: await fileToImageDataUrl(file) };
          await analyzeFn({ data: payload });
        } catch {
          // analyzeIntakeDoc records its own failure; keep the batch moving.
        }

        setProgress({ done: i + 1, total: list.length });
        qc.invalidateQueries({ queryKey: ["intake"] });
      }

      toast.success(`Analyzed ${list.length} file${list.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
      setProgress(null);
      qc.invalidateQueries({ queryKey: ["intake"] });
    }
  }

  const mark = useMutation({
    mutationFn: (vars: { ids: string[]; status: "applied" | "dismissed" }) => statusFn({ data: vars }),
    onSuccess: () => { setSelected(new Set()); qc.invalidateQueries({ queryKey: ["intake"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't update"),
  });

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const review = docs.filter((d) => d.status === "needs_review");
  const failed = docs.filter((d) => d.status === "failed");

  return (
    <PageShell>
      <div className="max-w-[1100px] mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand
          title="Document Intake"
          subtitle="Drop in carrier reports and let Nova sort them out"
        />

        <div className="grid grid-cols-3 gap-[var(--gap)]">
          <Panel><StatTile label="Needs Review" value={String(review.length)} tone={review.length ? "gold" : undefined} /></Panel>
          <Panel><StatTile label="Processed" value={String(docs.filter((d) => d.status === "applied").length)} /></Panel>
          <Panel><StatTile label="Failed" value={String(failed.length)} tone={failed.length ? "red" : undefined} /></Panel>
        </div>

        <Panel>
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border p-10 text-center transition-colors",
              "hover:border-primary/50 hover:bg-surface-2",
              busy && "pointer-events-none opacity-60",
            )}
          >
            {busy ? (
              <>
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <span className="text-sm font-medium">
                  Reading {progress?.done ?? 0} of {progress?.total ?? 0}…
                </span>
                <div className="h-1.5 w-56 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${((progress?.done ?? 0) / Math.max(1, progress?.total ?? 1)) * 100}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <UploadCloud className="h-7 w-7 text-muted-foreground" />
                <span className="text-sm font-medium">Drop in your carrier reports</span>
                <span className="text-xs text-muted-foreground">
                  PDFs, spreadsheets, screenshots — up to 100 at a time
                </span>
              </>
            )}
            <input
              type="file"
              multiple
              accept="application/pdf,image/*,.csv,.txt,.tsv"
              className="hidden"
              onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.currentTarget.value = ""; }}
            />
          </label>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            Nova identifies each document and says what to do with it. Nothing is applied to your
            book until you approve it.
          </p>
        </Panel>

        {selected.size > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/[0.05] px-4 py-2.5">
            <span className="text-sm">{selected.size} selected</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => mark.mutate({ ids: [...selected], status: "dismissed" })}>
                <X className="mr-1 h-3.5 w-3.5" /> Dismiss
              </Button>
              <Button size="sm" onClick={() => mark.mutate({ ids: [...selected], status: "applied" })}>
                <Check className="mr-1 h-3.5 w-3.5" /> Mark handled
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : docs.length === 0 ? (
          <Panel>
            <div className="py-12 text-center space-y-2">
              <div className="font-medium">Nothing uploaded yet.</div>
              <p className="text-sm text-muted-foreground">
                Carrier statements, lapse reports, production summaries — drop them above.
              </p>
            </div>
          </Panel>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => {
              const st = STATUS_STYLE[d.status] ?? STATUS_STYLE.queued;
              const on = selected.has(d.id);
              const actionable = d.status === "needs_review";
              return (
                <Panel key={d.id} pad={false}>
                  <div className="flex items-start gap-3 p-4">
                    {actionable && (
                      <Checkbox className="mt-1" checked={on} onCheckedChange={() => toggle(d.id)} />
                    )}
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium break-all">{d.file_name}</span>
                        <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                        {d.doc_type && (
                          <Badge variant="secondary" className="text-[10px]">
                            {DOC_TYPE_LABEL[d.doc_type] ?? d.doc_type}
                          </Badge>
                        )}
                        {d.confidence != null && d.confidence < 0.6 && (
                          <Badge variant="warning" className="text-[10px]">low confidence</Badge>
                        )}
                      </div>

                      {d.summary && (
                        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{d.summary}</p>
                      )}

                      {d.suggested_action && (
                        <p className="mt-2 flex items-start gap-1.5 text-xs text-foreground">
                          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                          {d.suggested_action}
                        </p>
                      )}

                      {d.error && <p className="mt-1.5 text-xs text-destructive">{d.error}</p>}

                      <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        {d.carrier_name && <span>{d.carrier_name}</span>}
                        {d.period_label && <span>· {d.period_label}</span>}
                        <span>· {new Date(d.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
