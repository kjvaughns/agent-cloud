import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/contracting/shared";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { useServerFn } from "@/hooks/use-server-fn";
import { listLicensingRecords, reviewPdbReport, saveLicenseRecord } from "@/lib/contracting-records.functions";
import { Column, Pill, RecordTable, Stacked } from "@/components/contracting/table";
import { cn } from "@/lib/utils";

const FILTERS = ["expiring", "expired", "missing_pdb", "stale_pdb"] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABELS: Record<Filter, string> = {
  expiring: "Expiring soon",
  expired: "Expired",
  missing_pdb: "No PDB report",
  stale_pdb: "PDB out of date",
};

export const Route = createFileRoute("/_authenticated/contracting-ops/licensing")({
  component: LicensingPage,
  head: () => ({ meta: [{ title: "Licensing Records | Agent Cloud" }] }),
  // Arriving from an overview tile should land on the slice the tile counted.
  // "10 licences expiring soon" that opens an unfiltered roster of eight agents
  // makes the reader do the filtering the number already did.
  validateSearch: (s: Record<string, unknown>): { filter?: Filter } =>
    FILTERS.includes(s.filter as Filter) ? { filter: s.filter as Filter } : {},
});

const PDB_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  verified: "success", pending: "warning", in_review: "info",
  rejected: "danger", none: "neutral", superseded: "neutral",
};

function LicensingPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { filter } = Route.useSearch();
  const listFn = useServerFn(listLicensingRecords);
  const reviewFn = useServerFn(reviewPdbReport);
  const saveLicenseFn = useServerFn(saveLicenseRecord);

  const [search, setSearch] = useState("");
  const [openAgent, setOpenAgent] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "licensing"],
    queryFn: () => listFn(),
  });

  const review = useMutation({
    mutationFn: (v: any) => reviewFn({ data: v }),
    onSuccess: () => {
      toast.success("PDB review recorded");
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
      setOpenAgent(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not record the review"),
  });

  const saveLicense = useMutation({
    mutationFn: (v: any) => saveLicenseFn({ data: v }),
    onSuccess: () => {
      toast.success("Licence saved");
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the licence"),
  });

  const matchesSearch = (name: string, npn: any, state: any) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return name.toLowerCase().includes(s) ||
      String(npn ?? "").includes(s) ||
      String(state ?? "").toLowerCase() === s;
  };

  const agents = useMemo(() => {
    let out = (data?.agents ?? []) as any[];
    if (filter === "missing_pdb") out = out.filter((a) => a.pdb_status === "none");
    if (filter === "stale_pdb") out = out.filter((a) => a.pdb_stale);
    return out.filter((a) => matchesSearch(a.name, a.npn, a.resident_state));
  }, [data, search, filter]);

  /**
   * One row per licence, not per agent.
   *
   * "10 licences expiring soon" was a number with no way to act on it: the
   * roster underneath counts agents, so the ten were spread across eight rows
   * and none of them said which state or when. Here every row is one licence,
   * soonest first, with the days left spelled out.
   */
  const expiringLicences = useMemo(() => {
    if (filter !== "expiring" && filter !== "expired") return [];
    const today = new Date().toISOString().slice(0, 10);
    const warnBy = new Date(Date.now() + (data?.settings?.warnDays ?? 45) * 86_400_000)
      .toISOString().slice(0, 10);

    return ((data?.agents ?? []) as any[])
      .filter((a) => matchesSearch(a.name, a.npn, a.resident_state))
      .flatMap((a) =>
        (a.licenses ?? [])
          .filter((l: any) => {
            if (!l.expires_date) return false;
            return filter === "expired"
              ? l.expires_date < today
              : l.expires_date >= today && l.expires_date <= warnBy;
          })
          .map((l: any) => ({
            ...l,
            agent: a,
            days: Math.round(
              (new Date(l.expires_date + "T00:00:00").getTime() - Date.now()) / 86_400_000),
          })))
      .sort((a, b) => a.expires_date.localeCompare(b.expires_date));
  }, [data, search, filter]);

  const setFilter = (next: Filter | null) =>
    navigate({ to: "/contracting-ops/licensing", search: next ? { filter: next } : {} });

  const columns: Column<any>[] = [
    { key: "agent", header: "Agent", className: "flex-[2]",
      render: (a) => <Stacked top={a.name} bottom={a.npn ? `NPN ${a.npn}` : "No NPN on file"} /> },
    { key: "resident", header: "Resident", className: "w-20",
      render: (a) => <span className="text-sm text-muted-foreground">{a.resident_state ?? "—"}</span> },
    { key: "licenses", header: "Licences", className: "w-24",
      render: (a) => <span className="tnum text-sm text-foreground">{a.license_count}</span> },
    { key: "expiring", header: "Expiring", className: "w-28",
      render: (a) => a.expired_count > 0
        ? <Pill tone="danger">{a.expired_count} expired</Pill>
        : a.expiring_count > 0
          ? <Pill tone="warning">{a.expiring_count} soon</Pill>
          : <span className="text-xs text-text-dim">None</span> },
    { key: "pdb", header: "PDB report", className: "w-36",
      render: (a) => (
        <span className="flex items-center gap-1.5">
          <Pill tone={a.pdb_stale ? "warning" : (PDB_TONE[a.pdb_status] ?? "neutral")}>
            {a.pdb_status === "none" ? "Not uploaded" : a.pdb_stale ? "Out of date" : a.pdb_status}
          </Pill>
        </span>
      ) },
    { key: "next", header: "Next review", className: "w-28", secondary: true,
      render: (a) => <span className="tnum text-xs text-muted-foreground">{a.pdb_next_review ?? "—"}</span> },
  ];

  const needsAttention = (data?.agents ?? []).filter(
    (a: any) => a.pdb_status === "none" || a.pdb_stale || a.expired_count > 0,
  ).length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/25 bg-primary/[0.04] px-4 py-3">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            <span className="font-semibold text-foreground">Manually verified licensing data.</span>{" "}
            These records come from PDB reports your team uploads and reviews. Agent Cloud is not
            connected to NIPR — nothing here is live or automatically synced.
            {data?.settings?.refreshDays ? ` Your agency asks for a fresh report every ${data.settings.refreshDays} days.` : ""}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
                 placeholder="Agent, NPN or state" className="pl-8" />
        </div>
        {needsAttention > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            {needsAttention} agent{needsAttention === 1 ? "" : "s"} need attention
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilter(null)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] font-medium",
            !filter ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground",
          )}
        >
          Every agent
        </button>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(filter === f ? null : f)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium",
              filter === f ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground",
            )}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      <Panel pad={false}>
        {filter === "expiring" || filter === "expired" ? (
          <ExpiringLicences
            rows={expiringLicences}
            loading={isLoading}
            expired={filter === "expired"}
            onOpenAgent={setOpenAgent}
          />
        ) : (
          <RecordTable
            rows={agents}
            columns={columns}
            loading={isLoading}
            onRowClick={setOpenAgent}
            empty={{
              kind: filter ? "cleared" : "first-use",
              title: filter ? "Nothing in this slice" : "No licensing records yet",
              body: filter
                ? "Try a different filter — there is licensing work on the board, just not here."
                : "Upload a PDB report to begin tracking agent licences. Once a report is reviewed, the licences, appointments and review dates recorded from it appear here.",
            }}
          />
        )}
      </Panel>

      <LicenseSheet
        agent={openAgent}
        onClose={() => setOpenAgent(null)}
        onReview={(v) => review.mutate(v)}
        onSaveLicense={(v) => saveLicense.mutate(v)}
        reviewing={review.isPending}
      />
    </div>
  );
}

function ExpiringLicences({
  rows, loading, expired, onOpenAgent,
}: {
  rows: any[]; loading: boolean; expired: boolean; onOpenAgent: (a: any) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          title={expired ? "Nothing has expired" : "Nothing expiring soon"}
          body={
            expired
              ? "Every licence on file is still inside its term."
              : "No licence reaches its expiry date inside your agency's warning window."
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className="hidden items-center gap-3 border-b border-border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground lg:flex">
        <span className="flex-[2]">Agent</span>
        <span className="w-12">State</span>
        <span className="flex-1">Licence number</span>
        <span className="w-24">Expires</span>
        <span className="w-28">{expired ? "Overdue by" : "Days left"}</span>
      </div>
      <ul className="divide-y divide-border-soft">
        {rows.map((l) => (
          <li key={l.id}>
            <button
              onClick={() => onOpenAgent(l.agent)}
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left transition-colors hover:bg-surface-2/40 lg:flex-nowrap"
            >
              <span className="min-w-0 flex-[2]">
                <span className="block truncate text-sm font-medium text-foreground">{l.agent.name}</span>
                <span className="tnum block truncate text-[11px] text-muted-foreground">
                  {l.agent.npn ? `NPN ${l.agent.npn}` : "No NPN on file"}
                </span>
              </span>
              <span className="w-12 shrink-0 text-sm font-semibold text-foreground">{l.state_code}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {l.license_number ?? "No number"}{l.is_resident ? " · Resident" : ""}
              </span>
              <span className="tnum w-24 shrink-0 text-xs text-muted-foreground">{l.expires_date}</span>
              <span className="w-28 shrink-0">
                <Pill tone={expired ? "danger" : l.days <= 14 ? "danger" : "warning"}>
                  {expired
                    ? `${Math.abs(l.days)} day${Math.abs(l.days) === 1 ? "" : "s"}`
                    : `${l.days} day${l.days === 1 ? "" : "s"}`}
                </Pill>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="border-t border-border-soft px-4 py-2 text-[11px] text-text-dim">
        {rows.length} licence{rows.length === 1 ? "" : "s"}, soonest first. Opening a row shows that
        agent's full record and lets you record the renewal.
      </p>
    </>
  );
}

function LicenseSheet({
  agent, onClose, onReview, onSaveLicense, reviewing,
}: {
  agent: any | null;
  onClose: () => void;
  onReview: (v: any) => void;
  onSaveLicense: (v: any) => void;
  reviewing: boolean;
}) {
  const [notes, setNotes] = useState("");
  const [newLicense, setNewLicense] = useState<Record<string, string>>({});

  if (!agent) return null;
  const set = (k: string, v: string) => setNewLicense((f) => ({ ...f, [k]: v }));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Sheet open={Boolean(agent)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{agent.name}</SheetTitle>
          <SheetDescription>
            {agent.npn ? `NPN ${agent.npn}` : "No NPN on file"}
            {agent.resident_state ? ` · Resident ${agent.resident_state}` : ""}
          </SheetDescription>
        </SheetHeader>

        {/* Reviewing a PDB is the common case and stays here, one click from
            the row. Everything else about this agent — appointments, writing
            numbers, open requests, what each carrier still needs — is a page,
            because it is too much to read sideways. */}
        <Link
          to="/agency/agents/$agentId"
          search={{ tab: "contracting" }}
          params={{ agentId: agent.id }}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          Open {agent.name.split(" ")[0]}'s contracting record
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>

        <div className="mt-5 space-y-5">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Licences on file</h3>
            {agent.licenses.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">None recorded yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border-soft rounded-lg border border-border">
                {agent.licenses.map((l: any) => {
                  const expired = l.expires_date && l.expires_date < today;
                  return (
                    <li key={l.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="w-8 shrink-0 text-sm font-semibold text-foreground">{l.state_code}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-muted-foreground">
                          {l.license_number ?? "No number"}{l.is_resident ? " · Resident" : ""}
                        </span>
                        <span className="block truncate text-[10px] text-text-dim">
                          {l.last_verified_at
                            ? `Verified ${new Date(l.last_verified_at).toLocaleDateString()} · ${l.verification_source?.replace(/_/g, " ")}`
                            : "Never verified"}
                        </span>
                      </span>
                      <span className={cn("tnum shrink-0 text-xs", expired ? "text-destructive" : "text-muted-foreground")}>
                        {l.expires_date ?? "No expiry"}
                      </span>
                      <Pill tone={expired ? "danger" : l.status === "active" ? "success" : "neutral"}>{l.status}</Pill>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-border p-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Add a licence</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="lic-state">State</Label>
                <Input id="lic-state" maxLength={2} value={newLicense.state_code ?? ""}
                       onChange={(e) => set("state_code", e.target.value.toUpperCase())} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="lic-number">Licence number</Label>
                <Input id="lic-number" value={newLicense.license_number ?? ""}
                       onChange={(e) => set("license_number", e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="lic-loa">Lines of authority</Label>
                <Input id="lic-loa" value={newLicense.loa ?? ""} onChange={(e) => set("loa", e.target.value)}
                       placeholder="Life & Health" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="lic-exp">Expires</Label>
                <Input id="lic-exp" type="date" value={newLicense.expires_date ?? ""}
                       onChange={(e) => set("expires_date", e.target.value)} className="mt-1" />
              </div>
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={newLicense.is_resident === "1"}
                     onChange={(e) => set("is_resident", e.target.checked ? "1" : "")}
                     className="h-3.5 w-3.5 accent-[var(--gold)]" />
              Resident licence
            </label>
            <Button
              size="sm" className="mt-3"
              disabled={!newLicense.state_code || newLicense.state_code.length !== 2}
              onClick={() => {
                onSaveLicense({
                  agent_id: agent.id,
                  state_code: newLicense.state_code,
                  license_number: newLicense.license_number?.trim() || null,
                  loa: newLicense.loa?.trim() || null,
                  expires_date: newLicense.expires_date || null,
                  is_resident: newLicense.is_resident === "1",
                  status: "active",
                });
                setNewLicense({});
              }}
            >
              Add licence
            </Button>
            <p className="mt-2 text-[11px] text-text-dim">
              Saving records you as the verifier, with today's date and a source of manual entry.
            </p>
          </section>

          {agent.latest_upload_id && (
            <section className="rounded-lg border border-border p-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Review the uploaded PDB
              </h3>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Uploaded {agent.latest_upload_at ? new Date(agent.latest_upload_at).toLocaleString() : "recently"}.
                Recording a review stamps the next review date from your agency's refresh interval.
              </p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Reviewer notes"
                className="mt-2 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  disabled={reviewing}
                  onClick={() => onReview({
                    pdb_upload_id: agent.latest_upload_id,
                    agent_id: agent.id,
                    status: "verified",
                    licenses_recorded: agent.license_count,
                    reviewer_notes: notes || null,
                  })}
                >
                  Mark verified
                </Button>
                <Button
                  size="sm" variant="outline"
                  disabled={reviewing}
                  onClick={() => onReview({
                    pdb_upload_id: agent.latest_upload_id,
                    agent_id: agent.id,
                    status: "rejected",
                    rejection_reason: notes || "A clearer or more recent report is needed.",
                  })}
                >
                  Reject
                </Button>
              </div>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
