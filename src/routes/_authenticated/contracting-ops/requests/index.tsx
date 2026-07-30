import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus, Search } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { createContractingRequest, listOrgCarriers } from "@/lib/contracting-ops.functions";
import { listOrgAgents } from "@/lib/contracting-records.functions";
import { CONTRACT_TYPES } from "@/lib/contracting-ops/types";
import { Panel } from "@/components/page-shell";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { listContractingRequests } from "@/lib/contracting-ops.functions";
import {
  CONTRACT_TYPE_LABELS, REQUEST_STATUSES, REQUEST_STATUS_META, type ContractType, type RequestStatus,
} from "@/lib/contracting-ops/types";
import { AgePill, EmptyState, OwnerChip, StatusBadge } from "@/components/contracting/shared";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contracting-ops/requests/")({
  component: RequestsPage,
  head: () => ({ meta: [{ title: "Contract Requests | Agent Cloud" }] }),
});

type Scope = "open" | "all" | "mine" | "unassigned";

function RequestsPage() {
  const qc = useQueryClient();
  const fn = useServerFn(listContractingRequests);
  const carriersFn = useServerFn(listOrgCarriers);
  const agentsFn = useServerFn(listOrgAgents);
  const createFn = useServerFn(createContractingRequest);
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState<Scope>("open");
  const [status, setStatus] = useState<RequestStatus | "">("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "requests", status],
    queryFn: () => fn({ data: status ? { status } : {} }),
  });
  const { data: carrierData } = useQuery({
    queryKey: ["contracting-ops", "carriers"], queryFn: () => carriersFn(), enabled: creating,
  });
  const { data: agentData } = useQuery({
    queryKey: ["contracting-ops", "agents"], queryFn: () => agentsFn(), enabled: creating,
  });

  const create = useMutation({
    mutationFn: (p: any) => createFn({ data: p }),
    onSuccess: (r: any) => {
      toast.success(`Request ${r?.reference ?? ""} created`);
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    // The duplicate guard is a partial unique index; this surfaces its message
    // rather than a Postgres constraint name.
    onError: (e: any) => toast.error(e?.message ?? "Could not create the request"),
  });

  const rows = useMemo(() => {
    let out = (data?.rows ?? []) as any[];
    if (scope === "open") out = out.filter((r) => REQUEST_STATUS_META[r.status as RequestStatus]?.open);
    if (scope === "unassigned") out = out.filter((r) => !r.assigned_to);
    if (search.trim()) {
      const s = search.toLowerCase();
      out = out.filter((r) =>
        r.agent_name.toLowerCase().includes(s) ||
        r.carrier_name.toLowerCase().includes(s) ||
        String(r.reference ?? "").toLowerCase().includes(s) ||
        String(r.agent_npn ?? "").includes(s));
    }
    return out;
  }, [data, scope, search]);

  // Status options are limited to statuses actually present, so the filter
  // never offers a choice that returns nothing.
  const presentStatuses = useMemo(() => {
    const set = new Set((data?.rows ?? []).map((r: any) => r.status));
    return REQUEST_STATUSES.filter((s) => set.has(s));
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["open", "unassigned", "all"] as Scope[]).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              scope === s
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "open" ? "Open" : s === "unassigned" ? "Unassigned" : "All"}
          </button>
        ))}

        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> New request
        </Button>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Agent, NPN, carrier or reference"
            className="pl-8"
          />
        </div>
      </div>

      {presentStatuses.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatus("")}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium",
              status === "" ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground",
            )}
          >
            Any status
          </button>
          {presentStatuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(status === s ? "" : s)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                status === s ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground",
              )}
            >
              {REQUEST_STATUS_META[s].label}
            </button>
          ))}
        </div>
      )}

      <Panel pad={false}>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No contracting requests here"
              body="Create a contracting request when an agent needs a new carrier contract, transfer, state appointment or hierarchy change."
              action={<Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Create one</Button>}
            />
          </div>
        ) : (
          <>
            {/* Column headers on desktop only — on a phone each row reads as a
                card, where headers would be noise. */}
            <div className="hidden items-center gap-3 border-b border-border px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground lg:flex">
              <span className="flex-[2]">Agent</span>
              <span className="flex-1">Carrier</span>
              <span className="flex-1">Type</span>
              <span className="flex-1">Status</span>
              <span className="w-20">Waiting on</span>
              <span className="w-24">Readiness</span>
              <span className="w-24">Age</span>
              <span className="w-5" />
            </div>

            <ul className="divide-y divide-border-soft">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link
                    to="/contracting-ops/requests/$requestId"
                    params={{ requestId: r.id }}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-surface-2/40 lg:flex-nowrap"
                  >
                    <span className="min-w-0 flex-[2]">
                      <span className="block truncate text-sm font-medium text-foreground">{r.agent_name}</span>
                      <span className="tnum block truncate text-[11px] text-muted-foreground">
                        {r.reference ?? "—"}{r.agent_npn ? ` · NPN ${r.agent_npn}` : ""}
                      </span>
                    </span>

                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{r.carrier_name}</span>

                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {CONTRACT_TYPE_LABELS[r.contract_type as ContractType] ?? r.contract_type}
                    </span>

                    <span className="flex-1"><StatusBadge status={r.status} /></span>

                    <span className="w-20"><OwnerChip status={r.status} /></span>

                    <span className="w-24">
                      <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-2">
                          <span
                            className={cn("block h-full rounded-full", r.readiness_pct === 100 ? "bg-success" : "bg-primary")}
                            style={{ width: `${r.readiness_pct}%` }}
                          />
                        </span>
                        <span className="tnum text-[11px] text-muted-foreground">{r.readiness_pct}%</span>
                      </span>
                    </span>

                    <span className="w-24"><AgePill days={r.days_open} overdue={r.is_overdue} /></span>

                    <ChevronRight className="hidden h-4 w-4 shrink-0 text-text-dim lg:block" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <CreateRequestDialog
        open={creating}
        carriers={(carrierData?.carriers ?? []) as any[]}
        agents={(agentData?.agents ?? []) as any[]}
        pending={create.isPending}
        onClose={() => setCreating(false)}
        onSave={(p) => create.mutate(p)}
      />

      {rows.length > 0 && (
        <p className="text-[11px] text-text-dim">
          Showing {rows.length} request{rows.length === 1 ? "" : "s"}. You see the agents your role covers —
          agents see their own, managers see their downline.
        </p>
      )}
    </div>
  );
}

/**
 * New request.
 *
 * States are entered as a comma list rather than a fifty-checkbox grid: staff
 * doing this all day type "TX, OK, NM" faster than they can hunt a grid, and
 * the field normalises whatever separator they use.
 */
function CreateRequestDialog({
  open, carriers, agents, pending, onClose, onSave,
}: {
  open: boolean; carriers: any[]; agents: any[]; pending: boolean;
  onClose: () => void; onSave: (p: any) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({ contract_type: "new_contract" });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const selectClass = "mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm";

  const states = (form.requested_states ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length === 2);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New contracting request</DialogTitle>
          <DialogDescription>
            One open request per agent, carrier and type — a duplicate is refused rather than
            quietly created.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="cr-agent">Agent</Label>
            <select id="cr-agent" value={form.agent_id ?? ""} onChange={(e) => set("agent_id", e.target.value)} className={selectClass}>
              <option value="">Select…</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="cr-carrier">Carrier</Label>
            <select id="cr-carrier" value={form.org_carrier_id ?? ""} onChange={(e) => set("org_carrier_id", e.target.value)} className={selectClass}>
              <option value="">Select…</option>
              {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cr-type">Request type</Label>
            <select id="cr-type" value={form.contract_type} onChange={(e) => set("contract_type", e.target.value)} className={selectClass}>
              {CONTRACT_TYPES.map((t) => (
                <option key={t} value={t}>{CONTRACT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cr-states">Requested states</Label>
            <Input id="cr-states" value={form.requested_states ?? ""} onChange={(e) => set("requested_states", e.target.value)}
                   placeholder="TX, OK, NM" className="mt-1" />
            {states.length > 0 && (
              <p className="mt-1 text-[11px] text-text-dim">{states.length} state{states.length === 1 ? "" : "s"}: {states.join(", ")}</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cr-products">Product lines</Label>
            <Input id="cr-products" value={form.product_lines ?? ""} onChange={(e) => set("product_lines", e.target.value)}
                   placeholder="Final expense, Term" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="cr-priority">Priority</Label>
            <select id="cr-priority" value={form.priority ?? ""} onChange={(e) => set("priority", e.target.value)} className={selectClass}>
              <option value="">Agency default</option>
              {["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="cr-eff">Desired effective date</Label>
            <Input id="cr-eff" type="date" value={form.desired_effective_date ?? ""}
                   onChange={(e) => set("desired_effective_date", e.target.value)} className="mt-1" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cr-notes">Notes</Label>
            <textarea id="cr-notes" rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)}
                      className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={pending || !form.agent_id || !form.org_carrier_id}
                  onClick={() => onSave({
                    agent_id: form.agent_id,
                    org_carrier_id: form.org_carrier_id,
                    contract_type: form.contract_type,
                    requested_states: states,
                    product_lines: (form.product_lines ?? "").split(",").map((p) => p.trim()).filter(Boolean),
                    priority: form.priority || undefined,
                    desired_effective_date: form.desired_effective_date || null,
                    is_transfer: form.contract_type === "transfer",
                    notes: form.notes?.trim() || null,
                  })}>
            {pending ? "Creating…" : "Create request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
