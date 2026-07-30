import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useServerFn } from "@/hooks/use-server-fn";
import { listCompLevels, saveCompLevel, saveRoleCompMapping } from "@/lib/contracting-records.functions";
import { listOrgCarriers } from "@/lib/contracting-ops.functions";
import { Column, Pill, RecordTable, Stacked } from "@/components/contracting/table";
import { EmptyState } from "@/components/contracting/shared";

export const Route = createFileRoute("/_authenticated/contracting-ops/compensation")({
  component: CompensationPage,
  head: () => ({ meta: [{ title: "Compensation Levels | Agent Cloud" }] }),
});

const INTERNAL_ROLES = ["agent", "senior_agent", "manager", "agency_owner"];

function CompensationPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCompLevels);
  const carriersFn = useServerFn(listOrgCarriers);
  const saveFn = useServerFn(saveCompLevel);
  const mapFn = useServerFn(saveRoleCompMapping);

  const [editing, setEditing] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);
  const [carrierFilter, setCarrierFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "comp-levels"],
    queryFn: () => listFn(),
  });
  const { data: carrierData } = useQuery({
    queryKey: ["contracting-ops", "carriers"],
    queryFn: () => carriersFn(),
  });

  const save = useMutation({
    mutationFn: (p: any) => saveFn({ data: p }),
    onSuccess: () => {
      toast.success("Compensation level saved");
      setAdding(false); setEditing(null);
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save"),
  });

  const map = useMutation({
    mutationFn: (p: any) => mapFn({ data: p }),
    onSuccess: () => {
      toast.success("Role mapping saved");
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save the mapping"),
  });

  const all = (data?.rows ?? []) as any[];
  const rows = useMemo(
    () => carrierFilter ? all.filter((r) => r.org_carrier_id === carrierFilter) : all,
    [all, carrierFilter],
  );

  const columns: Column<any>[] = [
    { key: "level", header: "Level", className: "flex-[2]",
      render: (r) => <Stacked top={r.level_name} bottom={r.carrier_name} /> },
    { key: "pct", header: "Commission", className: "w-28",
      render: (r) => <span className="tnum text-sm text-foreground">{r.commission_pct != null ? `${r.commission_pct}%` : "—"}</span> },
    { key: "advance", header: "Advance", className: "w-32",
      render: (r) => (
        <span className="tnum text-xs text-muted-foreground">
          {r.advance_pct != null ? `${r.advance_pct}%` : "—"}
          {r.advance_months ? ` · ${r.advance_months}mo` : ""}
        </span>
      ) },
    { key: "renewal", header: "Renewal", className: "w-24", secondary: true,
      render: (r) => <span className="tnum text-xs text-muted-foreground">{r.renewal_pct != null ? `${r.renewal_pct}%` : "—"}</span> },
    { key: "roles", header: "Eligible roles", className: "flex-1", secondary: true,
      render: (r) => <span className="truncate text-xs text-muted-foreground">
        {(r.role_eligibility ?? []).join(", ") || "Any"}
      </span> },
    { key: "status", header: "Status", className: "w-24",
      render: (r) => <Pill tone={r.status === "active" ? "success" : "neutral"}>{r.status}</Pill> },
    { key: "actions", header: "", className: "w-14",
      render: (r) => (
        <button onClick={(e) => { e.stopPropagation(); setEditing(r); }}
                className="text-[11px] text-muted-foreground hover:text-foreground">Edit</button>
      ) },
  ];

  // An empty list can mean "none configured" or "you may not see compensation".
  // Those are different answers and the empty state says which.
  if (!isLoading && all.length === 0) {
    return (
      <EmptyState
        title="No compensation levels configured"
        body="Add the levels each carrier offers, then map your internal roles to them. Levels are compensation data — if you expected to see some here, your agency owner controls who can view them."
        action={<Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add a level</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={carrierFilter}
          onChange={(e) => setCarrierFilter(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="">All carriers</option>
          {(carrierData?.carriers ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add level
        </Button>
      </div>

      <Panel pad={false}>
        <RecordTable
          rows={rows}
          columns={columns}
          loading={isLoading}
          empty={{ title: "No levels for this carrier", body: "Add the levels this carrier offers your agency." }}
        />
      </Panel>

      <Panel title="Internal role to carrier level">
        <p className="text-xs text-muted-foreground">
          Mapping a role recommends a level when somebody is promoted. It never changes an agent's
          compensation on its own — a promotion raises a change request for approval.
        </p>
        <div className="mt-3 space-y-2">
          {INTERNAL_ROLES.map((role) => {
            const existing = (data?.mappings ?? []).filter((m: any) => m.internal_role === role);
            return (
              <div key={role} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2">
                <span className="w-32 shrink-0 text-sm font-medium capitalize text-foreground">
                  {role.replace(/_/g, " ")}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {existing.length
                    ? existing.map((m: any) => `${m.carrier_name}: ${m.level_name}`).join(" · ")
                    : "Not mapped"}
                </span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const level = all.find((l) => l.id === e.target.value);
                    if (!level) return;
                    map.mutate({ org_carrier_id: level.org_carrier_id, internal_role: role, comp_level_id: level.id });
                    e.currentTarget.value = "";
                  }}
                  className="rounded-md border border-border bg-card px-2 py-1 text-xs"
                >
                  <option value="">Map to…</option>
                  {all.filter((l) => l.status === "active").map((l) => (
                    <option key={l.id} value={l.id}>{l.carrier_name} — {l.level_name}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </Panel>

      <p className="flex items-start gap-1.5 text-[11px] text-text-dim">
        <Lock className="mt-0.5 h-3 w-3 shrink-0" />
        Compensation levels are restricted. Agents see only the level they hold, through their own
        records.
      </p>

      <CompLevelDialog
        open={adding || Boolean(editing)}
        record={editing}
        carriers={(carrierData?.carriers ?? []) as any[]}
        pending={save.isPending}
        onClose={() => { setAdding(false); setEditing(null); }}
        onSave={(p) => save.mutate(p)}
      />
    </div>
  );
}

function CompLevelDialog({
  open, record, carriers, pending, onClose, onSave,
}: {
  open: boolean; record: any | null; carriers: any[]; pending: boolean;
  onClose: () => void; onSave: (p: any) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState<string[]>([]);
  const key = record?.id ?? (open ? "new" : "closed");
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setForm({
      org_carrier_id: record?.org_carrier_id ?? "",
      level_name: record?.level_name ?? "",
      commission_pct: record?.commission_pct != null ? String(record.commission_pct) : "",
      advance_pct: record?.advance_pct != null ? String(record.advance_pct) : "",
      advance_months: record?.advance_months != null ? String(record.advance_months) : "",
      renewal_pct: record?.renewal_pct != null ? String(record.renewal_pct) : "",
      chargeback_rules: record?.chargeback_rules ?? "",
      status: record?.status ?? "active",
    });
    setRoles(record?.role_eligibility ?? []);
  }
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v: string) => (v?.trim() === "" ? null : Number(v));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{record ? `Edit ${record.level_name}` : "Add a compensation level"}</DialogTitle>
          <DialogDescription>The levels this carrier offers your agency.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="cl-carrier">Carrier</Label>
            <select id="cl-carrier" value={form.org_carrier_id ?? ""} onChange={(e) => set("org_carrier_id", e.target.value)}
                    disabled={Boolean(record)}
                    className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60">
              <option value="">Select a carrier…</option>
              {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="cl-name">Level name</Label>
            <Input id="cl-name" value={form.level_name ?? ""} onChange={(e) => set("level_name", e.target.value)}
                   placeholder="e.g. 80%" className="mt-1" />
          </div>

          {([["commission_pct", "Commission %"], ["advance_pct", "Advance %"],
             ["advance_months", "Advance months"], ["renewal_pct", "Renewal %"]] as const).map(([k, label]) => (
            <div key={k}>
              <Label htmlFor={`cl-${k}`}>{label}</Label>
              <Input id={`cl-${k}`} inputMode="decimal" value={form[k] ?? ""}
                     onChange={(e) => set(k, e.target.value)} className="mt-1" />
            </div>
          ))}

          <div className="sm:col-span-2">
            <Label>Eligible roles</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {INTERNAL_ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r])}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${
                    roles.includes(r) ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  {r.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={pending || !form.org_carrier_id || !form.level_name?.trim()}
                  onClick={() => onSave({
                    id: record?.id,
                    org_carrier_id: form.org_carrier_id,
                    level_name: form.level_name.trim(),
                    commission_pct: num(form.commission_pct),
                    advance_pct: num(form.advance_pct),
                    advance_months: num(form.advance_months),
                    renewal_pct: num(form.renewal_pct),
                    chargeback_rules: form.chargeback_rules?.trim() || null,
                    role_eligibility: roles,
                    status: form.status,
                  })}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
