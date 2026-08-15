import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CompGridMatrix, toMatrix, fromMatrix, mergeMatrix, type MatrixState } from "@/components/contracting/comp-grid-matrix";
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
import {
  extractDocument, truncationNotice, MAX_REQUEST_IMAGE_CHARS,
} from "@/lib/document-extract";
import {
  reviewGrid, canSaveGrid, reviewSummary, type ReviewRow,
} from "@/lib/carriers/grid-review";

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

/**
 * The comp-grid editor. Mounted as the Grids tab of Carrier Setup and as the
 * edit mode of the agent-facing grid reader; `embedded` drops the page chrome
 * so it does not nest a second shell inside the host page.
 */
export function ManageGridsPage({
  embedded = false,
  initialCarrierId,
}: { embedded?: boolean; initialCarrierId?: string } = {}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyGrids);
  const { data, isLoading } = useQuery({ queryKey: ["comp-grids"], queryFn: () => listFn() });

  // Opened from a carrier row, this arrives already pointed at that carrier.
  // The editor keeps its own picker so it still works standalone, but nobody
  // reaching it from a carrier should have to find that carrier again.
  const [carrierId, setCarrierId] = useState(initialCarrierId ?? "");
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
  // What the extraction thought of its own reading, kept so the review below
  // can say "check these" rather than only reporting it once in a toast.
  const [confidence, setConfidence] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const extractFn = useServerFn(extractGrid);
  const saveFn = useServerFn(saveGrid);
  const delFn = useServerFn(deleteMyGrid);
  const addCarrierFn = useServerFn(addCarrier);

  const carriers = (data as any)?.carriers ?? [];
  const grids = (data as any)?.grids ?? [];
  const assignedLevels = (data as any)?.assignedLevels ?? [];

  /**
   * Read one or more files into the grid.
   *
   * Several files, one extraction: a paper grid photographed page by page is
   * the normal phone case, and the model reads columns far better when it
   * sees every page in one call than when each photo is extracted alone and
   * the results glued together. All pages pool into a single `images[]`, up
   * to the extraction cap of 8, and anything past the cap is named rather
   * than silently dropped.
   *
   * And the result MERGES into the editor. `setRows(out.rows)` used to
   * replace the whole editor state, so uploading a second document — the
   * other comp level, the annuity addendum — discarded the first before the
   * server was even involved. That was half of "uploading a different level
   * changed my current one"; the other half was the save mode, fixed below.
   */
  async function onFiles(files: File[]) {
    if (!files.length) return;
    setReading(true);
    setNotes(null);
    try {
      const images: string[] = [];
      const texts: string[] = [];
      for (const file of files) {
        const doc = await extractDocument(file, { prefer: "image", maxPages: 8 });
        const notice = truncationNotice(doc);
        if (notice) toast.warning(`${file.name}: ${notice}`);
        if (doc.images?.length) images.push(...doc.images);
        if (doc.text) texts.push(doc.text);
      }
      if (images.length > 8) {
        toast.warning(`Reading the first 8 pages — ${images.length - 8} more were skipped. Upload the rest in a second batch; they'll merge in.`);
        images.length = 8;
      }

      // Pages go up in batches that stay inside what one request can carry.
      //
      // Everything used to be posted at once, so four photographed pages
      // produced a request the browser abandoned before it reached us — which
      // it reports as "Load failed", with no server error to show and nothing
      // naming the cause. Each batch merges into the editor as it lands, so a
      // failure on page four keeps pages one to three.
      const batches: string[][] = [];
      let current: string[] = [];
      let weight = 0;
      for (const img of images) {
        if (current.length && weight + img.length > MAX_REQUEST_IMAGE_CHARS) {
          batches.push(current);
          current = [];
          weight = 0;
        }
        current.push(img);
        weight += img.length;
      }
      if (current.length) batches.push(current);
      const text = texts.join("\n\n") || null;
      if (!batches.length && text) batches.push([]);

      const fileName = files.map((f) => f.name).join(", ").slice(0, 255);
      let readAny = false;
      let working = matrix;
      let addedLevels: string[] = [];
      let addedProducts = 0;
      let changedCells = 0;
      let lastConfidence: number | null = null;
      let lastNotes: string | null = null;
      let lastUploadId: string | null = null;

      for (let i = 0; i < batches.length; i++) {
        if (batches.length > 1) toast.info(`Reading pages ${i + 1} of ${batches.length}…`);
        const out: any = await extractFn({
          data: {
            images: batches[i].length ? batches[i] : null,
            // The text layer belongs with the first request only; repeating it
            // per batch would have the model read the same table twice.
            text: i === 0 ? text : null,
            file_name: fileName,
            carrier_id: carrierId || null,
            carrier_name: carriers.find((c: any) => c.id === carrierId)?.name ?? null,
          },
        });
        if (!out?.rows?.length) continue;
        readAny = true;
        const m = mergeMatrix(working, toMatrix(out.rows));
        working = m.merged;
        addedLevels = [...new Set([...addedLevels, ...m.addedLevels])];
        addedProducts += m.addedProducts;
        changedCells += m.changedCells;
        lastUploadId = out.upload_id ?? lastUploadId;
        lastNotes = out.notes ?? lastNotes;
        if (typeof out.confidence === "number") {
          lastConfidence = lastConfidence == null ? out.confidence : Math.min(lastConfidence, out.confidence);
        }
      }

      if (!readAny) {
        toast.error("Couldn't read any rows from that file. If it's a photo, make sure the whole table is in frame and in focus.");
      } else {
        setMatrix(working);
        setRows(fromMatrix(working));
        setUploadId(lastUploadId);
        setSource("ai_extracted");
        setNotes(lastNotes);
        setConfidence(lastConfidence);
        const conf = lastConfidence == null ? null : Math.round(lastConfidence * 100);
        const parts = [
          addedLevels.length ? `added level${addedLevels.length === 1 ? "" : "s"} ${addedLevels.join(", ")}` : null,
          addedProducts ? `${addedProducts} product row${addedProducts === 1 ? "" : "s"}` : null,
          `${changedCells} rate${changedCells === 1 ? "" : "s"}`,
        ].filter(Boolean);
        toast.success(
          `Read ${parts.join(" · ")}` + (conf != null ? ` · ${conf}% confidence` : ""),
        );
      }
    } catch (e: any) {
      // "Load failed" / "Failed to fetch" is the browser abandoning the
      // request, not an answer from us. Say what it actually means.
      const raw = String(e?.message ?? "");
      toast.error(
        /load failed|failed to fetch|networkerror/i.test(raw)
          ? "That upload was too large to send. Photograph one page at a time, or upload the PDF instead — each upload adds to the grid."
          : raw || "Couldn't read that file",
      );
    } finally {
      setReading(false);
    }
  }

  /** Only what the extractor can actually read. Anything else is named. */
  function acceptFiles(list: FileList | null) {
    const all = Array.from(list ?? []);
    if (!all.length) return;
    const ok = all.filter((f) =>
      f.type.startsWith("image/") ||
      f.type === "application/pdf" ||
      /\.(pdf|png|jpe?g|webp|heic|csv|tsv|xlsx?|txt)$/i.test(f.name));
    const rejected = all.filter((f) => !ok.includes(f));
    if (rejected.length) {
      toast.error(`Can't read ${rejected.map((f) => f.name).join(", ")} — use a PDF, a photo, or a spreadsheet.`);
    }
    if (ok.length) onFiles(ok);
  }

  const save = useMutation({
    mutationFn: () => saveFn({
      data: {
        carrier_id: carrierId,
        rows: rows.filter((r) => r.product_name.trim() && r.level_name.trim()),
        source,
        upload_id: uploadId,
        // Explicit, and now truthful. The default is also `replace`, but that
        // default is exactly how "upload the other level" wiped the first —
        // the editor held only the new document, and replace cleared the
        // carrier. The editor now loads the carrier's existing grid and
        // merges uploads into it, so the screen IS the whole grid, which is
        // the one situation replace is for.
        mode: "replace" as const,
      },
    }),
    onSuccess: (r: any) => {
      toast.success(`Saved ${r.count} rows`);
      // The saved grid stays on screen. Emptying it here was the other half of
      // "it didn't save" — the numbers were written and the table went blank,
      // which looks exactly like a discarded edit. Only the one-off extraction
      // state is cleared, because that upload has now been accepted.
      setUploadId(null);
      setSource("manual");
      setNotes(null);
      setConfidence(null);
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
      is_estimated: Boolean(r.is_estimated),
    }));
    setRows(rows);
    setMatrix(toMatrix(rows));
    setSource("manual");
    setUploadId(null);
    setNotes(g.owned ? null : "This is the shared default. Saving creates your agency's own version of it.");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * Picking a carrier brings up what that carrier already has.
   *
   * The save is `replace` — the screen is the whole grid — so the screen has
   * to actually hold the whole grid. Before this, picking Ethos gave you an
   * empty matrix, and saving an upload wiped whatever Ethos rows existed but
   * were never shown. An upload made before the carrier was picked survives:
   * it merges on top of the loaded grid rather than being thrown away.
   */
  function selectCarrier(id: string) {
    setCarrierId(id);
    const existing = grids.find((g: any) => g.carrier_id === id);
    const base = existing
      ? toMatrix((existing.rows ?? []).map((r: any) => ({
          product_name: r.product_name,
          level_name: r.level_name,
          year_1_pct: r.year_1_pct ?? 0,
          years_2_5_pct: r.years_2_5_pct,
          years_6_plus_pct: r.years_6_plus_pct,
          age_group_min: r.age_group_min ?? null,
          age_group_max: r.age_group_max ?? null,
          is_estimated: Boolean(r.is_estimated),
        })))
      : toMatrix([]);

    const unsavedUpload = source === "ai_extracted" && rows.length > 0;
    const next = unsavedUpload ? mergeMatrix(base, matrix).merged : base;
    setMatrix(next);
    setRows(fromMatrix(next));
    if (!unsavedUpload) {
      setSource("manual");
      setUploadId(null);
      setNotes(existing && !existing.owned
        ? "This is the shared default. Saving creates your agency's own version of it."
        : null);
    }
  }

  /**
   * Opened from a carrier row, load that carrier's grid.
   *
   * `initialCarrierId` only ever set the picker's value. The rows are loaded in
   * `selectCarrier`, which runs when somebody uses the dropdown — so arriving
   * from "Edit grid" showed an empty table for a carrier that had a full grid,
   * and because the save mode is `replace`, saving that screen would have
   * deleted rows it never displayed. Runs once per carrier, after the query
   * lands, and never over unsaved work.
   */
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!initialCarrierId || isLoading) return;
    if (loadedFor.current === initialCarrierId) return;
    loadedFor.current = initialCarrierId;
    selectCarrier(initialCarrierId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCarrierId, isLoading, grids.length]);

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

  /**
   * The review, which is the whole reason an upload is not saved straight to
   * the database.
   *
   * Extraction reads a photograph, and its failures — a rate read as 8 instead
   * of 80, an age band whose upper bound was cut off, two bands both claiming
   * age 70 — all look like ordinary numbers in a table. The rules live in
   * `grid-review` so the same checks can be run in a test; the confidence the
   * extraction reported is attached to every row it produced, because it was
   * reported for the reading as a whole.
   */
  const reviewRows: ReviewRow[] = rows.map((r) => ({
    product_name: r.product_name,
    level_name: r.level_name,
    year_1_pct: r.year_1_pct,
    years_2_5_pct: r.years_2_5_pct,
    years_6_plus_pct: r.years_6_plus_pct,
    age_group_min: r.age_group_min,
    age_group_max: r.age_group_max,
    confidence: source === "ai_extracted" ? confidence : null,
    is_estimated: r.is_estimated,
  }));
  const issues = reviewGrid(reviewRows);
  const savable = canSaveGrid(issues);

  const valid = Boolean(carrierId)
    && rows.some((r) => r.product_name.trim() && r.level_name.trim())
    && savable;

  return (
    <Wrap embedded={embedded}>
        {!embedded && (
          <HeroBand
            title="Commission Grids"
            subtitle="Your contract levels drive every payout forecast — keep them current"
          />
        )}

        <Panel title="Add or update a carrier grid">
          {/* Stacked, not side by side: the matrix is a wide table with a
              product column and one column per level, and squeezing it into
              half a settings tab meant every product name and most rate
              columns were cut off. Picking the carrier and dropping files is
              narrow work; reviewing the grid needs the whole width. */}
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 items-start">

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Carrier</label>
                <Select
                  value={carrierId}
                  onValueChange={(v) => (v === NEW_CARRIER ? setAddingCarrier(true) : selectCarrier(v))}
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
                {/* A drop zone, not a label wrapping a hidden input.
                    A wrapping <label> is what made multi-select unreliable: the
                    click reached the label, which re-dispatched it to the input,
                    and some browsers open the single-file picker for a
                    synthesised click. The input is now opened directly from a
                    ref, and the same zone accepts dragged files. */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInput.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.current?.click(); }
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    acceptFiles(e.dataTransfer.files);
                  }}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-5 text-center transition-colors",
                    dragging ? "border-primary bg-gold-glow" : "border-border hover:border-primary/50 hover:bg-surface-2",
                    reading && "pointer-events-none opacity-60",
                  )}
                >
                  {reading
                    ? <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    : <Upload className={cn("h-5 w-5", dragging ? "text-primary" : "text-muted-foreground")} />}
                  <span className="text-xs text-muted-foreground">
                    {reading
                      ? "Reading the grid…"
                      : dragging
                        ? "Drop the pages here"
                        : "Drop files here, or tap to choose"}
                  </span>
                  <span className="text-[11px] text-text-dim">PDF, photo, screenshot or spreadsheet</span>
                  <input
                    ref={fileInput}
                    type="file"
                    // `multiple`: a paper grid photographed page by page is the
                    // normal phone case, and picking the photos one at a time
                    // used to mean each replaced the last.
                    multiple
                    accept="application/pdf,image/*,.csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => { acceptFiles(e.target.files); e.currentTarget.value = ""; }}
                  />
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  Photograph every page — you can select several at once, and a later upload
                  adds to the grid below rather than replacing it. Nothing is saved until you
                  review it. Check the numbers — a wrong rate here skews every forecast.
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

              {rows.length > 0 && (
                <div className="mb-3 space-y-1.5">
                  <p className={cn("text-xs", savable ? "text-muted-foreground" : "text-danger")}>
                    {reviewSummary(reviewRows, issues)}
                  </p>
                  {issues.map((issue, i) => (
                    <p
                      key={`${issue.code}-${i}`}
                      className={cn(
                        "rounded-md border px-2.5 py-1.5 text-[11px] leading-snug",
                        issue.severity === "blocking"
                          ? "border-danger/40 bg-danger/[0.06] text-danger"
                          : "border-warning/40 bg-warning/[0.06] text-warning",
                      )}
                    >
                      {issue.message}
                    </p>
                  ))}
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
