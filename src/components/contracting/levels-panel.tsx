import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerFn } from "@/hooks/use-server-fn";
import { listAgencyLevels, saveAgencyLevel } from "@/lib/contracting-records.functions";
import { listOrgCarriers } from "@/lib/contracting-ops.functions";
import { EmptyState } from "@/components/contracting/shared";

export function LevelsPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAgencyLevels);
  const carriersFn = useServerFn(listOrgCarriers);
  const saveFn = useServerFn(saveAgencyLevel);
  const [editing, setEditing] = useState<any | null>(null);
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["agency-levels"], queryFn: () => listFn() });
  const { data: carrierData } = useQuery({ queryKey: ["contracting-ops", "carriers"], queryFn: () => carriersFn() });
  const save = useMutation({ mutationFn: (p: any) => saveFn({ data: p }), onSuccess: () => { toast.success("Agency level saved"); setAdding(false); setEditing(null); qc.invalidateQueries({ queryKey: ["agency-levels"] }); }, onError: (e: any) => toast.error(e?.message ?? "Could not save the agency level") });
  const rows = (data?.rows ?? []) as any[];
  if (!isLoading && rows.length === 0) return <EmptyState title="Create your agency promotion ladder" body="Create each level once, such as Trainee 50%, Agent 60%, and MGA 80%. Carrier equivalents are optional exceptions inside the level." action={<Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Create first level</Button>} />;
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">One simple ladder used for invites, promotions, and permissions.</p><Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add agency level</Button></div>
    <div className="space-y-2">{rows.map((level) => <Panel key={level.id} className="p-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 font-bold text-primary tnum">{Number(level.base_pct)}%</div><div className="min-w-0 flex-1"><h3 className="font-semibold text-foreground">{level.name}</h3><p className="text-xs text-muted-foreground">{level.can_invite ? "Can build a downline" : "Cannot create invite links"} · {(level.agency_level_carrier_mappings ?? []).length} carrier overrides</p></div><Button size="sm" variant="ghost" onClick={() => setEditing(level)}><Pencil className="h-3.5 w-3.5" /></Button></div></Panel>)}</div>
    <AgencyLevelDialog open={adding || Boolean(editing)} record={editing} carriers={(carrierData?.carriers ?? []) as any[]} pending={save.isPending} onClose={() => { setAdding(false); setEditing(null); }} onSave={(p) => save.mutate(p)} />
  </div>;
}

function AgencyLevelDialog({ open, record, carriers, pending, onClose, onSave }: { open: boolean; record: any; carriers: any[]; pending: boolean; onClose: () => void; onSave: (p: any) => void }) {
  const key = record?.id ?? (open ? "new" : "closed");
  const [lastKey, setLastKey] = useState(key);
  const [name, setName] = useState(""); const [pct, setPct] = useState(""); const [canInvite, setCanInvite] = useState(false); const [showOverrides, setShowOverrides] = useState(false);
  const [mappings, setMappings] = useState<Record<string, { carrier_level_name: string; carrier_pct: string }>>({});
  if (key !== lastKey) { setLastKey(key); setName(record?.name ?? ""); setPct(record?.base_pct != null ? String(record.base_pct) : ""); setCanInvite(Boolean(record?.can_invite)); setMappings(Object.fromEntries((record?.agency_level_carrier_mappings ?? []).map((m: any) => [m.org_carrier_id, { carrier_level_name: m.carrier_level_name ?? "", carrier_pct: m.carrier_pct != null ? String(m.carrier_pct) : "" }]))); setShowOverrides(false); }
  const submit = () => onSave({ id: record?.id, name: name.trim(), base_pct: Number(pct), sort_order: Number(pct), can_invite: canInvite, active: true, mappings: Object.entries(mappings).filter(([, m]) => m.carrier_level_name || m.carrier_pct).map(([org_carrier_id, m]) => ({ org_carrier_id, carrier_level_name: m.carrier_level_name || null, carrier_pct: m.carrier_pct === "" ? null : Number(m.carrier_pct) })) });
  return <Dialog open={open} onOpenChange={(o) => !o && onClose()}><DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{record ? "Edit agency level" : "Add agency level"}</DialogTitle><DialogDescription>Create it once. Carrier specific equivalents are optional.</DialogDescription></DialogHeader><div className="space-y-4">
    <div><Label>Level name</Label><Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Supervising Agent" /></div>
    <div><Label>Headline commission</Label><div className="relative mt-1"><Input type="number" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="65" className="pr-8" /><span className="absolute right-3 top-2 text-sm text-muted-foreground">%</span></div></div>
    <div className="flex items-center justify-between rounded-lg border border-border p-3"><div><p className="text-sm font-medium">Can build a downline</p><p className="text-xs text-muted-foreground">Allow people at this level to create invite links.</p></div><Switch checked={canInvite} onCheckedChange={setCanInvite} /></div>
    <button type="button" onClick={() => setShowOverrides((v) => !v)} className="text-sm font-medium text-primary">{showOverrides ? "Hide" : "Add"} carrier equivalents</button>
    {showOverrides && <div className="space-y-3 rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Only change carriers whose naming or percentage differs from {pct || "this"}%.</p>{carriers.map((c) => { const m = mappings[c.id] ?? { carrier_level_name: "", carrier_pct: "" }; return <div key={c.id} className="grid grid-cols-[1fr_1fr_90px] gap-2 items-end"><span className="pb-2 text-xs font-medium truncate">{c.name}</span><Input value={m.carrier_level_name} onChange={(e) => setMappings((x) => ({ ...x, [c.id]: { ...m, carrier_level_name: e.target.value } }))} placeholder="Level name" /><Input type="number" value={m.carrier_pct} onChange={(e) => setMappings((x) => ({ ...x, [c.id]: { ...m, carrier_pct: e.target.value } }))} placeholder={pct || "%"} /></div>; })}</div>}
  </div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={pending || !name.trim() || pct === ""}>{pending ? "Saving…" : "Save level"}</Button></DialogFooter></DialogContent></Dialog>;
}
