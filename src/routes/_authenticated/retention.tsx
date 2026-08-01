import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { ScopeToggle } from "@/components/scope-toggle";
import { useScope } from "@/hooks/use-scope";
import { SCOPES, type Scope } from "@/lib/scope";
import { StatTile } from "@/components/ui/stat-tile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RefreshCw, PhoneCall, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { money, number } from "@/lib/format";
import {
  listRetentionCases, getRetentionStats, syncRetentionCases,
  updateRetentionCase, getPersistency, type RetentionCase,
} from "@/lib/retention.functions";

export const Route = createFileRoute("/_authenticated/retention")({
  validateSearch: (s: Record<string, unknown>): { scope?: Scope } => ({
    scope: SCOPES.includes(s.scope as Scope) ? (s.scope as Scope) : undefined,
  }),
  head: () => ({ meta: [{ title: "Retention — Agent Cloud" }] }),
  component: RetentionPage,
});

type StatusFilter = "live" | "all" | "saved" | "lost";
const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "live", label: "Working" },
  { value: "saved", label: "Saved" },
  { value: "lost", label: "Lost" },
  { value: "all", label: "All" },
];

const REASON_LABEL: Record<string, string> = {
  lapse_pending: "Lapse pending",
  payment_failed: "Payment failed",
  nsf: "NSF",
  cancelled_pending: "Cancel pending",
  no_contact: "No contact",
  manual: "Flagged",
};

/** Null means "no policies old enough to judge", which is not the same as 0%. */
function pct(v: number | null | undefined) {
  return v == null ? "—" : `${v.toFixed(1)}%`;
}

function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

function RetentionPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("live");
  const { scope, ready: scopeReady } = useScope();
  const [resolving, setResolving] = useState<RetentionCase | null>(null);

  const listFn = useServerFn(listRetentionCases);
  const statsFn = useServerFn(getRetentionStats);
  const syncFn = useServerFn(syncRetentionCases);
  const updateFn = useServerFn(updateRetentionCase);

  const { data, isLoading } = useQuery({
    enabled: scopeReady,
    queryKey: ["retention", filter, scope],
    queryFn: () => listFn({ data: { status: filter, scope } }),
  });
  const { data: stats } = useQuery({
    enabled: scopeReady,
    queryKey: ["retention", "stats", scope],
    queryFn: () => statsFn({ data: { scope } }),
  });

  const persistFn = useServerFn(getPersistency);
  const { data: book } = useQuery({ queryKey: ["retention", "persistency"], queryFn: () => persistFn() });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["retention"] });

  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r: any) => {
      toast.success(r.opened > 0 ? `${r.opened} new case${r.opened === 1 ? "" : "s"} opened` : "No new at-risk policies");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't refresh the queue"),
  });

  const update = useMutation({
    mutationFn: (vars: any) => updateFn({ data: vars }),
    onSuccess: () => { invalidate(); setResolving(null); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't update the case"),
  });

  const cases = (data?.cases ?? []) as RetentionCase[];

  return (
    <PageShell>
      <div className="max-w-[1100px] mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand
          title="Retention"
          subtitle="Policies at risk, who is working them, and how they ended"
          actions={
            <div className="flex items-center gap-2">
            <ScopeToggle />
            <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
              {sync.isPending
                ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
              Refresh queue
            </Button>
            </div>
          }
        />

        {/* Book health — how business places and how long it stays. */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-[var(--gap)]">
          <Panel>
            <StatTile
              label="Placement Rate"
              value={pct(book?.placementPct)}
              delta={`${number(book?.placed ?? 0)} of ${number(book?.submitted ?? 0)}`}
            />
          </Panel>
          <Panel>
            <StatTile
              label="Activation Rate"
              value={pct(book?.activationPct)}
              delta={`${number(book?.activated ?? 0)} paying`}
              tone="gold"
            />
          </Panel>
          {(book?.persistency ?? [4, 7, 13].map((m) => ({ months: m, pct: null, eligible: 0 }))).map((b: any) => (
            <Panel key={b.months}>
              <StatTile
                label={`${b.months}-Month Persistency`}
                value={pct(b.pct)}
                delta={b.eligible === 0 ? "not enough history" : `${number(b.eligible)} eligible`}
              />
            </Panel>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-[var(--gap)]">
          <Panel><StatTile label="Working" value={String(stats?.live ?? 0)} /></Panel>
          <Panel><StatTile label="Premium at Risk" value={money(stats?.atRisk ?? 0)} tone="gold" /></Panel>
          <Panel><StatTile label="Saved" value={String(stats?.saved ?? 0)} /></Panel>
          <Panel>
            <StatTile
              label="Save Rate"
              value={stats?.saveRate == null ? "—" : `${Math.round(stats.saveRate * 100)}%`}
              delta={stats?.saveRate == null ? "no resolved cases yet" : `${stats.lost} lost`}
            />
          </Panel>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                filter === f.value
                  ? "bg-gold-glow text-gold-bright border-primary/40"
                  : "bg-surface-2 text-muted-foreground border-border hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : cases.length === 0 ? (
          <Panel>
            <div className="py-12 text-center space-y-2">
              <div className="font-medium">
                {filter === "live" ? "Nothing at risk right now." : "No cases here."}
              </div>
              <p className="text-sm text-muted-foreground">
                Policies that go lapse-pending or NSF open a case automatically.
                Use “Refresh queue” to sweep for any that predate this page.
              </p>
            </div>
          </Panel>
        ) : (
          <Panel pad={false} className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2">
                  <tr>
                    {["Client", "Policy", "Reason", "Age", "Premium", "Owner", "Status", ""].map((h, i) => (
                      <th
                        key={h || i}
                        className={cn(
                          "px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
                          i >= 3 && i <= 4 ? "text-right" : "text-left",
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => {
                    const live = c.status === "open" || c.status === "working";
                    return (
                      <tr key={c.id} className="border-t border-border-soft hover:bg-surface-2 transition-colors">
                        <td className="px-4 py-3 font-medium">{c.client_name || "—"}</td>
                        <td className="px-4 py-3 tnum text-muted-foreground">{c.policy_number || "—"}</td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className="text-[10px]">
                            {REASON_LABEL[c.risk_reason] ?? c.risk_reason}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right tnum">
                          <span className={cn(daysSince(c.opened_at) > 14 && live && "text-destructive font-medium")}>
                            {daysSince(c.opened_at)}d
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tnum">{money(Number(c.premium_at_risk ?? 0))}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {c.assignee_name || c.agent_name || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              c.status === "saved" ? "success"
                              : c.status === "lost" ? "destructive"
                              : c.status === "working" ? "info"
                              : "secondary"
                            }
                            className="text-[10px] capitalize"
                          >
                            {c.status.replace("_", " ")}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {live && (
                            <div className="flex gap-1 justify-end">
                              {c.status === "open" && (
                                <Button
                                  size="sm" variant="ghost" className="h-7 text-xs"
                                  onClick={() => update.mutate({ id: c.id, status: "working", markContacted: true })}
                                >
                                  <PhoneCall className="h-3 w-3 mr-1" /> Working
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setResolving(c)}>
                                Resolve
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>

      <ResolveDialog
        item={resolving}
        onClose={() => setResolving(null)}
        onSubmit={(status, note) => resolving && update.mutate({ id: resolving.id, status, outcome_note: note || null })}
        pending={update.isPending}
      />
    </PageShell>
  );
}

function ResolveDialog({
  item, onClose, onSubmit, pending,
}: {
  item: RetentionCase | null;
  onClose: () => void;
  onSubmit: (status: string, note: string) => void;
  pending: boolean;
}) {
  const [status, setStatus] = useState("saved");
  const [note, setNote] = useState("");

  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) { onClose(); setStatus("saved"); setNote(""); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Resolve retention case</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {item?.client_name} · {item?.policy_number}
          </p>
          <div>
            <label className="text-xs font-medium mb-1 block">Outcome</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="saved">Saved — policy stays in force</SelectItem>
                <SelectItem value="lost">Lost — policy lapsed or cancelled</SelectItem>
                <SelectItem value="no_action">No action needed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">What happened? (optional)</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[70px]" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onSubmit(status, note)} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save outcome"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
