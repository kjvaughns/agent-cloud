import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CompGridMatrix, toMatrix, fromMatrix, type MatrixState } from "@/components/contracting/comp-grid-matrix";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Upload, Trash2, Loader2, Sparkles, Check, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  listMyGrids, extractGrid, saveGrid, deleteMyGrid, type GridRow,
} from "@/lib/comp-grid.functions";
import { addCarrier } from "@/lib/contracting.functions";
import { extractDocument, truncationNotice } from "@/lib/document-extract";

/** Sentinel for the "add a carrier" row in the carrier Select. */
const NEW_CARRIER = "__new__";

/**
 * The page chrome, at module scope on purpose.
 *
 * This used to be declared inside ManageGridsPage. A component defined during
 * render gets a new function identity every render, so React treats it as a
 * different component type, unmounts the whole subtree and mounts a fresh
 * one — which threw away the focused input on every keystroke. Typing a rate
 * put the caret out of the box after one digit.
 */
function Wrap({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  if (embedded) return <div className="flex flex-col gap-[var(--gap)]">{children}</div>;
  return (
    <PageShell>
      <div className="max-w-[1100px] mx-auto flex flex-col gap-[var(--gap)]">{children}</div>
    </PageShell>
  );
}

export const Route = createFileRoute("/_authenticated/contracting/comp-grids-manage")({
  // Comp grids moved into Contracting Operations, beside the comp levels they
  // describe. Redirect rather than delete: this path is bookmarked and
  // referenced by the setup checklist.
  beforeLoad: () => {
    throw redirect({ to: "/contracting-ops/compensation", search: { tab: "grids" } });
  },
});

/**
 * Rendered as the Grids tab of Contracting → Compensation. `embedded` drops
 * the page chrome so it does not nest a second shell inside that page.
 */
export function ManageGridsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyGrids);
  const { data, isLoading } = useQuery({ queryKey: ["comp-grids"], queryFn: () => listFn() });

  const [carrierId, setCarrierId] = useState("");
  const [addingCarrier, setAddingCarrier] = useState(false);
  const [newCarrierName, setNewCarrierName] = useState("");
  const [rows, setRows] = useState<GridRow[]>([]);
  // The matrix is what a person edits; `rows` is what the server stores. Kept
  // in step here rather than pivoting on every keystroke inside the table.
  const [matrix, setMatrix] = useState<MatrixState>(() => toMatrix([]));
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [source, setSource] = useState<"manual" | "ai_extracted">("manual");
  const [reading, setReading] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);

  const extractFn = useServerFn(extractGrid);
  const saveFn = useServerFn(saveGrid);
  const delFn = useServerFn(deleteMyGrid);
  const addCarrierFn = useServerFn(addCarrier);

  const carriers = (data as any)?.carriers ?? [];
  const grids = (data as any)?.grids ?? [];
  const assignedLevels = (data as any)?.assignedLevels ?? [];

  async function onFile(file: File) {
    setReading(true);
    setNotes(null);
    try {
      // Every page, not just the first. A rate card that runs to three pages
      // used to be read from page one and then saved with a mode that clears
      // the carrier — so the products on the pages nobody read disappeared.
      const doc = await extractDocument(file, { prefer: "image", maxPages: 8 });
      const notice = truncationNotice(doc);
      if (notice) toast.warning(notice);
      const out: any = await extractFn({
        data: {
          images: doc.images,
          text: doc.text || null,
          file_name: file.name,
          carrier_id: carrierId || null,
          carrier_name: carriers.find((c: any) => c.id === carrierId)?.name ?? null,
        },
      });
      if (!out.rows?.length) {
        toast.error("Couldn't read any rows from that file");
      } else {
        setRows(out.rows);
        setMatrix(toMatrix(out.rows));
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
      setRows([]);
      setMatrix(toMatrix([]));
      setUploadId(null);
      setSource("manual");
      setNotes(null);
      qc.invalidateQueries({ queryKey: ["comp-grids"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't save the grid"),
  });

  /**
   * Open an existing grid in the editor.
   *
   * A shared default loads exactly the same way; saving it writes a row with
   * this agency's organization_id, so the copy happens on save rather than on
   * click and nothing another agency reads is touched.
   */
  function loadGrid(g: any) {
    setCarrierId(g.carrier_id);
    const rows: GridRow[] = (g.rows ?? []).map((r: any) => ({
      product_name: r.product_name,
      level_name: r.level_name,
      year_1_pct: r.year_1_pct ?? 0,
      years_2_5_pct: r.years_2_5_pct,
      years_6_plus_pct: r.years_6_plus_pct,
      age_group_min: r.age_group_min ?? null,
      age_group_max: r.age_group_max ?? null,
    }));
    setRows(rows);
    setMatrix(toMatrix(rows));
    setSource("manual");
    setUploadId(null);
    setNotes(g.owned ? null : "This is the shared default. Saving creates your agency's own version of it.");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const addCarrierMut = useMutation({
    mutationFn: (name: string) => addCarrierFn({ data: { name } }),
    onSuccess: async (r: any) => {
      toast.success("Carrier added");
      setAddingCarrier(false);
      setNewCarrierName("");
      await qc.invalidateQueries({ queryKey: ["comp-grids"] });
      // Select it, so the next thing you do is build its grid rather than
      // hunt for the name you just typed.
      if (r?.id) setCarrierId(r.id);
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't add that carrier"),
  });

  const remove = useMutation({
    mutationFn: (cid: string) => delFn({ data: { carrier_id: cid } }),
    onSuccess: () => { toast.success("Your grid was removed"); qc.invalidateQueries({ queryKey: ["comp-grids"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't remove it"),
  });

  const valid = carrierId && rows.some((r) => r.product_name.trim() && r.level_name.trim());

  return (
    <Wrap embedded={embedded}>
        {!embedded && (
          <HeroBand
            title="Commission Grids"
            subtitle="Your contract levels drive every payout forecast — keep them current"
          />
        )}

        <Panel title="Add or update a carrier grid">
          <div className="grid gap-4 sm:grid-cols-[260px_1fr] items-start">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Carrier</label>
                <Select
                  value={carrierId}
                  onValueChange={(v) => (v === NEW_CARRIER ? setAddingCarrier(true) : setCarrierId(v))}
                >
                  <SelectTrigger><SelectValue placeholder="Select carrier…" /></SelectTrigger>
                  <SelectContent>
                    {carriers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    {/* The catalogue does not have every carrier, and an
                        agency writing one that isn't listed had nowhere to
                        put its grid. */}
                    <SelectItem value={NEW_CARRIER}>+ Add a carrier…</SelectItem>
                  </SelectContent>
                </Select>

                {addingCarrier && (
                  <div className="mt-2 space-y-2 rounded-lg border border-primary/30 bg-surface-2 p-2.5">
                    <Input
                      value={newCarrierName}
                      onChange={(e) => setNewCarrierName(e.target.value)}
                      placeholder="Carrier name"
                      className="h-8 text-xs"
                      autoFocus
                    />
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Added for your agency only — it will not appear in anyone else's carrier list.
                    </p>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm" className="h-7 text-xs"
                        disabled={!newCarrierName.trim() || addCarrierMut.isPending}
                        onClick={() => addCarrierMut.mutate(newCarrierName.trim())}
                      >
                        {addCarrierMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => { setAddingCarrier(false); setNewCarrierName(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
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
                    {reading ? "Reading the grid…" : "PDF, photo, screenshot or spreadsheet"}
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,image/*,.csv,.xlsx,.xls"
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

              <CompGridMatrix
                value={matrix}
                onChange={(next) => { setMatrix(next); setRows(fromMatrix(next)); }}
                assignedLevels={assignedLevels}
              />

              <div className="mt-3 flex flex-wrap gap-2">
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
                  {/* Clicking loads it into the editor above. This list used
                      to be read-only, so a carrier that already had a grid
                      was the one carrier you could not change — which is
                      backwards, since those are the ones worth changing. */}
                  <button
                    type="button"
                    onClick={() => loadGrid(g)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="text-sm font-medium hover:underline">{g.carrier_name}</span>
                    <span className="ml-2 text-xs text-muted-foreground tnum">
                      {g.rows.length} rate{g.rows.length === 1 ? "" : "s"}
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    <Badge variant={g.owned ? "gold" : "secondary"} className="text-[10px]">
                      {g.owned ? "Your agency" : "Shared default"}
                    </Badge>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => loadGrid(g)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                    </Button>
                    {g.owned ? (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => remove.mutate(g.carrier_id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      // A shared default belongs to the platform. Deleting it
                      // would take it from every other agency, so editing
                      // takes a copy instead — which is what saving does.
                      <span className="w-7" aria-hidden />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
    </Wrap>
  );
}
