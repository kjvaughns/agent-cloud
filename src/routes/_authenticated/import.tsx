import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { UploadCloud, Loader2, Sparkles, FileText, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavContext } from "@/hooks/use-my-access";
import {
  createImportBatch, classifyImportDoc, setImportKind, reconcileImportRows,
  listImports, getImportSummary, listProposals, decideProposals, applyProposals,
  dismissImport, listCarrierIndex, type ImportDoc, type Proposal,
} from "@/lib/import.functions";
import type { CarrierRecord } from "@/lib/carrier-match";
import { extractGrid } from "@/lib/comp-grid.functions";
import { UndoImport } from "@/components/import/undo-import";
import { extractDocument, truncationNotice, type ExtractedDoc } from "@/lib/document-extract";
import { resolveKind, allHeaderRows, KIND_LABEL, KIND_TARGET, type ImportKind } from "@/lib/import-router";
import { clientsFromDocument, contractingRowsFromDocument, rosterFromDocument } from "@/lib/import-extract-rows";
import { readDocument } from "@/lib/sheet-shape";
import { MigrationGuide } from "@/components/import/migration-guide";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Import — Agent Cloud" }] }),
  component: ImportPage,
});

const STATUS_STYLE: Record<string, { label: string; variant: any }> = {
  queued: { label: "Queued", variant: "secondary" },
  analyzing: { label: "Reading", variant: "info" },
  needs_review: { label: "Review", variant: "warning" },
  applied: { label: "Imported", variant: "success" },
  dismissed: { label: "Dismissed", variant: "secondary" },
  failed: { label: "Couldn't read", variant: "destructive" },
};

/**
 * Three at a time.
 *
 * One at a time — what Document Intake did — is safe and slow: a hundred files
 * is minutes of watching a spinner. A hundred at once hits the gateway's rate
 * limit and fails most of the batch. Three finishes and finishes intact.
 */
const CONCURRENCY = 3;

/** Rows per reconcile call. Matches the server's cap. */
const RECONCILE_CHUNK = 500;

function ImportPage() {
  const qc = useQueryClient();
  const nav = useNavContext();
  const [tab, setTab] = useState<"import" | "approvals">("import");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [openDoc, setOpenDoc] = useState<string | null>(null);

  const batchFn = useServerFn(createImportBatch);
  const classifyFn = useServerFn(classifyImportDoc);
  const setKindFn = useServerFn(setImportKind);
  const reconcileFn = useServerFn(reconcileImportRows);
  const listFn = useServerFn(listImports);
  const dismissFn = useServerFn(dismissImport);
  const extractGridFn = useServerFn(extractGrid);
  const carrierIndexFn = useServerFn(listCarrierIndex);

  const { data, isLoading } = useQuery({
    queryKey: ["imports"],
    queryFn: () => listFn({ data: { status: "all" } }),
  });
  const docs = ((data as any)?.documents ?? []) as ImportDoc[];

  // Reference data, fetched once and reused across the batch. Only used to read
  // a carrier out of a tab name, so its absence costs that and nothing else.
  const { data: carrierData } = useQuery({
    queryKey: ["carrier-index"],
    queryFn: () => carrierIndexFn({ data: undefined as any }),
    staleTime: 30 * 60_000,
  });
  const carriers = ((carrierData as any)?.carriers ?? []) as CarrierRecord[];

  async function handleFiles(files: FileList) {
    const list = Array.from(files).slice(0, 100);
    if (!list.length) return;

    setBusy(true);
    setProgress({ done: 0, total: list.length });
    const trimmed = note.trim() || null;

    try {
      const batch: any = await batchFn({
        data: {
          files: list.map((f) => ({
            file_name: f.name,
            mime_type: f.type || null,
            size_bytes: f.size,
          })),
          user_note: trimmed,
        },
      });
      qc.invalidateQueries({ queryKey: ["imports"] });

      let done = 0;
      const queue = list.map((file, i) => ({ file, rec: batch.documents[i] }));

      async function worker() {
        for (;;) {
          const item = queue.shift();
          if (!item || !item.rec) return;
          try {
            await processOne(item.file, item.rec.id, trimmed);
          } catch (e: any) {
            // Every file reports its own outcome on its row. One that cannot be
            // read must not take the rest of the batch down with it.
            console.error("Import failed for", item.file.name, e);
          }
          done++;
          setProgress({ done, total: list.length });
          qc.invalidateQueries({ queryKey: ["imports"] });
        }
      }

      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
      toast.success(`Read ${list.length} file${list.length === 1 ? "" : "s"}`);
      setNote("");
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
      setProgress(null);
      qc.invalidateQueries({ queryKey: ["imports"] });
    }
  }

  /**
   * Read one file and work out what it is.
   *
   * The order matters for cost: the column headers and the note are both free,
   * and settle most spreadsheets between them. Only what they cannot agree on
   * reaches the model.
   */
  async function processOne(file: File, id: string, userNote: string | null) {
    const doc = await extractDocument(file);

    const notice = truncationNotice(doc);
    if (notice) toast.warning(`${file.name}: ${notice}`);

    const headers = doc.text ? allHeaderRows(doc.text) : [];
    const guess = resolveKind(headers, userNote);

    if (guess.kind !== "unknown" && guess.confidence >= 0.7) {
      await setKindFn({
        data: {
          id,
          kind: guess.kind,
          confidence: guess.confidence,
          summary: guess.reason,
        },
      });
      await proposeRows(id, guess.kind, doc, file);
      return;
    }

    // Either nothing recognisable, or the note and the columns disagree —
    // and a disagreement is never resolved by picking one. Ask the model,
    // and give it the user's own words as evidence.
    await classifyFn({
      data: {
        id,
        text: doc.text || null,
        images: doc.images.length ? doc.images : null,
        user_note: guess.conflict
          ? `${userNote ?? ""} (note: the columns look like ${KIND_LABEL[guess.conflict.fromHeaders].toLowerCase()})`
          : userNote,
      },
    });
  }

  /**
   * Turn the extracted text into proposals.
   *
   * Sent up in chunks so a long book reports progress and, because proposals
   * are rows in a table, a failure part-way leaves what already landed rather
   * than starting over. Each chunk is matched against the existing book on the
   * server, which is where the duplicate decisions get made.
   */
  async function proposeRows(id: string, kind: ImportKind, doc: ExtractedDoc, file: File) {
    if (!KIND_TARGET[kind]) return;

    let rows: Record<string, any>[] = [];

    if (kind === "book_of_business") {
      rows = doc.text ? clientsFromDocument(doc.text, carriers) : [];
    } else if (kind === "commission_grid") {
      // A rate table's meaning is in its layout — which column a number sits
      // under is the level it pays. The text layer gives the numbers in
      // reading order with the columns gone, so grids go to the model as
      // pictures even when the PDF has perfectly good text.
      const pages = doc.images.length
        ? doc.images
        : (await extractDocument(file, { prefer: "image", maxPages: 8 })).images;
      if (!pages.length) return;
      const out: any = await extractGridFn({ data: { images: pages, file_name: file.name } });
      rows = (out?.rows ?? []).map((r: any) => ({ ...r, carrier_name: out.carrier_name ?? null }));
    } else if (kind === "writing_numbers" || kind === "state_licenses") {
      // Straight to the contracting importer's own column vocabulary. It does
      // the resolution and the validation; mapping is all that is needed here.
      rows = doc.text
        ? contractingRowsFromDocument(doc.text, kind === "state_licenses" ? "licenses" : "writing_numbers")
        : [];
    } else if (kind === "agent_roster") {
      rows = doc.text ? rosterFromDocument(doc.text) : [];
    } else {
      // Commission statements and policy status reports are classified and
      // listed; they route to `createStatement` and `applyCarrierSync`, both of
      // which already have their own screens.
      return;
    }

    if (!rows.length) {
      toast.warning(`We recognised ${file.name} but couldn't read any rows out of it.`);
      return;
    }

    // Say what was skipped. "We imported 412 rows" out of a 427-row file is the
    // kind of quiet arithmetic that gets discovered a month later; naming the
    // reason turns it into something the agency can agree or disagree with.
    if (doc.text) {
      const dropped = readDocument(doc.text).reduce(
        (n, b) => n + b.skipped.subtotal,
        0,
      );
      if (dropped) {
        toast.info(
          `${file.name}: skipped ${dropped} subtotal row${dropped === 1 ? "" : "s"}.`,
        );
      }
    }

    for (let i = 0; i < rows.length; i += RECONCILE_CHUNK) {
      const res: any = await reconcileFn({
        data: { document_id: id, kind, rows: rows.slice(i, i + RECONCILE_CHUNK) },
      });
      if (res?.capped) {
        toast.warning(
          `That file has more rows than we import in one go — ${res.skipped.toLocaleString()} were left out.`,
        );
        break;
      }
    }
  }

  const needsReview = docs.filter((d) => d.status === "needs_review").length;
  const imported = docs.filter((d) => d.status === "applied").length;
  const unreadable = docs.filter((d) => d.status === "failed").length;

  return (
    <PageShell>
      <HeroBand
        title="Import"
        subtitle="Drop in anything — a book of business, a comp grid, a carrier report. It gets read, matched against what you already have, and shown to you before anything is saved."
      />

      <div data-tour="import-review" className="flex gap-1 border-b border-border">
        <TabButton active={tab === "import"} onClick={() => setTab("import")}>Import</TabButton>
        {nav.canSeeAgency && (
          <TabButton active={tab === "approvals"} onClick={() => setTab("approvals")}>
            Approvals
          </TabButton>
        )}
        {/* A link rather than a tab, deliberately. Document review is a working
            queue with its own filters, sheet and approve/reject actions, and
            two other flows deep-link into it by URL. Re-hosting it here would
            mean a second copy of it, and the copy would be the one that rots.
            It sits beside Import in the sidebar for the same reason it sits
            here: both are records arriving from outside that a human accepts. */}
        {/* The migration path sits on the tab strip because "coming from
            another CRM" is a question people arrive with, not one they go
            looking for a settings page to answer. */}
        <div className="ml-auto flex items-center gap-2 self-center pb-2">
          <MigrationGuide />
        </div>
        {nav.canSeeAgency && (
          <a
            href="/contracting-ops/documents"
            className="self-center pb-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            Document review →
          </a>
        )}
      </div>

      {tab === "approvals" ? (
        <ApprovalsTab />
      ) : (
        <>
          <div className="grid gap-[var(--gap)] sm:grid-cols-3">
            <StatTile label="Waiting for you" value={needsReview} />
            <StatTile label="Imported" value={imported} />
            <StatTile label="Couldn't read" value={unreadable} />
          </div>

          <Panel>
            <div data-tour="import-drop" className="space-y-3">
              <label className="block text-sm font-medium">
                What are you uploading? <span className="text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="e.g. My whole book from Blue Sky — I already imported the Aetna policies last month"
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                A sentence here does two jobs: it tells us what the file is without us
                having to guess, and it settles the awkward cases when we're deciding
                whether somebody is already in your book.
              </p>

              <label
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary/50 hover:bg-surface-2",
                  busy && "pointer-events-none opacity-60",
                )}
              >
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept="application/pdf,image/*,.csv,.txt,.tsv,.xlsx,.xls"
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.files?.length) handleFiles(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
                {busy ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {progress ? `Reading ${progress.done} of ${progress.total}…` : "Reading…"}
                    </span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm font-medium">Choose files, or drop them here</span>
                    <span className="text-xs text-muted-foreground">
                      PDF, images, CSV, Excel — up to 100 at a time
                    </span>
                  </>
                )}
              </label>
            </div>
          </Panel>

          {isLoading ? (
            <Panel><Skeleton className="h-32 w-full" /></Panel>
          ) : docs.length === 0 ? (
            <Panel>
              <div className="py-10 text-center text-sm text-muted-foreground">
                Nothing imported yet.
              </div>
            </Panel>
          ) : (
            <div className="space-y-[var(--gap)]">
              {docs.map((d) => (
                <DocRow
                  key={d.id}
                  doc={d}
                  open={openDoc === d.id}
                  onToggle={() => setOpenDoc(openDoc === d.id ? null : d.id)}
                  onDismiss={async () => {
                    try {
                      await dismissFn({ data: { id: d.id } });
                      qc.invalidateQueries({ queryKey: ["imports"] });
                    } catch (e: any) {
                      toast.error(e?.message ?? "Couldn't dismiss that");
                    }
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function DocRow({
  doc, open, onToggle, onDismiss,
}: { doc: ImportDoc; open: boolean; onToggle: () => void; onDismiss: () => void }) {
  const style = STATUS_STYLE[doc.status] ?? { label: doc.status, variant: "secondary" };
  const kind = (doc.doc_type ?? "unknown") as ImportKind;
  const target = KIND_TARGET[kind];

  return (
    <Panel>
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="truncate font-medium">{doc.file_name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={style.variant}>{style.label}</Badge>
                {doc.doc_type && <span>{KIND_LABEL[kind] ?? doc.doc_type}</span>}
                {doc.carrier_name && <span>· {doc.carrier_name}</span>}
                {doc.period_label && <span>· {doc.period_label}</span>}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {target && doc.status === "needs_review" && (
              <Button size="sm" onClick={onToggle}>{open ? "Hide" : "Review"}</Button>
            )}
            {doc.status !== "applied" && doc.status !== "dismissed" && (
              <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>
            )}
            {/* On the finished import, not behind a menu: the fear an undo
                answers peaks in the minute after the import completes. */}
            {doc.status === "applied" && <UndoImport batchId={doc.batch_id} />}
          </div>
        </div>

        {doc.summary && <p className="text-sm text-muted-foreground">{doc.summary}</p>}
        {doc.error && (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {doc.error}
          </p>
        )}

        {doc.status === "needs_review" && !target && (
          <p className="text-sm text-muted-foreground">
            We couldn't tell what this is, so there's nothing to propose. Tell us in the
            box above and upload it again, and we'll use that.
          </p>
        )}

        {open && target && <ReviewPanel documentId={doc.id} />}
      </div>
    </Panel>
  );
}

/**
 * The review screen is a summary and a short list, never a table of everything.
 *
 * A book of business is thousands of rows. Showing them all would be honest and
 * useless. The exact duplicates are counted rather than listed because a unique
 * index would have refused them anyway; what earns a person's attention is the
 * handful we genuinely cannot call.
 */
function ReviewPanel({ documentId }: { documentId: string }) {
  const qc = useQueryClient();
  const summaryFn = useServerFn(getImportSummary);
  const proposalsFn = useServerFn(listProposals);
  const decideFn = useServerFn(decideProposals);
  const applyFn = useServerFn(applyProposals);
  const [applying, setApplying] = useState(false);

  const { data: summary } = useQuery({
    queryKey: ["import-summary", documentId],
    queryFn: () => summaryFn({ data: { document_id: documentId } }),
  });
  const { data: pending } = useQuery({
    queryKey: ["import-proposals", documentId],
    queryFn: () => proposalsFn({ data: { document_id: documentId, filter: "needs_you", limit: 50, offset: 0 } }),
  });

  const s = summary as any;
  const rows = ((pending as any)?.proposals ?? []) as Proposal[];

  if (s?.pendingSetup) {
    return (
      <div className="rounded-[var(--radius)] border border-border bg-surface-2 p-4 text-sm text-muted-foreground">
        Import is waiting on a workspace update — the tables it needs haven't been added
        yet. Your file is saved; come back once that's done.
      </div>
    );
  }

  async function decide(ids: string[], decision: "approved" | "skipped", matchId?: string | null) {
    try {
      await decideFn({ data: { ids, decision, match_id: matchId ?? null } });
      qc.invalidateQueries({ queryKey: ["import-proposals", documentId] });
      qc.invalidateQueries({ queryKey: ["import-summary", documentId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't record that");
    }
  }

  async function runApply() {
    setApplying(true);
    let total = 0;
    try {
      // Loops because apply works a batch at a time and every row is stamped
      // as it lands — so this is safe to interrupt and safe to run again.
      for (;;) {
        const res: any = await applyFn({ data: { document_id: documentId } });
        total += res.applied;
        if (res.failed) toast.warning(`${res.failed} record${res.failed === 1 ? "" : "s"} couldn't be saved`);
        if (res.done || (!res.applied && !res.failed)) break;
      }
      toast.success(`Imported ${total} record${total === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["imports"] });
      qc.invalidateQueries({ queryKey: ["import-summary", documentId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex flex-wrap gap-4 text-sm">
        <Count n={s?.newRecords ?? 0} label="new" tone="text-foreground" />
        <Count n={s?.autoSkipped ?? 0} label="already on file — skipped" tone="text-muted-foreground" />
        <Count n={s?.needsYou ?? 0} label="need you" tone="text-warning" />
        {(s?.applied ?? 0) > 0 && <Count n={s.applied} label="imported" tone="text-success" />}
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            These look like people you might already have. We won't guess.
          </p>
          {rows.map((p) => (
            <div key={p.id} className="rounded-[var(--radius)] border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">
                    {[p.payload?.first_name, p.payload?.last_name].filter(Boolean).join(" ") || "Unnamed record"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.match_reason}
                    {p.payload?.phone ? ` · ${p.payload.phone}` : ""}
                    {p.payload?.email ? ` · ${p.payload.email}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => decide([p.id], "skipped")}>
                    Already have them
                  </Button>
                  <Button size="sm" onClick={() => decide([p.id], "approved", null)}>
                    Add as new
                  </Button>
                  {p.match_id && (
                    <Button size="sm" variant="secondary" onClick={() => decide([p.id], "approved", p.match_id)}>
                      Merge into existing
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={async () => {
            const ids = ((await proposalsFn({
              data: { document_id: documentId, filter: "new", limit: 200, offset: 0 },
            })) as any).proposals.filter((p: Proposal) => p.decision === "pending").map((p: Proposal) => p.id);
            if (ids.length) await decide(ids, "approved");
            await runApply();
          }}
          disabled={applying}
        >
          {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          Import the {s?.newRecords ?? 0} new record{(s?.newRecords ?? 0) === 1 ? "" : "s"}
        </Button>
        {(s?.shared ?? 0) > 0 && (
          <span className="text-xs text-muted-foreground">
            {s.shared} of these change agency-wide settings and need an admin's approval.
          </span>
        )}
      </div>
    </div>
  );
}

function Count({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <span className={tone}>
      <span className="tnum font-semibold">{n.toLocaleString()}</span>{" "}
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

/** Everything shared and still waiting, from anyone in the agency. */
function ApprovalsTab() {
  const listFn = useServerFn(listImports);
  const { data, isLoading } = useQuery({
    queryKey: ["import-approvals"],
    queryFn: () => listFn({ data: { status: "needs_review" } }),
  });

  if (isLoading) return <Panel><Skeleton className="h-24 w-full" /></Panel>;

  const docs = ((data as any)?.documents ?? []) as ImportDoc[];
  const shared = docs.filter((d) => {
    const t = KIND_TARGET[(d.doc_type ?? "unknown") as ImportKind];
    return t?.scope === "shared";
  });

  return (
    <Panel>
      {shared.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Nothing waiting on you.
        </div>
      ) : (
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
            These change things the whole agency reads — comp grids, carriers, the roster —
            so they wait for you rather than applying themselves.
          </p>
          {shared.map((d) => (
            <div key={d.id} className="rounded-[var(--radius)] border border-border p-3">
              <div className="font-medium">{d.file_name}</div>
              <div className="text-xs text-muted-foreground">
                {KIND_LABEL[(d.doc_type ?? "unknown") as ImportKind]}
                {d.carrier_name ? ` · ${d.carrier_name}` : ""}
              </div>
              {d.summary && <p className="mt-2 text-sm text-muted-foreground">{d.summary}</p>}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
