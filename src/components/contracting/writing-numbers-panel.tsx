
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useServerFn } from "@/hooks/use-server-fn";
import {
  deleteWritingNumber, listOrgAgents, listWritingNumbers, saveWritingNumber,
} from "@/lib/contracting-records.functions";
import { listOrgCarriers } from "@/lib/contracting-ops.functions";
import { Column, FilterChips, Pill, RecordTable, Stacked } from "@/components/contracting/table";
import { toCsv } from "@/lib/contracting-ops/packet";
import { ghostFor } from "@/lib/empty-states";


const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  active: "success", pending: "warning", suspended: "warning",
  terminated: "danger", unknown: "neutral",
};

export function WritingNumbersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listWritingNumbers);
  const carriersFn = useServerFn(listOrgCarriers);
  const agentsFn = useServerFn(listOrgAgents);
  const saveFn = useServerFn(saveWritingNumber);
  const deleteFn = useServerFn(deleteWritingNumber);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string | "">("");
  const [editing, setEditing] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "writing-numbers"],
    queryFn: () => listFn(),
  });
  const { data: carrierData } = useQuery({
    queryKey: ["contracting-ops", "carriers"],
    queryFn: () => carriersFn(),
  });
  const { data: agentData } = useQuery({
    queryKey: ["contracting-ops", "agents"],
    queryFn: () => agentsFn(),
  });

  const save = useMutation({
    mutationFn: (p: any) => saveFn({ data: p }),
    onSuccess: () => {
      toast.success("Writing number saved");
      setAdding(false); setEditing(null);
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Writing number removed");
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove"),
  });

  const rows = useMemo(() => {
    let out = (data?.rows ?? []) as any[];
    if (status) out = out.filter((r) => r.status === status);
    if (search.trim()) {
      const s = search.toLowerCase();
      out = out.filter((r) =>
        r.agent_name.toLowerCase().includes(s) ||
        r.carrier_name.toLowerCase().includes(s) ||
        String(r.writing_number).toLowerCase().includes(s) ||
        String(r.agent_npn ?? "").includes(s) ||
        String(r.state_code ?? "").toLowerCase().includes(s));
    }
    return out;
  }, [data, status, search]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of data?.rows ?? []) c[(r as any).status] = (c[(r as any).status] ?? 0) + 1;
    return c;
  }, [data]);

  const columns: Column<any>[] = [
    { key: "agent", header: "Agent", className: "flex-[2]",
      render: (r) => <Stacked top={r.agent_name} bottom={r.agent_npn ? `NPN ${r.agent_npn}` : undefined} /> },
    { key: "carrier", header: "Carrier", render: (r) => <span className="truncate text-sm text-muted-foreground">{r.carrier_name}</span> },
    { key: "number", header: "Writing number",
      render: (r) => <span className="tnum truncate text-sm font-medium text-foreground">{r.writing_number}</span> },
    { key: "scope", header: "Scope", secondary: true,
      render: (r) => (
        <span className="truncate text-xs text-muted-foreground">
          {r.scope === "national" ? "National" : r.scope === "state" ? (r.state_code ?? "State") : (r.product_line ?? "Product")}
        </span>
      ) },
    { key: "level", header: "Level", secondary: true,
      render: (r) => <span className="truncate text-xs text-muted-foreground">{r.comp_level_name ?? "—"}</span> },
    { key: "status", header: "Status", className: "w-24",
      render: (r) => <Pill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Pill> },
    { key: "actions", header: "", className: "w-16",
      render: (r) => (
        <span className="flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(r); }}
            className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Remove writing number ${r.writing_number} for ${r.agent_name}?`)) remove.mutate(r.id);
            }}
            aria-label="Remove"
            className="rounded p-1 text-text-dim hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      ) },
  ];

  const exportCsv = () => {
    const headers = ["Agent", "NPN", "Carrier", "Writing number", "Type", "Scope", "State", "Product", "Status", "Effective", "Level"];
    const csv = toCsv(headers, rows.map((r) => [
      r.agent_name, r.agent_npn ?? "", r.carrier_name, r.writing_number, r.number_type,
      r.scope, r.state_code ?? "", r.product_line ?? "", r.status, r.effective_date ?? "", r.comp_level_name ?? "",
    ]));
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `writing-numbers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dim" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
                 placeholder="Agent, NPN, carrier, number or state" className="pl-8" />
        </div>
        <div className="ml-auto flex gap-2">
          {rows.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Export
            </Button>
          )}
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add writing number
          </Button>
        </div>
      </div>

      <FilterChips
        value={status}
        onChange={setStatus}
        allLabel="Any status"
        options={Object.entries(statusCounts).map(([v, count]) => ({ value: v, label: v, count }))}
      />

      <Panel pad={false}>
        <RecordTable
          rows={rows}
          columns={columns}
          loading={isLoading}
          empty={{
            ghost: ghostFor("writing-numbers"),
            title: "Your carrier writing numbers live here",
            body: "Add writing numbers manually as carriers issue them, or export this list once you have some. An agent can hold several per carrier — one per state or product line where the carrier numbers them separately.",
            action: <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add the first one</Button>,
          }}
        />
      </Panel>

      <WritingNumberDialog
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

function WritingNumberDialog({
  open, record, carriers, agents, pending, onClose, onSave,
}: {
  open: boolean;
  record: any | null;
  carriers: any[];
  agents: any[];
  pending: boolean;
  onClose: () => void;
  onSave: (p: any) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const key = record?.id ?? (open ? "new" : "closed");
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setForm({
      agent_id: record?.agent_id ?? "",
      org_carrier_id: record?.org_carrier_id ?? "",
      writing_number: record?.writing_number ?? "",
      number_type: record?.number_type ?? "individual",
      scope: record?.scope ?? "national",
      state_code: record?.state_code ?? "",
      product_line: record?.product_line ?? "",
      effective_date: record?.effective_date ?? "",
      status: record?.status ?? "active",
      upline_writing_number: record?.upline_writing_number ?? "",
      notes: record?.notes ?? "",
    });
  }
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const clean = (v: string) => (v?.trim() === "" ? null : v.trim());

  const selectClass =
    "mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{record ? "Edit writing number" : "Add a writing number"}</DialogTitle>
          <DialogDescription>
            An agent can hold more than one per carrier. Scope it when the carrier numbers by state
            or product.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="wn-agent">Agent</Label>
            <select id="wn-agent" value={form.agent_id ?? ""} onChange={(e) => set("agent_id", e.target.value)} className={selectClass}>
              <option value="">Select an agent…</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.npn ? ` — ${a.npn}` : ""}</option>)}
            </select>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="wn-carrier">Carrier</Label>
            <select id="wn-carrier" value={form.org_carrier_id ?? ""} onChange={(e) => set("org_carrier_id", e.target.value)} className={selectClass}>
              <option value="">Select a carrier…</option>
              {carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <Label htmlFor="wn-number">Writing number</Label>
            <Input id="wn-number" value={form.writing_number ?? ""} onChange={(e) => set("writing_number", e.target.value)} className="mt-1" />
          </div>

          <div>
            <Label htmlFor="wn-status">Status</Label>
            <select id="wn-status" value={form.status ?? "active"} onChange={(e) => set("status", e.target.value)} className={selectClass}>
              {["active", "pending", "terminated", "suspended", "unknown"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <Label htmlFor="wn-scope">Scope</Label>
            <select id="wn-scope" value={form.scope ?? "national"} onChange={(e) => set("scope", e.target.value)} className={selectClass}>
              <option value="national">National</option>
              <option value="state">State specific</option>
              <option value="product">Product specific</option>
            </select>
          </div>

          {form.scope === "state" && (
            <div>
              <Label htmlFor="wn-state">State</Label>
              <Input id="wn-state" maxLength={2} value={form.state_code ?? ""}
                     onChange={(e) => set("state_code", e.target.value.toUpperCase())} placeholder="TX" className="mt-1" />
            </div>
          )}
          {form.scope === "product" && (
            <div>
              <Label htmlFor="wn-product">Product line</Label>
              <Input id="wn-product" value={form.product_line ?? ""} onChange={(e) => set("product_line", e.target.value)} className="mt-1" />
            </div>
          )}

          <div>
            <Label htmlFor="wn-eff">Effective date</Label>
            <Input id="wn-eff" type="date" value={form.effective_date ?? ""} onChange={(e) => set("effective_date", e.target.value)} className="mt-1" />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="wn-upline">Upline writing number</Label>
            <Input id="wn-upline" value={form.upline_writing_number ?? ""} onChange={(e) => set("upline_writing_number", e.target.value)}
                   placeholder="Carriers ask for this on most contracting forms" className="mt-1" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={pending || !form.agent_id || !form.org_carrier_id || !form.writing_number?.trim()}
            onClick={() => onSave({
              id: record?.id,
              agent_id: form.agent_id,
              org_carrier_id: form.org_carrier_id,
              writing_number: form.writing_number.trim(),
              number_type: form.number_type,
              scope: form.scope,
              state_code: form.scope === "state" ? clean(form.state_code) : null,
              product_line: form.scope === "product" ? clean(form.product_line) : null,
              effective_date: clean(form.effective_date),
              status: form.status,
              upline_writing_number: clean(form.upline_writing_number),
              notes: clean(form.notes),
            })}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
