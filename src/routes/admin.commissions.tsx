import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, ChevronDown } from "lucide-react";
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
  const [selectedCarrier, setSelectedCarrier] = useState<string>("all");
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

  async function load() {
    setLoading(true);
    const res = await adminListCommissionGrid();
    setGrids(res.grids);
    const { data } = await supabase.from("carriers").select("id, name").eq("active", true).order("name");
    setCarriers(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filteredGrids = selectedCarrier === "all" ? grids : grids.filter((g) => g.carrier_id === selectedCarrier);

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
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Select value={selectedCarrier} onValueChange={setSelectedCarrier}>
              <SelectTrigger className="w-48"><SelectValue placeholder="All Carriers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Carriers</SelectItem>
                {carriers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setEditRow({ carrier_id: selectedCarrier !== "all" ? selectedCarrier : "", product_name: "", year_1_pct: 0, years_2_5_pct: 0, years_6_plus_pct: 0 })}>
              <Plus className="h-4 w-4 mr-1.5" />Add Row
            </Button>
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Carrier</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Product</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Level</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Yr 1 %</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Yr 2-5 %</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Yr 6+ %</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredGrids.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-muted-foreground">No grid rows found</td></tr>
                ) : filteredGrids.map((g) => (
                  <tr key={g.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">{g.carriers?.name}</td>
                    <td className="px-4 py-3">{g.product_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{g.level_name || "—"}</td>
                    <td className="px-4 py-3 text-right">{g.year_1_pct}%</td>
                    <td className="px-4 py-3 text-right">{g.years_2_5_pct}%</td>
                    <td className="px-4 py-3 text-right">{g.years_6_plus_pct}%</td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditRow(g)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
