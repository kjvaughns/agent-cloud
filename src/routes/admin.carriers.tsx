import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { adminCreateCarrier, adminUpdateCarrier } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_admin/carriers")({
  component: AdminCarriers,
  head: () => ({ meta: [{ title: "Carriers — Agent Cloud Admin" }] }),
});

const emptyCarrier = {
  name: "",
  pay_frequency: "monthly",
  contracting_speed_days: undefined as number | undefined,
  is_annuity_carrier: false,
  agent_portal_url: "",
  active: true,
};

function AdminCarriers() {
  const [carriers, setCarriers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("carriers").select("*").order("name");
    setCarriers(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    try {
      if (dialog.id) {
        const { id, ...patch } = dialog;
        await adminUpdateCarrier({ data: { id, ...patch } });
      } else {
        await adminCreateCarrier({ data: dialog });
      }
      toast.success(dialog.id ? "Carrier updated" : "Carrier created");
      setDialog(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  }

  async function toggleActive(carrier: any) {
    try {
      await adminUpdateCarrier({ data: { id: carrier.id, active: !carrier.active } });
      setCarriers((prev) => prev.map((c) => c.id === carrier.id ? { ...c, active: !c.active } : c));
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Carriers</h1>
          <p className="text-sm text-muted-foreground mt-1">{carriers.length} carriers</p>
        </div>
        <Button onClick={() => setDialog({ ...emptyCarrier })}>
          <Plus className="h-4 w-4 mr-1.5" />Add Carrier
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Pay Freq.</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Speed (days)</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Annuity</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {carriers.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No carriers yet</td></tr>
              ) : carriers.map((c) => (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize hidden md:table-cell">{c.pay_frequency || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{c.contracting_speed_days ?? "—"}</td>
                  <td className="px-4 py-3 text-center hidden md:table-cell">
                    {c.is_annuity_carrier ? <Badge className="bg-purple-500/15 text-purple-600 text-xs">Yes</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Switch checked={!!c.active} onCheckedChange={() => toggleActive(c)} />
                  </td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDialog({ ...c })}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.id ? "Edit Carrier" : "Add Carrier"}</DialogTitle>
          </DialogHeader>
          {dialog && (
            <div className="space-y-3 py-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
                <Input value={dialog.name} onChange={(e) => setDialog({ ...dialog, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Pay Frequency</label>
                  <Select value={dialog.pay_frequency ?? "monthly"} onValueChange={(v) => setDialog({ ...dialog, pay_frequency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Contracting Speed (days)</label>
                  <Input
                    type="number"
                    value={dialog.contracting_speed_days ?? ""}
                    onChange={(e) => setDialog({ ...dialog, contracting_speed_days: e.target.value ? parseInt(e.target.value) : undefined })}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Agent Portal URL</label>
                <Input value={dialog.agent_portal_url ?? ""} onChange={(e) => setDialog({ ...dialog, agent_portal_url: e.target.value })} />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm">Annuity Carrier</label>
                <Switch checked={!!dialog.is_annuity_carrier} onCheckedChange={(v) => setDialog({ ...dialog, is_annuity_carrier: v })} />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm">Active</label>
                <Switch checked={!!dialog.active} onCheckedChange={(v) => setDialog({ ...dialog, active: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !dialog?.name}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
              {dialog?.id ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
