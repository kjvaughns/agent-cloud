import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Upload, Plus, Trash2, Loader2, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  listMyGrids, extractGridFromImage, saveGrid, deleteMyGrid, type GridRow,
} from "@/lib/comp-grid.functions";
import { fileToImageDataUrl } from "@/lib/file-to-image";

export const Route = createFileRoute("/_authenticated/contracting/comp-grids-manage")({
  head: () => ({ meta: [{ title: "Manage Comp Grids — Agent Cloud" }] }),
  component: ManageGridsPage,
});

const BLANK: GridRow = {
  product_name: "", level_name: "", year_1_pct: 0,
  years_2_5_pct: null, years_6_plus_pct: null,
  age_group_min: null, age_group_max: null,
};

function ManageGridsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyGrids);
  const { data, isLoading } = useQuery({ queryKey: ["comp-grids"], queryFn: () => listFn() });

  const [carrierId, setCarrierId] = useState("");
  const [rows, setRows] = useState<GridRow[]>([{ ...BLANK }]);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [source, setSource] = useState<"manual" | "ai_extracted">("manual");
  const [reading, setReading] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);

  const extractFn = useServerFn(extractGridFromImage);
  const saveFn = useServerFn(saveGrid);
  const delFn = useServerFn(deleteMyGrid);

  const carriers = (data as any)?.carriers ?? [];
  const grids = (data as any)?.grids ?? [];

  async function onFile(file: File) {
    setReading(true);
    setNotes(null);
    try {
      // PDFs are rasterized in the browser; the model reads a page image.
      const image = await fileToImageDataUrl(file);
      const out: any = await extractFn({
        data: {
          image,
          file_name: file.name,
          carrier_id: carrierId || null,
          carrier_name: carriers.find((c: any) => c.id === carrierId)?.name ?? null,
        },
      });
      if (!out.rows?.length) {
        toast.error("Couldn't read any rows from that file");
      } else {
        setRows(out.rows);
        setUploadId(out.upload_id);
        setSource("ai_extracted");
        setNotes(out.notes ?? null);
        const conf = out.confidence == null ? null : Math.round(out.confidence * 100);
        toast.success(
          `Read ${out.rows.length} row${out.rows.length === 1 ? "" : "s"}` +
          (conf != null ? ` · ${conf}% confidence` : ""),
        );
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't read that file");
    } finally {
      setReading(false);
    }
  }

  const save = useMutation({
    mutationFn: () => saveFn({
      data: {
        carrier_id: carrierId,
        rows: rows.filter((r) => r.product_name.trim() && r.level_name.trim()),
        source,
        upload_id: uploadId,
      },
    }),
    onSuccess: (r: any) => {
      toast.success(`Saved ${r.count} rows`);
      setRows([{ ...BLANK }]);
      setUploadId(null);
      setSource("manual");
      setNotes(null);
      qc.invalidateQueries({ queryKey: ["comp-grids"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't save the grid"),
  });

  const remove = useMutation({
    mutationFn: (cid: string) => delFn({ data: { carrier_id: cid } }),
    onSuccess: () => { toast.success("Your grid was removed"); qc.invalidateQueries({ queryKey: ["comp-grids"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't remove it"),
  });

  const setRow = (i: number, patch: Partial<GridRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const valid = carrierId && rows.some((r) => r.product_name.trim() && r.level_name.trim());

  return (
    <PageShell>
      <div className="max-w-[1100px] mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand
          title="Commission Grids"
          subtitle="Your contract levels drive every payout forecast — keep them current"
        />

        <Panel title="Add or update a carrier grid">
          <div className="grid gap-4 sm:grid-cols-[260px_1fr] items-start">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Carrier</label>
                <Select value={carrierId} onValueChange={setCarrierId}>
                  <SelectTrigger><SelectValue placeholder="Select carrier…" /></SelectTrigger>
                  <SelectContent>
                    {carriers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Upload the grid
                </label>
                <label
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-5 text-center transition-colors",
                    "hover:border-primary/50 hover:bg-surface-2",
                    reading && "pointer-events-none opacity-60",
                  )}
                >
                  {reading
                    ? <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    : <Upload className="h-5 w-5 text-muted-foreground" />}
                  <span className="text-xs text-muted-foreground">
                    {reading ? "Reading the grid…" : "PDF, photo or screenshot"}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ""; }}
                  />
                </label>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  Nothing is saved until you review it below. Check the numbers — a wrong rate
                  here skews every forecast.
                </p>
              </div>
            </div>

            <div className="min-w-0">
              {source === "ai_extracted" && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/[0.05] px-3 py-2">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <p className="text-xs text-muted-foreground">
                    Read from your upload. {notes ? notes : "Edit anything that looks off, then save."}
                  </p>
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2">
                    <tr>
                      {["Product", "Level", "Yr 1 %", "Yr 2–5 %", "Yr 6+ %", ""].map((h) => (
                        <th key={h} className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-border-soft">
                        <td className="p-1"><Input className="h-8 text-xs" value={r.product_name} onChange={(e) => setRow(i, { product_name: e.target.value })} placeholder="Final Expense" /></td>
                        <td className="p-1"><Input className="h-8 text-xs" value={r.level_name} onChange={(e) => setRow(i, { level_name: e.target.value })} placeholder="GA" /></td>
                        <td className="p-1"><Input className="h-8 text-xs tnum" type="number" value={r.year_1_pct} onChange={(e) => setRow(i, { year_1_pct: Number(e.target.value) })} /></td>
                        <td className="p-1"><Input className="h-8 text-xs tnum" type="number" value={r.years_2_5_pct ?? ""} onChange={(e) => setRow(i, { years_2_5_pct: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                        <td className="p-1"><Input className="h-8 text-xs tnum" type="number" value={r.years_6_plus_pct ?? ""} onChange={(e) => setRow(i, { years_6_plus_pct: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                        <td className="p-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setRows((rs) => [...rs, { ...BLANK }])}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add row
                </Button>
                <Button size="sm" onClick={() => save.mutate()} disabled={!valid || save.isPending}>
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-1 h-3.5 w-3.5" /> Save grid</>}
                </Button>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Grids in use">
          {isLoading ? (
            <Skeleton className="h-32" />
          ) : grids.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No grids yet.</p>
          ) : (
            <ul className="divide-y divide-border-soft -my-1">
              {grids.map((g: any) => (
                <li key={g.carrier_id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <span className="text-sm font-medium">{g.carrier_name}</span>
                    <span className="ml-2 text-xs text-muted-foreground tnum">{g.rows.length} rows</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={g.owned ? "gold" : "secondary"} className="text-[10px]">
                      {g.owned ? "Your agency" : "Shared default"}
                    </Badge>
                    {g.owned && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => remove.mutate(g.carrier_id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
