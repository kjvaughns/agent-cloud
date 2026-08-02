
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useServerFn } from "@/hooks/use-server-fn";
import { createHierarchyChange, decideHierarchyChange, listHierarchyChanges } from "@/lib/contracting-workflow.functions";
import { listOrgAgents } from "@/lib/contracting-records.functions";
import { listOrgCarriers } from "@/lib/contracting-ops.functions";
import { HIERARCHY_CHANGE_LABELS, HIERARCHY_CHANGE_TYPES, type HierarchyChangeType } from "@/lib/contracting-ops/types";
import { Column, FilterChips, Pill, RecordTable, Stacked } from "@/components/contracting/table";
import { cn } from "@/lib/utils";


const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  draft: "neutral", awaiting_manager: "warning", awaiting_owner: "warning",
  approved: "info", processing: "info", submitted_to_carrier: "info",
  carrier_confirmed: "info", applied: "success", declined: "danger", cancelled: "neutral",
};

const STEP_LABEL: Record<string, string> = {
  manager: "Manager review", owner: "Owner approval",
  contracting_staff: "Contracting staff", carrier: "Carrier confirmation",
};

export function HierarchyChangesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listHierarchyChanges);
  const createFn = useServerFn(createHierarchyChange);
  const decideFn = useServerFn(decideHierarchyChange);
  const agentsFn = useServerFn(listOrgAgents);
  const carriersFn = useServerFn(listOrgCarriers);

  const [status, setStatus] = useState<string | "">("");
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "hierarchy-changes"], queryFn: () => listFn(),
  });
  const { data: agentData } = useQuery({ queryKey: ["contracting-ops", "agents"], queryFn: () => agentsFn() });
  const { data: carrierData } = useQuery({ queryKey: ["contracting-ops", "carriers"], queryFn: () => carriersFn() });

  const create = useMutation({
    mutationFn: (p: any) => createFn({ data: p }),
    onSuccess: (r: any) => {
      toast.success(`Change request ${r?.reference ?? ""} raised`);
      setAdding(false);
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not raise the request"),
  });

  const decide = useMutation({
    mutationFn: (p: any) => decideFn({ data: p }),
    onSuccess: (r: any) => {
      toast.success(`Recorded — now ${String(r?.status ?? "").replace(/_/g, " ")}`);
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not record the decision"),
  });

  const all = (data?.rows ?? []) as any[];
  const rows = useMemo(() => status ? all.filter((r) => r.status === status) : all, [all, status]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of all) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [all]);

  const columns: Column<any>[] = [
    { key: "agent", header: "Agent", className: "flex-[2]",
      render: (r) => <Stacked top={r.agent_name} bottom={`${r.reference ?? ""} · ${r.carrier_name}`} /> },
    { key: "type", header: "Change", className: "flex-1",
      render: (r) => <span className="truncate text-sm text-muted-foreground">
        {HIERARCHY_CHANGE_LABELS[r.change_type as HierarchyChangeType] ?? r.change_type}
      </span> },
    { key: "move", header: "From → to", className: "flex-1", secondary: true,
      render: (r) => (
        <span className="truncate text-xs text-muted-foreground">
          {r.current_upline_name ?? "—"} → {r.requested_upline_name ?? "—"}
        </span>
      ) },
    { key: "status", header: "Status", className: "w-40",
      render: (r) => <Pill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status.replace(/_/g, " ")}</Pill> },
    { key: "blocking", header: "Waiting on", className: "w-32",
      render: (r) => <span className="truncate text-xs text-muted-foreground">
        {r.blocking_step ? STEP_LABEL[r.blocking_step] : "—"}
      </span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChips
          value={status}
          onChange={setStatus}
          allLabel="Any status"
          options={Object.entries(counts).map(([v, count]) => ({ value: v, label: v.replace(/_/g, " "), count }))}
        />
        <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Raise a change
        </Button>
      </div>

      <Panel pad={false}>
        <RecordTable
          rows={rows}
          columns={columns}
          loading={isLoading}
          onRowClick={(r) => setExpanded(expanded === r.id ? null : r.id)}
          empty={{
            title: "No hierarchy changes",
            body: "Raise a change when an agent is promoted, moves upline, transfers, or needs a compensation or writing number correction. Each one carries its own approval chain.",
            action: <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Raise the first one</Button>,
          }}
        />
      </Panel>

      {expanded && (() => {
        const r = all.find((x) => x.id === expanded);
        if (!r) return null;
        return (
          <Panel title={`Approval chain — ${r.reference ?? ""}`}>
            {r.reason && <p className="mb-3 text-sm text-muted-foreground">{r.reason}</p>}
            {(r.carrier_impact ?? []).length > 0 && (
              <p className="mb-3 text-xs text-muted-foreground">
                Affects {r.carrier_impact.length} carrier record
                {r.carrier_impact.length === 1 ? "" : "s"}:{" "}
                {r.carrier_impact.map((c: any) => c.carrier_name).filter(Boolean).join(", ")}
              </p>
            )}
            <ol className="space-y-2">
              {(r.approvals ?? []).map((ap: any) => (
                <li key={ap.id} className={cn(
                  "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2",
                  ap.decision === "approved" && "border-success/30 bg-success/[0.04]",
                  ap.decision === "declined" && "border-destructive/30 bg-destructive/[0.04]",
                  ap.decision === "pending" && "border-warning/30 bg-warning/[0.04]",
                  ap.decision === "skipped" && "border-border opacity-60",
                )}>
                  <span className="tnum w-5 text-xs text-text-dim">{ap.step_order}</span>
                  <span className="min-w-0 flex-1 text-sm text-foreground">{STEP_LABEL[ap.step] ?? ap.step}</span>
                  <Pill tone={
                    ap.decision === "approved" ? "success"
                      : ap.decision === "declined" ? "danger"
                      : ap.decision === "pending" ? "warning" : "neutral"
                  }>
                    {ap.decision === "skipped" ? "not required" : ap.decision}
                  </Pill>
                  {ap.decision === "pending" && data?.canApprove && (
                    <span className="flex gap-1.5">
                      <Button size="sm" variant="outline" disabled={decide.isPending}
                              onClick={() => decide.mutate({ id: r.id, step: ap.step, decision: "approved" })}>
                        <Check className="mr-1 h-3 w-3" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" disabled={decide.isPending}
                              onClick={() => {
                                const comment = prompt("Why is this being declined?");
                                if (comment !== null) decide.mutate({ id: r.id, step: ap.step, decision: "declined", comment });
                              }}>
                        <X className="mr-1 h-3 w-3" /> Decline
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[11px] text-text-dim">
              Nothing is applied at the carrier automatically. The carrier step is a human recording
              what the carrier actually confirmed; the internal record updates only once every step
              has cleared.
            </p>
          </Panel>
        );
      })()}

      <ChangeDialog
        open={adding}
        agents={(agentData?.agents ?? []) as any[]}
        carriers={(carrierData?.carriers ?? []) as any[]}
        pending={create.isPending}
        onClose={() => setAdding(false)}
        onSave={(p) => create.mutate(p)}
      />
    </div>
  );
}

function ChangeDialog({
  open, agents, carriers, pending, onClose, onSave,
}: {
  open: boolean; agents: any[]; carriers: any[]; pending: boolean;
  onClose: () => void; onSave: (p: any) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({ change_type: "promotion" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const clean = (v: string) => (v?.trim() === "" ? null : v.trim());
  const selectClass = "mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Raise a hierarchy change</DialogTitle>
          <DialogDescription>
            The approval chain is built from your agency's settings. Nothing moves at a carrier until
            every step clears.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="hc-agent">Agent</Label>
            <select id="hc-agent" value={form.agent_id ?? ""} onChange={(e) => set("agent_id", e.target.value)} className={selectClass}>
              <option value="">Select…</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="hc-type">Change type</Label>
            <select id="hc-type" value={form.change_type} onChange={(e) => set("change_type", e.target.value)} className={selectClass}>
              {HIERARCHY_CHANGE_TYPES.map((t) => (
                <option key={t} value={t}>{HIERARCHY_CHANGE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="hc-carrier">Carrier</Label>
            <select id="hc-carrier" value={form.org_carrier_id ?? ""} onChange={(e) => set("org_carrier_id", e.target.value)} className={selectClass}>
              <option value="">Every carrier this agent holds</option>
              {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="hc-upline">New direct upline</Label>
            <select id="hc-upline" value={form.requested_upline_id ?? ""} onChange={(e) => set("requested_upline_id", e.target.value)} className={selectClass}>
              <option value="">No change</option>
              {agents.filter((a) => a.id !== form.agent_id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="hc-role">New role</Label>
            <Input id="hc-role" value={form.requested_role ?? ""} onChange={(e) => set("requested_role", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="hc-eff">Effective date</Label>
            <Input id="hc-eff" type="date" value={form.requested_effective_date ?? ""}
                   onChange={(e) => set("requested_effective_date", e.target.value)} className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="hc-reason">Reason</Label>
            <textarea id="hc-reason" rows={2} value={form.reason ?? ""} onChange={(e) => set("reason", e.target.value)}
                      className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={pending || !form.agent_id}
                  onClick={() => onSave({
                    agent_id: form.agent_id,
                    org_carrier_id: clean(form.org_carrier_id ?? ""),
                    change_type: form.change_type,
                    requested_upline_id: clean(form.requested_upline_id ?? ""),
                    requested_role: clean(form.requested_role ?? ""),
                    requested_effective_date: clean(form.requested_effective_date ?? ""),
                    reason: clean(form.reason ?? ""),
                  })}>
            {pending ? "Raising…" : "Raise change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
