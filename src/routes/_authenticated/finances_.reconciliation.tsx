import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
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
  getStatementDetail, suggestStatementMatches, applyStatementMatches,
  gridFindingsForStatement, createTasksForGridFindings, type StatementLine,
} from "@/lib/reconciliation.functions";
import { parseStatementBlock } from "@/lib/statement-parse";
import { readBlock, readDocument } from "@/lib/sheet-shape";
import { extractDocument } from "@/lib/document-extract";

export const Route = createFileRoute("/_authenticated/finances_/reconciliation")({
  head: () => ({ meta: [{ title: "Commission Reconciliation — Agent Cloud" }] }),
  component: ReconciliationPage,
});

/*
 * The parser, the header guesser and the money parser that used to live here
 * are in `src/lib/statement-parse.ts`, which is tested by
 * `npm run check:statements`. They carried four silent defects — the worst of
 * them read `(1,890.00)` as a *positive* 1,890, so a chargeback reconciled as
 * a payment and the variance came out wrong by twice the amount, on exactly
 * the line item this page exists to catch.
 */

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
            Upload a carrier statement as CSV or Excel, exactly as the carrier sent it —
            title rows, subtotals and all. Each line is matched to a policy by policy number
            and compared to the commission the engine calculated when the deal was posted.
            Chargebacks keep their sign, so a negative total is a real month, not a parsing
            error. Nothing here changes your commission schedule — it only reports the
            difference.
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
  const [notes, setNotes] = useState<string[]>([]);

  const createFn = useServerFn(createStatement);
  const reconcileFn = useServerFn(reconcileStatement);

  /**
   * Read the file.
   *
   * A workbook goes through `extractDocument` first, which is the same path
   * the book importer uses — carriers send .xlsx at least as often as .csv, and
   * a page that only accepts CSV makes the agency convert it by hand, which is
   * where a spreadsheet turns a policy number into scientific notation.
   *
   * Every sheet is read, not just the first: a statement workbook routinely has
   * a summary tab in front of the detail. The sheet with the most lines wins,
   * which is the detail tab in every layout I can find.
   */
  async function onFile(f: File) {
    setProblem(null);
    setNotes([]);

    let blocks;
    try {
      const isWorkbook = /spreadsheet|excel/i.test(f.type) || /\.xlsx?$/i.test(f.name);
      blocks = isWorkbook
        ? readDocument((await extractDocument(f)).text ?? "")
        : [readBlock(await f.text())];
    } catch {
      setProblem("We couldn't open that file. CSV and Excel workbooks both work.");
      return;
    }

    const parsedAll = blocks.map(parseStatementBlock);
    const best = parsedAll.reduce(
      (a, b) => (b.lines.length > a.lines.length ? b : a),
      parsedAll[0] ?? parseStatementBlock(readBlock("")),
    );

    if (!best.lines.length) {
      setProblem(best.problem ?? "That file has no data rows.");
      setLines([]);
      return;
    }

    // The server takes 5000 lines per statement. Said here, before the upload,
    // because the alternative is a Zod validation error after the person has
    // filled in the carrier and the date.
    if (best.lines.length > 5000) {
      setProblem(
        `That statement has ${best.lines.length.toLocaleString()} lines and we take 5,000 at a time. ` +
        `Split it by period or by agent and upload the parts.`,
      );
      setLines([]);
      return;
    }

    // Said out loud rather than folded into the line count. A statement whose
    // total does not match the file is the thing an agency notices a month
    // later, and "we skipped 6 subtotal rows" is what makes the arithmetic
    // reconcilable at the time.
    const said: string[] = [];
    if (best.skipped.subtotal) said.push(`${best.skipped.subtotal} subtotal row${best.skipped.subtotal === 1 ? "" : "s"} skipped`);
    if (best.skipped.banner) said.push(`${best.skipped.banner} header row${best.skipped.banner === 1 ? "" : "s"} above the table`);
    if (best.skipped.unreadableAmount) said.push(`${best.skipped.unreadableAmount} row${best.skipped.unreadableAmount === 1 ? "" : "s"} with an unreadable amount`);

    setFileName(f.name);
    setLines(best.lines);
    setNotes(said);
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
  const chargebacks = lines.filter((l) => l.paid_amount < 0).length;

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
            <label className="text-xs font-medium mb-1 block">Statement file</label>
            <Input
              type="file"
              accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              CSV or Excel. Leave the title rows and subtotals in — we read past them.
            </p>
          </div>
          {problem && <p className="text-xs text-destructive">{problem}</p>}
          {lines.length > 0 && (
            <div className="rounded-lg border border-border p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Lines</span><span className="tnum">{lines.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total paid</span><span className="tnum font-semibold">{money(total)}</span></div>
              {/* A negative total is normal on a chargeback-heavy month and used
                  to be impossible to produce — worth showing rather than
                  hiding, because it is the number the agency is checking. */}
              {chargebacks > 0 && (
                <div className="flex justify-between text-xs pt-1 mt-1 border-t border-border-soft">
                  <span className="text-muted-foreground">Of which chargebacks</span>
                  <span className="tnum text-destructive">{chargebacks}</span>
                </div>
              )}
              {notes.length > 0 && (
                <p className="text-[11px] text-muted-foreground pt-2 mt-2 border-t border-border-soft">
                  {notes.join(" · ")}
                </p>
              )}
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
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "variance" | "unmatched" | "matched">("variance");
  const detailFn = useServerFn(getStatementDetail);
  const suggestFn = useServerFn(suggestStatementMatches);
  const applyFn = useServerFn(applyStatementMatches);
  const gridFn = useServerFn(gridFindingsForStatement);
  const tasksFn = useServerFn(createTasksForGridFindings);

  const { data, isLoading } = useQuery({
    queryKey: ["statement", id, filter],
    queryFn: () => detailFn({ data: { statement_id: id, filter } }),
  });

  const s = (data as any)?.statement;
  const sum = (data as any)?.summary;
  const lines = ((data as any)?.lines ?? []) as StatementLine[];

  // Computed fresh rather than stored, so a policy posted since the upload
  // shows up without anybody re-running the reconcile.
  const { data: suggested } = useQuery({
    queryKey: ["statement", id, "suggestions"],
    queryFn: () => suggestFn({ data: { statement_id: id } }),
    enabled: (sum?.unmatched ?? 0) > 0,
  });
  const suggestions = ((suggested as any)?.suggestions ?? {}) as Record<string, any[]>;

  // Which suggestion, if any, the person has chosen per line. Strong ones start
  // ticked; everything else starts blank. Pre-ticking is not the same as
  // applying — nothing is written until the button is pressed.
  const [picked, setPicked] = useState<Record<string, string | null>>({});
  const choiceFor = (lineId: string): string | null => {
    if (lineId in picked) return picked[lineId];
    const top = suggestions[lineId]?.[0];
    return top && top.confidence >= 0.85 ? top.policyId : null;
  };
  const chosen = Object.keys(suggestions)
    .map((lineId) => ({ line_id: lineId, policy_id: choiceFor(lineId) }))
    .filter((m): m is { line_id: string; policy_id: string } => m.policy_id !== null);

  // Only meaningful once lines are matched, so it waits for the reconcile
  // rather than firing against an empty set on first render.
  const { data: gridData } = useQuery({
    queryKey: ["statement", id, "grid"],
    queryFn: () => gridFn({ data: { statement_id: id } }),
    enabled: (sum?.matched ?? 0) + (sum?.varianceCount ?? 0) > 0,
  });
  const gridFindings = ((gridData as any)?.findings ?? []) as any[];

  const makeTasks = useMutation({
    mutationFn: () => tasksFn({ data: { statement_id: id } }),
    onSuccess: (r: any) => {
      toast.success(
        r.created
          ? `${r.created} task${r.created === 1 ? "" : "s"} created`
          : "Nothing here needed a task.",
      );
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't create those tasks"),
  });

  const apply = useMutation({
    mutationFn: () => applyFn({ data: { statement_id: id, matches: chosen } }),
    onSuccess: (r: any) => {
      toast.success(
        `${r.applied} line${r.applied === 1 ? "" : "s"} matched` +
        (r.skipped ? ` · ${r.skipped} skipped` : ""),
      );
      setPicked({});
      qc.invalidateQueries({ queryKey: ["statement", id] });
      qc.invalidateQueries({ queryKey: ["statements"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't apply those matches"),
  });

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

        {/*
          The unmatched pile, worked rather than displayed.
          `reconcile_statement` matches on policy number alone, so what lands
          here is mostly not unmatched at all — a carrier printing a base number
          against a suffixed one, or an adjustment line with the policy column
          left blank. Every suggestion says why, and nothing is written until
          somebody presses the button.
        */}
        {/*
          The third opinion.

          Everything above compares what the carrier paid against what the
          platform scheduled — and the platform schedules from
          `agent_commission_levels.assigned_pct`, never from the comp grid. So
          when those two disagree, both sides of that comparison are built on
          the same wrong rate and the statement reconciles perfectly while the
          agent is paid fifteen points short on every policy. That finding can
          only come from a third number.
        */}
        {gridFindings.length > 0 && (
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="text-sm font-medium">What the comp grid says</div>
                <ul className="space-y-1.5 text-xs">
                  {gridFindings.slice(0, 6).map((f: any) => (
                    <li key={f.lineId} className="flex gap-2">
                      <Badge
                        variant={f.finding === "rate_mismatch" || f.finding === "underpaid" ? "destructive" : "secondary"}
                        className="shrink-0 text-[10px] h-fit"
                      >
                        {f.finding === "rate_mismatch" ? "Rate" : f.finding === "no_schedule" ? "No schedule" : f.finding}
                      </Badge>
                      <span className="min-w-0 text-muted-foreground">{f.explanation}</span>
                    </li>
                  ))}
                </ul>
                {gridFindings.length > 6 && (
                  <p className="text-xs text-muted-foreground">
                    …and {gridFindings.length - 6} more.
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => makeTasks.mutate()}
                disabled={makeTasks.isPending}
              >
                {makeTasks.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create tasks for these"}
              </Button>
            </div>
          </Panel>
        )}

        {chosen.length > 0 && (
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {Object.keys(suggestions).length} unmatched line
                  {Object.keys(suggestions).length === 1 ? "" : "s"} look like policies we already have
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {chosen.length} ticked below. Nothing is written until you apply them.
                </p>
              </div>
              <Button size="sm" onClick={() => apply.mutate()} disabled={apply.isPending}>
                {apply.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : `Apply ${chosen.length} match${chosen.length === 1 ? "" : "es"}`}
              </Button>
            </div>
          </Panel>
        )}

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
                    <Fragment key={l.id}>
                    <tr className="border-t border-border-soft hover:bg-surface-2 transition-colors">
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

                    {/* One row per candidate, radio-style: a line belongs to one
                        policy or to none, and "none" has to stay reachable —
                        otherwise a pre-ticked wrong guess cannot be undone. */}
                    {(suggestions[l.id] ?? []).map((sg: any) => {
                      const on = choiceFor(l.id) === sg.policyId;
                      return (
                        <tr key={`${l.id}:${sg.policyId}`} className="bg-surface-2/40">
                          <td colSpan={6} className="px-4 py-2 pl-10">
                            <label className="flex items-start gap-2.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => setPicked((p) => ({ ...p, [l.id]: on ? null : sg.policyId }))}
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--primary)]"
                              />
                              <span className="min-w-0 text-xs">
                                <span className="font-medium">
                                  {sg.insuredName || "Unnamed client"}
                                </span>
                                {sg.policyNumber && <span className="tnum text-muted-foreground"> · {sg.policyNumber}</span>}
                                {sg.expected != null && (
                                  <span className="text-muted-foreground">
                                    {" "}· expected {money(Number(sg.expected))}
                                    {sg.variance != null && sg.variance !== 0 && (
                                      <span className={cn(sg.variance < 0 ? "text-destructive" : "text-warning")}>
                                        {" "}({money(Number(sg.variance))})
                                      </span>
                                    )}
                                  </span>
                                )}
                                <span className="block text-muted-foreground mt-0.5">
                                  {sg.reasons.join(" · ")}
                                </span>
                              </span>
                            </label>
                          </td>
                        </tr>
                      );
                    })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
    </Shell>
  );
}
