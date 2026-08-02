
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitBranch, List, Plus } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useServerFn } from "@/hooks/use-server-fn";
import { listCarrierHierarchies, listOrgAgents, saveCarrierHierarchy } from "@/lib/contracting-records.functions";
import { listOrgCarriers } from "@/lib/contracting-ops.functions";
import { Column, Pill, RecordTable, Stacked } from "@/components/contracting/table";
import { cn } from "@/lib/utils";


export function HierarchiesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCarrierHierarchies);
  const carriersFn = useServerFn(listOrgCarriers);
  const agentsFn = useServerFn(listOrgAgents);
  const saveFn = useServerFn(saveCarrierHierarchy);

  const [view, setView] = useState<"table" | "tree">("table");
  const [carrierFilter, setCarrierFilter] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "hierarchies"],
    queryFn: () => listFn(),
  });
  const { data: carrierData } = useQuery({
    queryKey: ["contracting-ops", "carriers"], queryFn: () => carriersFn(),
  });
  const { data: agentData } = useQuery({
    queryKey: ["contracting-ops", "agents"], queryFn: () => agentsFn(),
  });

  const save = useMutation({
    mutationFn: (p: any) => saveFn({ data: p }),
    onSuccess: () => {
      toast.success("Hierarchy saved");
      setAdding(false); setEditing(null);
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save"),
  });

  const all = (data?.rows ?? []) as any[];
  const rows = useMemo(
    () => carrierFilter ? all.filter((r) => r.org_carrier_id === carrierFilter) : all,
    [all, carrierFilter],
  );

  /**
   * Tree view groups by carrier and nests by upline. Only meaningful for one
   * carrier at a time — an agent can sit at a different place in each carrier's
   * hierarchy, so a combined tree would be a lie.
   */
  const tree = useMemo(() => {
    if (!carrierFilter) return null;
    const byUpline = new Map<string | null, any[]>();
    for (const r of rows) {
      const key = r.direct_upline_id ?? null;
      if (!byUpline.has(key)) byUpline.set(key, []);
      byUpline.get(key)!.push(r);
    }
    const seen = new Set<string>();
    const build = (uplineId: string | null, depth: number): any[] => {
      if (depth > 12) return []; // cycle guard
      return (byUpline.get(uplineId) ?? []).flatMap((r) => {
        if (seen.has(r.agent_id)) return [];
        seen.add(r.agent_id);
        return [{ ...r, depth }, ...build(r.agent_id, depth + 1)];
      });
    };
    const roots = build(null, 0);
    // Anyone whose upline is not itself in this carrier's records still needs
    // to appear, or the tree silently drops people.
    const orphans = rows.filter((r) => !seen.has(r.agent_id)).map((r) => ({ ...r, depth: 0 }));
    return [...roots, ...orphans];
  }, [rows, carrierFilter]);

  const columns: Column<any>[] = [
    { key: "agent", header: "Agent", className: "flex-[2]",
      render: (r) => <Stacked top={r.agent_name} bottom={r.agent_npn ? `NPN ${r.agent_npn}` : undefined} /> },
    { key: "carrier", header: "Carrier",
      render: (r) => <span className="truncate text-sm text-muted-foreground">{r.carrier_name}</span> },
    { key: "upline", header: "Direct upline", className: "flex-1",
      render: (r) => <Stacked top={r.upline_name ?? "—"} bottom={r.upline_npn ? `NPN ${r.upline_npn}` : undefined} /> },
    { key: "uwn", header: "Upline writing #", className: "flex-1", secondary: true,
      render: (r) => <span className="tnum truncate text-xs text-muted-foreground">{r.direct_upline_writing_number ?? "—"}</span> },
    { key: "level", header: "Level", className: "w-24", secondary: true,
      render: (r) => <span className="truncate text-xs text-muted-foreground">{r.comp_level_name ?? "—"}</span> },
    { key: "status", header: "Status", className: "w-24",
      render: (r) => <Pill tone={r.status === "active" ? "success" : r.status === "pending" ? "warning" : "neutral"}>{r.status}</Pill> },
    { key: "actions", header: "", className: "w-14",
      render: (r) => (
        <button onClick={(e) => { e.stopPropagation(); setEditing(r); }}
                className="text-[11px] text-muted-foreground hover:text-foreground">Edit</button>
      ) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={carrierFilter} onChange={(e) => setCarrierFilter(e.target.value)}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm">
          <option value="">All carriers</option>
          {(carrierData?.carriers ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div className="flex rounded-md border border-border">
          {([["table", List], ["tree", GitBranch]] as const).map(([v, Icon]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              disabled={v === "tree" && !carrierFilter}
              title={v === "tree" && !carrierFilter ? "Pick one carrier to see its tree" : undefined}
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40",
                view === v ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>

        <Button size="sm" className="ml-auto" onClick={() => setAdding(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add hierarchy record
        </Button>
      </div>

      {view === "tree" && tree ? (
        <Panel>
          <ul className="space-y-1">
            {tree.map((r) => (
              <li key={r.id} style={{ paddingLeft: `${r.depth * 20}px` }}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2/40">
                {r.depth > 0 && <span className="text-text-dim">└</span>}
                <span className="text-sm text-foreground">{r.agent_name}</span>
                {r.comp_level_name && <Pill tone="info">{r.comp_level_name}</Pill>}
                {r.direct_upline_writing_number && (
                  <span className="tnum text-[11px] text-text-dim">upline #{r.direct_upline_writing_number}</span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      ) : (
        <Panel pad={false}>
          <RecordTable
            rows={rows}
            columns={columns}
            loading={isLoading}
            empty={{
              title: "No carrier hierarchies recorded",
              body: "A carrier hierarchy is how one carrier sees your structure, which is not always your internal org chart. Recording it here is what lets a contracting packet carry the right upline, NPN and writing number.",
              action: <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add the first one</Button>,
            }}
          />
        </Panel>
      )}

      <HierarchyDialog
        open={adding || Boolean(editing)}
        record={editing}
        carriers={(carrierData?.carriers ?? []) as any[]}
        agents={(agentData?.agents ?? []) as any[]}
        pending={save.isPending}
        onClose={() => { setAdding(false); setEditing(null); }}
        onSave={(p) => save.mutate(p)}
      />
    </div>
  );
}

function HierarchyDialog({
  open, record, carriers, agents, pending, onClose, onSave,
}: {
  open: boolean; record: any | null; carriers: any[]; agents: any[];
  pending: boolean; onClose: () => void; onSave: (p: any) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const key = record?.id ?? (open ? "new" : "closed");
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setForm({
      org_carrier_id: record?.org_carrier_id ?? "",
      agent_id: record?.agent_id ?? "",
      direct_upline_id: record?.direct_upline_id ?? "",
      direct_upline_npn: record?.direct_upline_npn ?? "",
      direct_upline_writing_number: record?.direct_upline_writing_number ?? "",
      agency_writing_number: record?.agency_writing_number ?? "",
      agency_owner_npn: record?.agency_owner_npn ?? "",
      hierarchy_path: record?.hierarchy_path ?? "",
      effective_date: record?.effective_date ?? "",
      status: record?.status ?? "active",
    });
  }
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const clean = (v: string) => (v?.trim() === "" ? null : v.trim());
  const selectClass = "mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm disabled:opacity-60";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{record ? "Edit hierarchy record" : "Add a hierarchy record"}</DialogTitle>
          <DialogDescription>
            How this carrier sees the agent's placement. Packets are built from this, not from the
            internal org chart.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="h-carrier">Carrier</Label>
            <select id="h-carrier" value={form.org_carrier_id ?? ""} disabled={Boolean(record)}
                    onChange={(e) => set("org_carrier_id", e.target.value)} className={selectClass}>
              <option value="">Select…</option>
              {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="h-agent">Agent</Label>
            <select id="h-agent" value={form.agent_id ?? ""} disabled={Boolean(record)}
                    onChange={(e) => set("agent_id", e.target.value)} className={selectClass}>
              <option value="">Select…</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="h-upline">Direct upline at this carrier</Label>
            <select id="h-upline" value={form.direct_upline_id ?? ""}
                    onChange={(e) => set("direct_upline_id", e.target.value)} className={selectClass}>
              <option value="">None</option>
              {agents.filter((a) => a.id !== form.agent_id).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {([["direct_upline_npn", "Upline NPN"], ["direct_upline_writing_number", "Upline writing number"],
             ["agency_writing_number", "Agency writing number"], ["agency_owner_npn", "Agency owner NPN"]] as const)
            .map(([k, label]) => (
              <div key={k}>
                <Label htmlFor={`h-${k}`}>{label}</Label>
                <Input id={`h-${k}`} value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)} className="mt-1" />
              </div>
            ))}

          <div className="sm:col-span-2">
            <Label htmlFor="h-path">Full hierarchy path</Label>
            <Input id="h-path" value={form.hierarchy_path ?? ""} onChange={(e) => set("hierarchy_path", e.target.value)}
                   placeholder="Agent → Manager → Agency → IMO" className="mt-1" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={pending || !form.org_carrier_id || !form.agent_id}
                  onClick={() => onSave({
                    id: record?.id,
                    org_carrier_id: form.org_carrier_id,
                    agent_id: form.agent_id,
                    direct_upline_id: clean(form.direct_upline_id),
                    direct_upline_npn: clean(form.direct_upline_npn),
                    direct_upline_writing_number: clean(form.direct_upline_writing_number),
                    agency_writing_number: clean(form.agency_writing_number),
                    agency_owner_npn: clean(form.agency_owner_npn),
                    hierarchy_path: clean(form.hierarchy_path),
                    effective_date: clean(form.effective_date),
                    status: form.status,
                  })}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
