import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListCommissionGrid,
  adminUpsertCommissionRow,
  adminListAllAgents,
} from "@/lib/admin.functions";
import { CompLevelEditor } from "@/components/admin/comp-level-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/commissions")({
  component: AdminCommissions,
  head: () => ({ meta: [{ title: "Commission Grids — Agent Cloud Admin" }] }),
});

function AdminCommissions() {
  const [tab, setTab] = useState<"grids" | "assignments">("grids");
  const [grids, setGrids] = useState<any[]>([]);
  const [carriers, setCarriers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCarrierIds, setOpenCarrierIds] = useState<Set<string>>(new Set());
  const [editRow, setEditRow] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const [openAgentId, setOpenAgentId] = useState<string | null>(null);

  const listAgentsFn = useServerFn(adminListAllAgents);
  const { data: agentsData } = useQuery({
    queryKey: ["admin", "allAgents"],
    queryFn: () => listAgentsFn(),
    enabled: tab === "assignments",
  });
  const allAgents = agentsData?.agents ?? [];
  const filteredAgents = allAgents.filter((a: any) =>
    `${a.first_name ?? ""} ${a.last_name ?? ""} ${a.email ?? ""}`.toLowerCase().includes(agentSearch.toLowerCase())
  );

  function toggleCarrier(id: string) {
    setOpenCarrierIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function load() {
    setLoading(true);
    const res = await adminListCommissionGrid();
    setGrids(res.grids);
    const { data } = await supabase.from("carriers").select("id, name").eq("active", true).order("name");
    setCarriers(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function saveRow() {
    if (!editRow) return;
    setSaving(true);
    try {
      await adminUpsertCommissionRow({ data: editRow });
      toast.success("Saved");
      setEditRow(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Commission Grids</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage carrier commission structures and agent assignments</p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border pb-0">
        {(["grids", "assignments"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm capitalize transition-colors border-b-2 -mb-px",
              tab === t ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "grids" ? "Carrier Grids" : "Agent Assignments"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : tab === "grids" ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setEditRow({ carrier_id: "", product_name: "", level_name: "", year_1_pct: 0, years_2_5_pct: 0, years_6_plus_pct: 0 })}>
              <Plus className="h-4 w-4 mr-1.5" />Add Row
            </Button>
          </div>

          {carriers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No carriers found.</p>
          ) : (
            <div className="space-y-2">
              {carriers.map((carrier) => {
                const carrierRows = grids.filter((g) => g.carrier_id === carrier.id);
                const isOpen = openCarrierIds.has(carrier.id);
                const productCount = new Set(carrierRows.map((r) => r.product_name)).size;
                const levelCount = new Set(carrierRows.map((r) => r.level_name).filter(Boolean)).size;

                return (
                  <Card key={carrier.id} className="overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => toggleCarrier(carrier.id)}
                    >
                      <div className="flex items-center gap-3">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="font-semibold text-sm">{carrier.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {carrierRows.length > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {productCount} {productCount === 1 ? "product" : "products"} · {levelCount} {levelCount === 1 ? "level" : "levels"}
                          </span>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">No data</Badge>
                        )}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 pt-1 border-t">
                        {carrierRows.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4 text-center">
                            No grid rows for this carrier.{" "}
                            <button
                              className="underline hover:no-underline"
                              onClick={() => setEditRow({ carrier_id: carrier.id, product_name: "", level_name: "", year_1_pct: 0, years_2_5_pct: 0, years_6_plus_pct: 0 })}
                            >
                              Add one
                            </button>
                          </p>
                        ) : (
                          <AdminGridView rows={carrierRows} onEdit={setEditRow} />
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <Input
            placeholder="Search agents by name or email..."
            value={agentSearch}
            onChange={(e) => { setAgentSearch(e.target.value); setOpenAgentId(null); }}
            className="max-w-sm"
          />
          {filteredAgents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              {allAgents.length === 0 ? "Loading agents..." : "No agents match."}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredAgents.map((agent: any) => {
                const isOpen = openAgentId === agent.id;
                const name = `${agent.first_name ?? ""} ${agent.last_name ?? ""}`.trim() || agent.email;
                return (
                  <Card key={agent.id} className="overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                      onClick={() => setOpenAgentId(isOpen ? null : agent.id)}
                    >
                      <div>
                        <div className="font-medium text-sm">{name}</div>
                        <div className="text-xs text-muted-foreground">{agent.email}</div>
                      </div>
                      <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", isOpen && "rotate-180")} />
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 pt-2 border-t">
                        <CompLevelEditor agentId={agent.id} agentName={name} />
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editRow?.id ? "Edit Grid Row" : "Add Grid Row"}</DialogTitle></DialogHeader>
          {editRow && (
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Carrier</label>
                <Select value={editRow.carrier_id} onValueChange={(v) => setEditRow({ ...editRow, carrier_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select carrier" /></SelectTrigger>
                  <SelectContent>{carriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Product Name</label>
                  <Input value={editRow.product_name} onChange={(e) => setEditRow({ ...editRow, product_name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Level Name</label>
                  <Input value={editRow.level_name ?? ""} onChange={(e) => setEditRow({ ...editRow, level_name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Year 1 %</label>
                  <Input type="number" value={editRow.year_1_pct} onChange={(e) => setEditRow({ ...editRow, year_1_pct: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Year 2-5 %</label>
                  <Input type="number" value={editRow.years_2_5_pct} onChange={(e) => setEditRow({ ...editRow, years_2_5_pct: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Year 6+ %</label>
                  <Input type="number" value={editRow.years_6_plus_pct} onChange={(e) => setEditRow({ ...editRow, years_6_plus_pct: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)}>Cancel</Button>
            <Button onClick={saveRow} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function AdminGridView({ rows, onEdit }: { rows: any[]; onEdit: (row: any) => void }) {
  const levelMap = new Map<string, number>();
  rows.forEach((r) => {
    if (r.level_name) {
      const pct = Number(r.year_1_pct);
      if (!levelMap.has(r.level_name) || pct > levelMap.get(r.level_name)!) {
        levelMap.set(r.level_name, pct);
      }
    }
  });
  const levels = Array.from(levelMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, pct]) => ({ name, pct }));

  if (levels.length === 0) {
    return <div className="text-sm text-muted-foreground py-4">No named levels configured for this carrier.</div>;
  }

  const hasAgeBands = rows.some((r) => r.age_group_min != null);

  if (!hasAgeBands) {
    return <AdminGridTable rows={rows} levels={levels} onEdit={onEdit} />;
  }

  const bands = new Map<string, any[]>();
  rows.forEach((r) => {
    const key = `${r.age_group_min ?? ""}–${r.age_group_max ?? ""}`;
    if (!bands.has(key)) bands.set(key, []);
    bands.get(key)!.push(r);
  });

  return (
    <div className="space-y-6">
      {Array.from(bands.entries()).map(([range, bandRows]) => (
        <div key={range}>
          <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Ages {range}</div>
          <AdminGridTable rows={bandRows} levels={levels} onEdit={onEdit} />
        </div>
      ))}
    </div>
  );
}

function AdminGridTable({
  rows,
  levels,
  onEdit,
}: {
  rows: any[];
  levels: { name: string; pct: number }[];
  onEdit: (row: any) => void;
}) {
  const products = useMemo(
    () => Array.from(new Set(rows.map((r) => r.product_name as string))).sort(),
    [rows]
  );
  const lookup = useMemo(() => {
    const m = new Map<string, any>();
    rows.forEach((r) => m.set(`${r.product_name}::${r.level_name}`, r));
    return m;
  }, [rows]);

  return (
    <div className="overflow-x-auto rounded-lg border mt-2">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground border-b border-r bg-muted/40 sticky left-0 min-w-[160px] z-10">
              Product
            </th>
            {levels.map((l) => (
              <th
                key={l.name}
                colSpan={3}
                className="text-center px-3 py-2 font-medium border-b border-r bg-muted/40 text-muted-foreground whitespace-nowrap min-w-[180px]"
              >
                <div className="flex flex-col items-center gap-0.5">
                  <span>{l.name}</span>
                  <span className="text-xs font-normal opacity-75">{l.pct}%</span>
                </div>
              </th>
            ))}
          </tr>
          <tr>
            <th className="sticky left-0 bg-muted/20 border-b border-r px-3 py-1.5 z-10" />
            {levels.map((l) => (
              <>
                <th key={`${l.name}-yr1`} className="bg-muted/20 border-b px-2 py-1 text-[10px] text-center text-muted-foreground font-medium min-w-[55px]">Yr 1</th>
                <th key={`${l.name}-yr25`} className="bg-muted/20 border-b px-2 py-1 text-[10px] text-center text-muted-foreground font-medium min-w-[55px]">Yr 2–5</th>
                <th key={`${l.name}-yr6`} className="bg-muted/20 border-b border-r px-2 py-1 text-[10px] text-center text-muted-foreground font-medium min-w-[55px]">Yr 6+</th>
              </>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {products.map((product) => (
            <tr key={product} className="hover:bg-muted/20">
              <td className="px-3 py-2 font-medium sticky left-0 bg-background border-r z-10 whitespace-nowrap text-sm">
                {product}
              </td>
              {levels.map((l) => {
                const cell = lookup.get(`${product}::${l.name}`);
                if (!cell) {
                  return (
                    <>
                      <td key={`${l.name}-yr1`} className="px-2 py-2 text-center text-muted-foreground/50 font-mono text-xs">—</td>
                      <td key={`${l.name}-yr25`} className="px-2 py-2 text-center text-muted-foreground/50 font-mono text-xs">—</td>
                      <td key={`${l.name}-yr6`} className="px-2 py-2 text-center text-muted-foreground/50 font-mono text-xs border-r">—</td>
                    </>
                  );
                }
                return (
                  <>
                    <td
                      key={`${l.name}-yr1`}
                      className="px-2 py-2 text-center font-mono text-xs cursor-pointer hover:bg-primary/10 transition-colors group"
                      onClick={() => onEdit(cell)}
                      title="Click to edit"
                    >
                      <span className="group-hover:underline">{Number(cell.year_1_pct)}%</span>
                    </td>
                    <td key={`${l.name}-yr25`} className="px-2 py-2 text-center font-mono text-xs text-muted-foreground">
                      {Number(cell.years_2_5_pct) ? `${Number(cell.years_2_5_pct)}%` : "—"}
                    </td>
                    <td key={`${l.name}-yr6`} className="px-2 py-2 text-center font-mono text-xs text-muted-foreground border-r">
                      {Number(cell.years_6_plus_pct) ? `${Number(cell.years_6_plus_pct)}%` : "—"}
                    </td>
                  </>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
