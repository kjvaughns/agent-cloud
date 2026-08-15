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
import {
  UploadCloud, Loader2, Sparkles, FileText, AlertTriangle, Check, ArrowRight,
  Users, BookOpen, StickyNote, Table2, IdCard, ScrollText, Percent, CornerDownRight,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNavContext } from "@/hooks/use-my-access";
import {
  createImportBatch, classifyImportDoc, setImportKind, reconcileImportRows,
  listImports, getImportSummary, listProposals, decideProposals, applyProposals,
  dismissImport, listCarrierIndex, markWorkbookParent, type ImportDoc, type Proposal,
} from "@/lib/import.functions";
import type { CarrierRecord } from "@/lib/carrier-match";
import { extractGrid } from "@/lib/comp-grid.functions";
import { UndoImport } from "@/components/import/undo-import";
import { extractDocument, truncationNotice, type ExtractedDoc } from "@/lib/document-extract";
import { resolveKind, allHeaderRows, KIND_LABEL, KIND_TARGET, type ImportKind } from "@/lib/import-router";
import { clientsFromDocument, contractingRowsFromDocument, rosterFromDocument } from "@/lib/import-extract-rows";
import { readDocument } from "@/lib/sheet-shape";
import { MigrationGuide } from "@/components/import/migration-guide";
import { planWorkbook, describePlan } from "@/lib/import-workbook";
import {
  certificatesFromDocument, debtFromDocument, statementLinesFromDocument, splitName,
} from "@/lib/import-carrier-reports";
import { normalizePolicyStatus } from "@/lib/import-normalize";
import { extractCarrierReport } from "@/lib/import-carrier-reports.functions";
import { carrierFromLabel } from "@/lib/sheet-shape";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Import — Agent Cloud" }] }),
  component: ImportPage,
});

/**
 * One row of the result list has to answer "what happened to my file" from
 * across the desk, so status carries a colour as well as a word: a dot for the
 * glance, the word for the certainty.
 */
const STATUS_STYLE: Record<string, { label: string; variant: any; dot: string }> = {
  queued: { label: "Queued", variant: "secondary", dot: "bg-muted-foreground/50" },
  analyzing: { label: "Reading", variant: "info", dot: "bg-primary animate-pulse" },
  needs_review: { label: "Needs you", variant: "warning", dot: "bg-warning" },
  applied: { label: "Imported", variant: "success", dot: "bg-success" },
  dismissed: { label: "Dismissed", variant: "secondary", dot: "bg-muted-foreground/40" },
  failed: { label: "Couldn't read", variant: "destructive", dot: "bg-destructive" },
  // A workbook is not reviewed itself — its tabs are, and they are listed
  // under it as their own rows.
  split: { label: "Split by tab", variant: "info", dot: "bg-primary/60" },
};

/**
 * The file type, as a picture.
 *
 * Every row used to open with the same generic page icon, so a stack of eight
 * rows from one workbook was eight identical lines distinguishable only by
 * reading the filename to its end. The icon is the fastest way to see that the
 * roster tab and the book tab are different things.
 */
const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  book_of_business: BookOpen,
  clients: Users,
  client_notes: StickyNote,
  agent_roster: Users,
  commission_grid: Percent,
  commission_statement: Table2,
  writing_numbers: IdCard,
  state_licenses: ScrollText,
  policy_status_report: Table2,
  agent_debt: Table2,
  agent_debt_balances: Table2,
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

/** A file's live client-side phase: what it is doing, and how far along. */
type LivePhase = { label: string; pct: number };


function ImportPage() {
  const qc = useQueryClient();
  const nav = useNavContext();
  const [tab, setTab] = useState<"import" | "approvals">("import");
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  /**
   * What each file is doing *right now*.
   *
   * The row's status column comes from the database, and the database only
   * learns a file's outcome once the client has finished reading it — so a file
   * being actively parsed read "Queued" for the whole minute it was working.
   * This is the client's own view of the same file: a phase in words and a
   * percentage, kept only while the work is in flight.
   */
  const [live, setLive] = useState<Record<string, LivePhase>>({});

  function mark(id: string, label: string, pct: number) {
    setLive((prev) => ({ ...prev, [id]: { label, pct: Math.max(0, Math.min(99, Math.round(pct))) } }));
  }
  function clearMark(id: string) {
    setLive((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }


  const batchFn = useServerFn(createImportBatch);
  const classifyFn = useServerFn(classifyImportDoc);
  const setKindFn = useServerFn(setImportKind);
  const reconcileFn = useServerFn(reconcileImportRows);
  const listFn = useServerFn(listImports);
  const dismissFn = useServerFn(dismissImport);
  const extractGridFn = useServerFn(extractGrid);
  const carrierIndexFn = useServerFn(listCarrierIndex);
  const markParentFn = useServerFn(markWorkbookParent);
  const carrierReportFn = useServerFn(extractCarrierReport);

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

      // Every file in the batch is waiting on a worker, and says so, rather
      // than looking idle until its turn comes.
      for (const rec of batch.documents ?? []) {
        if (rec?.id) mark(rec.id, "Waiting its turn", 2);
      }

      let done = 0;
      const queue = list.map((file, i) => ({ file, rec: batch.documents[i] }));

      async function worker() {
        for (;;) {
          const item = queue.shift();
          if (!item || !item.rec) return;
          try {
            await processOne(item.file, item.rec.id, trimmed, batch.batch_id);
          } catch (e: any) {
            // Every file reports its own outcome on its row. One that cannot be
            // read must not take the rest of the batch down with it.
            console.error("Import failed for", item.file.name, e);
          }
          clearMark(item.rec.id);
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
      setLive({});
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
  async function processOne(file: File, id: string, userNote: string | null, batchId: string) {
    mark(id, "Opening the file", 8);
    const doc = await extractDocument(file);

    const notice = truncationNotice(doc);
    if (notice) toast.warning(`${file.name}: ${notice}`);

    /*
      A migration workbook is four different imports in one file.

      Routing the whole file as one thing meant the tab that won decided
      everything: a roster read as clients, or — more often — the columns
      disagreeing with each other so nothing was recognised at all. Each tab is
      read and routed on its own, and the tabs that describe the same people
      (clients, their policies, their notes) are joined into one stream before
      anything is proposed, so a policy lands on the client it belongs to
      instead of inventing a second copy of them.
    */
    mark(id, "Working out what it is", 24);
    const plan = doc.text ? planWorkbook(doc.text, carriers, userNote) : null;


    if (plan && plan.streams.length > 1) {
      mark(id, `Splitting ${plan.sheets.length} tabs`, 32);
      await markParentFn({
        data: { id, summary: describePlan(plan), sheet_count: plan.sheets.length },
      });

      const children: any = await batchFn({
        data: {
          batch_id: batchId,
          user_note: userNote,
          files: plan.streams.map((st) => ({
            file_name: `${file.name} — ${st.sheetLabel}`,
            mime_type: file.type || null,
            size_bytes: null,
            parent_id: id,
            sheet_label: st.sheetLabel,
          })),
        },
      });
      qc.invalidateQueries({ queryKey: ["imports"] });
      for (const rec of children.documents ?? []) {
        if (rec?.id) mark(rec.id, "Waiting its turn", 2);
      }

      for (let i = 0; i < plan.streams.length; i++) {
        const st = plan.streams[i];
        const rec = children.documents?.[i];
        if (!rec) continue;
        // The parent's bar tracks tabs finished; each tab's own bar tracks rows.
        mark(id, `Tab ${i + 1} of ${plan.streams.length} — ${st.sheetLabel}`, 32 + (i / plan.streams.length) * 60);
        mark(rec.id, "Reading columns", 20);
        await setKindFn({
          data: {
            id: rec.id,
            kind: st.kind,
            confidence: 0.95,
            summary: `${st.sheetLabel} — ${st.rows.length} row${st.rows.length === 1 ? "" : "s"}`,
          },
        });
        await sendRows(rec.id, st.kind, st.rows, file.name);
        clearMark(rec.id);
        qc.invalidateQueries({ queryKey: ["imports"] });
      }
      if (plan.notesJoined || plan.policiesJoined) {
        toast.info(
          `${file.name}: matched ${plan.policiesJoined} policies and ${plan.notesJoined} notes onto their clients.`,
        );
      }
      return;
    }


    // A single recognisable sheet still goes through the planner, so a one-tab
    // book gets the same column reading and the same joins as a four-tab one.
    if (plan && plan.streams.length === 1 && plan.streams[0].kind !== "unknown") {
      const st = plan.streams[0];
      await setKindFn({
        data: { id, kind: st.kind, confidence: 0.9, summary: describePlan(plan) },
      });
      if (st.rows.length) {
        await sendRows(id, st.kind, st.rows, file.name);
        return;
      }
      // Recognised but empty of rows — a comp grid PDF, say. Fall through to
      // the extractors below, which know how to read pictures.
      await proposeRows(id, st.kind, doc, file);
      return;
    }

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
    mark(id, "Asking the assistant to identify it", 55);
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
      mark(id, "Reading your book", 40);
      rows = doc.text ? clientsFromDocument(doc.text, carriers) : [];
    } else if (kind === "commission_grid") {
      // A rate table's meaning is in its layout — which column a number sits
      // under is the level it pays. The text layer gives the numbers in
      // reading order with the columns gone, so grids go to the model as
      // pictures even when the PDF has perfectly good text.
      mark(id, "Turning pages into images", 34);
      const pages = doc.images.length
        ? doc.images
        : (await extractDocument(file, { prefer: "image", maxPages: 8 })).images;
      if (!pages.length) return;
      mark(id, `Reading the rate table (${pages.length} page${pages.length === 1 ? "" : "s"})`, 50);
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
    } else if (
      kind === "policy_status_report" || kind === "agent_debt" || kind === "commission_statement"
    ) {
      mark(id, "Reading the carrier report", 40);
      rows = await carrierReportRows(kind, doc, file);

    } else {
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

    await sendRows(id, kind, rows, file.name);
  }

  /**
   * The three reports a carrier sends, read whichever way the file allows.
   *
   * A spreadsheet export has columns, so it is read for free and exactly. A PDF
   * printed from the carrier's admin system does not: its text layer comes out as
   * one column of words with the table gone, so an amount cannot be tied to the
   * agent it was printed beside. Those pages go to the model as images, where the
   * layout is still visible — the same reason comp grids do.
   *
   * Deterministic first, always. The model is the fallback, not the default.
   */
  async function carrierReportRows(
    kind: ImportKind,
    doc: ExtractedDoc,
    file: File,
  ): Promise<Record<string, any>[]> {
    // The carrier is usually only named in the filename on these reports.
    const carrierName = carrierFromLabel(file.name, carriers)?.cleaned ?? null;

    if (doc.text) {
      if (kind === "policy_status_report") {
        const rows = certificatesFromDocument(doc.text, carrierName);
        if (rows.length) return rows;
      } else if (kind === "agent_debt") {
        const rows = debtFromDocument(doc.text);
        if (rows.length) return rows;
      } else {
        const lines = statementLinesFromDocument(doc.text);
        if (lines.length) {
          return [{ carrier_name: carrierName, file_name: file.name, lines }];
        }
      }
    }

    const pages = doc.images.length
      ? doc.images
      : (await extractDocument(file, { prefer: "image", maxPages: 12 })).images;
    if (!pages.length) return [];

    const out: any = await carrierReportFn({
      data: { images: pages, file_name: file.name, expected_kind: kind },
    });

    if (out?.dropped) {
      toast.warning(
        `${file.name}: ${out.dropped} row${out.dropped === 1 ? "" : "s"} weren't legible enough to import.`,
      );
    }

    const readCarrier = out?.carrier_name ?? carrierName;

    if (kind === "agent_debt") {
      return (out?.debts ?? []).map((d: any) => ({ ...d, carrier_name: d.carrier_name ?? readCarrier }));
    }
    if (kind === "commission_statement") {
      if (!out?.lines?.length) return [];
      return [{
        carrier_name: readCarrier,
        file_name: file.name,
        statement_date: out.statement?.statement_date ?? null,
        period_start: out.statement?.period_start ?? null,
        period_end: out.statement?.period_end ?? null,
        stated_total: out.statement?.stated_total ?? null,
        lines: out.lines,
      }];
    }
    // Certificates become client records, so a carrier's copy of a policy lands
    // on the client already on file instead of a second copy of the person.
    return (out?.certificates ?? []).map((c: any) => {
      const { first_name, last_name } = splitName(String(c.insured_name ?? ""));
      return {
        first_name,
        last_name,
        stage_raw: "sold",
        policies: [{
          policy_number: c.policy_number,
          carrier_name: readCarrier,
          product: c.product ?? null,
          effective_date: c.effective_date ?? null,
          // The carrier's own wording, mapped by the same table the
          // spreadsheet path uses — never coerced to "active" on a guess.
          status: normalizePolicyStatus(c.status_text ?? "") ?? null,
          status_raw: c.status_text ?? null,
          face_amount: c.face_amount ?? null,
          monthly_premium: c.monthly_premium ?? null,
        }],
      };
    });
  }

  /** Chunked reconcile. Shared by the per-sheet path and the single-file path. */
  async function sendRows(
    id: string,
    kind: ImportKind,
    rows: Record<string, any>[],
    fileName: string,
  ) {
    if (!rows.length) {
      toast.warning(`We recognised ${fileName} but couldn't read any rows out of it.`);
      return;
    }
    for (let i = 0; i < rows.length; i += RECONCILE_CHUNK) {
      // Rows matched, out of rows read — the honest number, since this is the
      // slow half of an import and it is measured in rows, not files.
      mark(
        id,
        `Matching against your book — ${Math.min(i + RECONCILE_CHUNK, rows.length).toLocaleString()} of ${rows.length.toLocaleString()} rows`,
        60 + (i / rows.length) * 38,
      );
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

  /**
   * Open the note and take the person to it.
   *
   * A file we could not classify tells you to describe it and upload it again.
   * That instruction pointed at a textarea which is now collapsed by default,
   * so it would have been telling somebody to use a control they cannot see.
   * The sentence is a button instead — the fix and the instruction are the
   * same click.
   */
  function describeAgain() {
    setNoteOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("import-note")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  const needsReview = docs.filter((d) => d.status === "needs_review").length;
  const imported = docs.filter((d) => d.status === "applied").length;
  const unreadable = docs.filter((d) => d.status === "failed").length;

  /*
    One number for the whole batch.

    Files finished is the trustworthy part; the files still in flight contribute
    their own reported phase so a single large file doesn't sit at 0% for a
    minute and then jump to done. Capped below 100 until everything is in, so
    the bar never claims to be finished while work is still running.
  */
  const livePhases = Object.values(live);
  const liveAvg = livePhases.length
    ? livePhases.reduce((n, p) => n + p.pct, 0) / livePhases.length / 100
    : 0;
  const overallPct = (() => {
    if (!progress) return 0;
    if (progress.done >= progress.total) return 100;
    const inFlight = Math.min(CONCURRENCY, progress.total - progress.done);
    const value = ((progress.done + liveAvg * inFlight) / progress.total) * 100;
    return Math.max(1, Math.min(99, Math.round(value)));
  })();


  /*
    A workbook and its tabs are one thing, so they are drawn as one thing.

    Flat, a four-tab migration export produced five sibling rows — the workbook
    plus each tab, every one of them titled with the same filename and a dash —
    and nothing on screen said the tabs came out of the file above them. Tabs
    are nested under their parent, and a parent's own row stops being a card
    that looks reviewable when it is only a container.
  */
  const groups = (() => {
    const children = new Map<string, ImportDoc[]>();
    for (const d of docs) {
      if (!d.parent_id) continue;
      const b = children.get(d.parent_id);
      if (b) b.push(d);
      else children.set(d.parent_id, [d]);
    }
    return docs
      .filter((d) => !d.parent_id || !docs.some((p) => p.id === d.parent_id))
      .map((doc) => ({ doc, sheets: children.get(doc.id) ?? [] }));
  })();

  return (
    <PageShell>
      {/*
        Secondary actions live in the hero's action slot, not on the tab rail.

        They used to sit inside the same non-wrapping flex row as the tabs —
        MigrationGuide pushed in with `ml-auto`, then a "Document review" link
        after it. At 375px that row is about 480px wide, so on a phone the
        button landed *between* the two tabs and the link ran off the right
        edge mid-phrase. A tab rail has to hold tabs; anything else on it is
        what breaks first on the narrowest screen anybody uses.

        The migration path is an action rather than a tab because "coming from
        another CRM" is a question people arrive with. Document review is a
        link rather than a tab because it is a working queue with its own
        filters, sheet and approve/reject actions, and two other flows
        deep-link into it by URL — re-hosting it here would mean a second copy,
        and the copy would be the one that rots.
      */}
      {/* The tour's "nothing saves until you say so" step used to anchor on
          the tab rail, which is Import|Approvals and has nothing to do with
          that promise — and the rail is now absent for anyone without the
          agency permission, so the step would have pointed at nothing. It
          anchors here, where the subtitle makes the same claim in words. */}
      <div data-tour="import-review">
      <HeroBand
        title="Import"
        subtitle="A book of business, a comp grid, a carrier report. Nothing is saved until you have seen what it found."
        actions={
          <>
            <MigrationGuide />
            {nav.canSeeAgency && (
              <a
                href="/contracting-ops/documents"
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-[var(--radius)] px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
              >
                Document review <ArrowRight className="h-3.5 w-3.5" />
              </a>
            )}
          </>
        }
      />
      </div>

      {/* One tab is not a tab strip. Without the agency permission there is
          nothing to switch between, so the rail would be a lone underlined
          word above the content it already describes. */}
      {nav.canSeeAgency && (
        <div className="flex gap-1 border-b border-border">
          <TabButton active={tab === "import"} onClick={() => setTab("import")}>Import</TabButton>
          <TabButton active={tab === "approvals"} onClick={() => setTab("approvals")}>
            Approvals
          </TabButton>
        </div>
      )}

      {tab === "approvals" ? (
        <ApprovalsTab />
      ) : (
        <>
          {/*
            The counters only exist once there is something to count.

            Three tiles reading 0 / 0 / 0 was the first thing in the viewport
            on a phone — a third of the screen spent telling somebody who has
            never imported anything that they have imported nothing, above the
            list that says the same thing again. And they were `sm:grid-cols-3`,
            so below 640px they stacked into three full-width rows.
          */}
          {docs.length > 0 && (
            <div className="grid grid-cols-3 gap-[var(--gap)]">
              <StatTile label="Waiting for you" value={needsReview} />
              <StatTile label="Imported" value={imported} />
              <StatTile label="Couldn't read" value={unreadable} />
            </div>
          )}

          <Panel>
            <div data-tour="import-drop" className="space-y-3">
              {/*
                The note is optional and it collapses.

                Expanded, it was a label, a two-row textarea and a three-line
                paragraph explaining our own matching logic — roughly 200px
                that pushed the drop target, which is the entire job of this
                page, to 44% down a phone screen. Collapsed it is one line.

                It stays *above* the drop target rather than below it because
                `handleFiles` reads the note at upload time: choosing a file
                starts the read immediately, so a note added afterwards would
                arrive too late to do anything.
              */}
              {noteOpen ? (
                <div id="import-note" className="space-y-2">
                  <label className="block text-sm font-medium">
                    What are you uploading? <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    autoFocus
                    placeholder="e.g. My whole book from Blue Sky — I already imported the Aetna policies last month"
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Tells us what the file is, and settles the awkward cases when we are deciding
                    whether somebody is already in your book.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNoteOpen(true)}
                  className="flex w-full items-center gap-2 rounded-[var(--radius)] border border-dashed border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                  {note.trim()
                    ? <span className="truncate">{note.trim()}</span>
                    : "Say what these files are — optional, but it improves matching"}
                </button>
              )}

              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!busy) setDragging(true);
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  if (!busy) setDragging(true);
                }}
                onDragLeave={(e) => {
                  // Only clear when the pointer actually leaves the zone, not
                  // when it crosses onto a child element inside it.
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (busy) return;
                  const dropped = e.dataTransfer?.files;
                  if (dropped?.length) handleFiles(dropped);
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary/50 hover:bg-surface-2",
                  dragging && "border-primary bg-primary/5",
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
                  <div className="w-full max-w-md space-y-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="inline-flex items-center gap-2 text-sm font-medium">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        {progress
                          ? `Reading ${progress.total} file${progress.total === 1 ? "" : "s"}`
                          : "Reading…"}
                      </span>
                      {/* The number people came for. Tabular so it doesn't
                          jitter as it counts up. */}
                      <span className="font-mono text-2xl font-semibold leading-none tabular-nums text-primary">
                        {overallPct}%
                      </span>
                    </div>
                    <Progress value={overallPct} className="h-2 w-full" />
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {progress ? `${progress.done} of ${progress.total} done` : ""}
                      </span>
                      <span>Nothing is saved yet — you'll see what we found first.</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <UploadCloud className={cn("h-6 w-6 text-muted-foreground", dragging && "text-primary")} />
                    <span className="text-sm font-medium">
                      {dragging ? "Drop to import" : "Choose files, or drop them here"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      PDF, images, CSV, Excel — up to 100 at a time
                    </span>
                  </>
                )}

              </label>

            </div>
          </Panel>

          {/* No empty panel. "Nothing imported yet" sat directly under a drop
              target that is already the empty state, on a page where the
              counters above it had just said 0 three times. Three ways of
              saying nothing has happened is two too many. */}
          {isLoading ? (
            <Panel><Skeleton className="h-32 w-full" /></Panel>
          ) : docs.length === 0 ? null : (
            <div className="space-y-[var(--gap)]">
              {groups.map((g) => {
                const dismiss = async (id: string) => {
                  try {
                    await dismissFn({ data: { id } });
                    qc.invalidateQueries({ queryKey: ["imports"] });
                  } catch (e: any) {
                    toast.error(e?.message ?? "Couldn't dismiss that");
                  }
                };
                return (
                  <DocCard
                    key={g.doc.id}
                    doc={g.doc}
                    sheets={g.sheets}
                    live={live}
                    onDescribe={describeAgain}
                    openDoc={openDoc}
                    onToggle={(id) => setOpenDoc(openDoc === id ? null : id)}
                    onDismiss={dismiss}
                  />

                );
              })}
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

/**
 * One uploaded file, and its tabs if it had any.
 *
 * Header, then whatever the file has to say, then the review. The status word
 * and the type sit on one line under the name rather than beside it, because on
 * a phone a name long enough to matter pushed everything else off the row.
 */
function DocCard({
  doc, sheets, openDoc, onToggle, onDismiss, onDescribe, live,
}: {
  doc: ImportDoc;
  sheets: ImportDoc[];
  openDoc: string | null;
  onToggle: (id: string) => void;
  onDismiss: (id: string) => void;
  /** Opens the note field and scrolls to it. */
  onDescribe: () => void;
  /** Live client-side phase per document id, while a batch is running. */
  live: Record<string, LivePhase>;
}) {
  const phase = live[doc.id];
  const style = STATUS_STYLE[doc.status] ?? { label: doc.status, variant: "secondary", dot: "bg-muted-foreground/50" };
  const kind = (doc.doc_type ?? "unknown") as ImportKind;
  const target = KIND_TARGET[kind];
  const Icon = KIND_ICON[kind] ?? FileText;
  const open = openDoc === doc.id;
  const isParent = sheets.length > 0;


  return (
    <Panel
      className={cn(
        // The one row that wants something from you is the one that gets the
        // accent. Everything else stays quiet.
        doc.status === "needs_review" && "border-warning/40",
        doc.status === "failed" && "border-destructive/40",
      )}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius)] border",
                doc.status === "applied" && "border-success/30 bg-success/10 text-success",
                doc.status === "failed" && "border-destructive/30 bg-destructive/10 text-destructive",
                doc.status === "needs_review" && "border-warning/30 bg-warning/10 text-warning",
                !["applied", "failed", "needs_review"].includes(doc.status) &&
                  "border-border bg-surface-2 text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium leading-tight">{doc.file_name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {/* While the file is being read the client knows more than the
                    database does, so its phase wins over the stored status —
                    otherwise a file actively being parsed reads "Queued". */}
                {phase ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {phase.label}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
                    <span className="font-medium text-foreground">{style.label}</span>
                  </span>
                )}
                {doc.doc_type && <span>· {KIND_LABEL[kind] ?? doc.doc_type}</span>}
                {doc.carrier_name && <span>· {doc.carrier_name}</span>}
                {doc.period_label && <span>· {doc.period_label}</span>}
                {isParent && (
                  <span>· {sheets.length} tab{sheets.length === 1 ? "" : "s"}</span>
                )}
              </div>
            </div>

          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {target && doc.status === "needs_review" && (
              <Button size="sm" onClick={() => onToggle(doc.id)}>
                {open ? "Hide" : "Review"}
              </Button>
            )}
            {doc.status !== "applied" && doc.status !== "dismissed" && !isParent && (
              <Button size="sm" variant="ghost" onClick={() => onDismiss(doc.id)}>Dismiss</Button>
            )}
            {/* On the finished import, not behind a menu: the fear an undo
                answers peaks in the minute after the import completes. */}
            {doc.status === "applied" && <UndoImport batchId={doc.batch_id} />}
          </div>
        </div>

        {phase && (
          <div className="flex items-center gap-3">
            <Progress value={phase.pct} className="h-1.5 flex-1" />
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{phase.pct}%</span>
          </div>
        )}



        {doc.summary && <p className="text-sm text-muted-foreground">{doc.summary}</p>}
        {doc.error && (
          <p className="flex items-start gap-2 rounded-[var(--radius)] border border-destructive/30 bg-destructive/5 p-2.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {doc.error}
          </p>
        )}

        {doc.status === "needs_review" && !target && (
          <p className="text-sm text-muted-foreground">
            We couldn't tell what this is, so there's nothing to propose.{" "}
            <button
              type="button"
              onClick={onDescribe}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Tell us what it is
            </button>{" "}
            and upload it again — we'll use that.
          </p>
        )}

        {open && target && <ReviewPanel documentId={doc.id} />}

        {isParent && (
          // Indented against a rail, so the tabs read as contents of the file
          // above rather than as more uploads.
          <div className="space-y-2 border-l border-border pl-3 sm:pl-4">
            {sheets.map((sh) => (
              <SheetRow
                key={sh.id}
                doc={sh}
                phase={live[sh.id]}
                open={openDoc === sh.id}
                onToggle={() => onToggle(sh.id)}
                onDismiss={() => onDismiss(sh.id)}
              />

            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

/** One tab of a workbook: same information, one level quieter. */
function SheetRow({
  doc, open, onToggle, onDismiss, phase,
}: {
  doc: ImportDoc;
  open: boolean;
  onToggle: () => void;
  onDismiss: () => void;
  /** Live client-side phase for this tab, while it is being read. */
  phase?: LivePhase;
}) {

  const style = STATUS_STYLE[doc.status] ?? { label: doc.status, variant: "secondary", dot: "bg-muted-foreground/50" };
  const kind = (doc.doc_type ?? "unknown") as ImportKind;
  const target = KIND_TARGET[kind];
  const Icon = KIND_ICON[kind] ?? FileText;
  // The tab's own name, not "workbook.xlsx — Book of Business" repeated down the
  // list. The filename is already on the card this sits inside.
  const label = doc.sheet_label ?? doc.file_name.split(" — ").slice(-1)[0] ?? doc.file_name;

  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface-2/50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium leading-tight">{label}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {phase ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {phase.label}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
                  {style.label}
                </span>
              )}
              {doc.doc_type && <span>· {KIND_LABEL[kind] ?? doc.doc_type}</span>}
            </div>
            {phase && (
              <div className="mt-1.5 flex items-center gap-2">
                <Progress value={phase.pct} className="h-1 flex-1" />
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{phase.pct}%</span>
              </div>
            )}

            {doc.summary && (
              <p className="mt-1 text-xs text-muted-foreground">{doc.summary}</p>
            )}
            {doc.error && (
              <p className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {doc.error}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {target && doc.status === "needs_review" && (
            <Button size="sm" variant={open ? "outline" : "default"} onClick={onToggle}>
              {open ? "Hide" : "Review"}
            </Button>
          )}
          {doc.status !== "applied" && doc.status !== "dismissed" && (
            <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>
          )}
        </div>
      </div>

      {open && target && <ReviewPanel documentId={doc.id} />}
    </div>
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

  const newCount = s?.newRecords ?? 0;
  const skipped = s?.autoSkipped ?? 0;
  const needsYou = s?.needsYou ?? 0;
  const applied = s?.applied ?? 0;
  const total = newCount + skipped + needsYou;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <div className="mt-3 space-y-4 border-t border-border pt-4">
      {/*
        What is in the file, as one bar and three labels.

        Four numbers on a line of running text made the person do the
        arithmetic — how much of this book is new? — and the answer is the
        single thing they want before pressing import. The bar answers it
        without being read.
      */}
      <div className="space-y-2.5">
        {total > 0 && (
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="bg-primary" style={{ width: `${pct(newCount)}%` }} />
            <div className="bg-warning" style={{ width: `${pct(needsYou)}%` }} />
            <div className="bg-muted-foreground/30" style={{ width: `${pct(skipped)}%` }} />
          </div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          <Count n={newCount} label="new" tone="text-foreground" swatch="bg-primary" />
          {needsYou > 0 && (
            <Count n={needsYou} label="need you" tone="text-warning" swatch="bg-warning" />
          )}
          <Count
            n={skipped}
            label="already on file — skipped"
            tone="text-muted-foreground"
            swatch="bg-muted-foreground/30"
          />
          {applied > 0 && <Count n={applied} label="imported" tone="text-success" swatch="bg-success" />}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-medium text-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {rows.length} we won't guess on
            </p>
            {/* One decision for the whole list, for the common case where the
                answer is the same every time. Individual rows still win. */}
            <button
              type="button"
              onClick={() => decide(rows.map((r) => r.id), "skipped")}
              className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Skip all
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            These look like people you might already have.
          </p>
          {rows.map((p) => {
            const name =
              [p.payload?.first_name, p.payload?.last_name].filter(Boolean).join(" ") || "Unnamed record";
            const initials = name
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((w: string) => w[0]?.toUpperCase())
              .join("");
            return (
              <div
                key={p.id}
                className="rounded-[var(--radius)] border border-warning/30 bg-warning/[0.04] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-[11px] font-semibold text-muted-foreground">
                      {initials || "?"}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium leading-tight">{name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {p.payload?.phone && <span>{p.payload.phone}</span>}
                        {p.payload?.email && <span className="truncate">· {p.payload.email}</span>}
                      </div>
                      {p.match_reason && (
                        <div className="mt-1 text-xs text-warning">{p.match_reason}</div>
                      )}
                    </div>
                  </div>
                  {/* Full width and wrapping on a phone: three buttons on one
                      line at 375px put "Merge into existing" off the edge, and
                      that is the option a duplicate usually wants. */}
                  <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto">
                    {p.match_id && (
                      <Button size="sm" onClick={() => decide([p.id], "approved", p.match_id)}>
                        Merge into existing
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={p.match_id ? "outline" : "default"}
                      onClick={() => decide([p.id], "approved", null)}
                    >
                      Add as new
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => decide([p.id], "skipped")}>
                      Already have them
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Nothing left to import reads as a result, not as a disabled button. */}
      {newCount === 0 && needsYou === 0 ? (
        <p className="flex items-center gap-2 rounded-[var(--radius)] border border-success/30 bg-success/5 p-3 text-sm text-success">
          <Check className="h-4 w-4 shrink-0" />
          {applied > 0
            ? `Imported ${applied.toLocaleString()} record${applied === 1 ? "" : "s"}. Everything else was already on file.`
            : "Everything in this file is already on file — nothing to add."}
        </p>
      ) : (
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          className="w-full sm:w-auto"
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
      )}
    </div>
  );
}

function Count({ n, label, tone, swatch }: { n: number; label: string; tone: string; swatch?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", tone)}>
      {swatch && <span className={cn("h-2 w-2 shrink-0 rounded-full", swatch)} />}
      <span className="tnum font-semibold">{n.toLocaleString()}</span>
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
