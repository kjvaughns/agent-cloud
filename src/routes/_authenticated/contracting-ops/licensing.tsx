import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { useServerFn } from "@/hooks/use-server-fn";
import { listLicensingRecords, reviewPdbReport, saveLicenseRecord } from "@/lib/contracting-records.functions";
import { Column, Pill, RecordTable, Stacked } from "@/components/contracting/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contracting-ops/licensing")({
  component: LicensingPage,
  head: () => ({ meta: [{ title: "Licensing Records | Agent Cloud" }] }),
});

const PDB_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  verified: "success", pending: "warning", in_review: "info",
  rejected: "danger", none: "neutral", superseded: "neutral",
};

function LicensingPage() {
  const qc = useQueryClient();
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

  const agents = useMemo(() => {
    let out = (data?.agents ?? []) as any[];
    if (search.trim()) {
      const s = search.toLowerCase();
      out = out.filter((a) =>
        a.name.toLowerCase().includes(s) ||
        String(a.npn ?? "").includes(s) ||
        String(a.resident_state ?? "").toLowerCase() === s);
    }
    return out;
  }, [data, search]);

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

      <Panel pad={false}>
        <RecordTable
          rows={agents}
          columns={columns}
          loading={isLoading}
          onRowClick={setOpenAgent}
          empty={{
            title: "No licensing records yet",
            body: "Upload a PDB report to begin tracking agent licences. Once a report is reviewed, the licences, appointments and review dates recorded from it appear here.",
          }}
        />
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
