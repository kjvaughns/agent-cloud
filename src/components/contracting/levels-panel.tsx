import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useServerFn } from "@/hooks/use-server-fn";
import { listAgencyLevels, saveAgencyLevel } from "@/lib/contracting-records.functions";
import { listOrgCarriers } from "@/lib/contracting-ops.functions";
import { EmptyState } from "@/components/contracting/shared";

/** One carrier's mapping for the rung being edited. */
type Row = { mode: "fallback" | "level" | "custom"; carrier_level_name: string; carrier_pct: string };
const FALLBACK: Row = { mode: "fallback", carrier_level_name: "", carrier_pct: "" };

/** Active comp levels for a carrier, in the carrier's own vocabulary. */
function carrierLevels(carrier: any) {
  return ((carrier?.carrier_comp_levels ?? []) as any[])
    .filter((l) => l.status === "active" || !l.status)
    .sort((a, b) => Number(b.commission_pct ?? 0) - Number(a.commission_pct ?? 0));
}

/** The carrier level whose percentage sits closest to the position's own. */
function suggestFor(carrier: any, basePct: number) {
  const levels = carrierLevels(carrier).filter((l) => l.commission_pct != null);
  if (!levels.length || !Number.isFinite(basePct)) return null;
  return levels.reduce((best, l) =>
    Math.abs(Number(l.commission_pct) - basePct) < Math.abs(Number(best.commission_pct) - basePct) ? l : best);
}

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
  const canManage = (data as any)?.canManage !== false;
  const myLevelId = (data as any)?.myLevelId ?? null;
  const carriers = ((carrierData?.carriers ?? []) as any[]).filter((c) => (c.status ? c.status === "active" : true));
  const dialog = <AgencyLevelDialog open={adding || Boolean(editing)} record={editing} carriers={carriers} pending={save.isPending} onClose={() => { setAdding(false); setEditing(null); }} onSave={(p) => save.mutate(p)} />;

  if (!isLoading && rows.length === 0) return <>
    <EmptyState
      title={canManage ? "Create your agency promotion ladder" : "No positions to show yet"}
      body={canManage
        ? "Create each level once, such as Trainee 50%, Agent 60%, and MGA 80%. Carrier equivalents are optional exceptions inside the level."
        : "You will see your own position and the positions below you once your agency places you on the ladder."}
      action={canManage ? <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Create first level</Button> : undefined}
    />
    {dialog}
  </>;

  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{canManage ? "One simple ladder used for invites, promotions, and permissions." : "Your position and the positions below you."}</p>
      {canManage && <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add agency level</Button>}
    </div>
    <div className="space-y-2">{rows.map((level) => {
      const maps = (level.agency_level_carrier_mappings ?? []) as any[];
      return <Panel key={level.id} className="p-4"><div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 font-bold text-primary tnum">{Number(level.base_pct)}%</div>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 font-semibold text-foreground">{level.name}{level.id === myLevelId && <Badge variant="secondary" className="text-[10px]">Your position</Badge>}</h3>
          <p className="text-xs text-muted-foreground">
            {level.can_invite ? "Can build a downline" : "Cannot create invite links"} ·{" "}
            {maps.length === 0
              ? `Uses ${Number(level.base_pct)}% on every carrier`
              : `${maps.length} carrier level${maps.length === 1 ? "" : "s"} mapped, ${Math.max(carriers.length - maps.length, 0)} on the position percentage`}
          </p>
        </div>
        {canManage && <Button size="sm" variant="ghost" onClick={() => setEditing(level)}><Pencil className="h-3.5 w-3.5" /></Button>}
      </div></Panel>;
    })}</div>
    {dialog}
  </div>;
}

function AgencyLevelDialog({ open, record, carriers, pending, onClose, onSave }: { open: boolean; record: any; carriers: any[]; pending: boolean; onClose: () => void; onSave: (p: any) => void }) {
  const key = record?.id ?? (open ? "new" : "closed");
  const [lastKey, setLastKey] = useState(key);
  const [name, setName] = useState(""); const [pct, setPct] = useState(""); const [canInvite, setCanInvite] = useState(false); const [showOverrides, setShowOverrides] = useState(false);
  const [mappings, setMappings] = useState<Record<string, Row>>({});
  if (key !== lastKey) {
    setLastKey(key);
    setName(record?.name ?? "");
    setPct(record?.base_pct != null ? String(record.base_pct) : "");
    setCanInvite(Boolean(record?.can_invite));
    setMappings(Object.fromEntries(((record?.agency_level_carrier_mappings ?? []) as any[]).map((m) => [m.org_carrier_id, {
      mode: "level" as const,
      carrier_level_name: m.carrier_level_name ?? "",
      carrier_pct: m.carrier_pct != null ? String(m.carrier_pct) : "",
    }])));
    setShowOverrides(false);
  }

  const basePct = Number(pct);
  const rowFor = (id: string) => mappings[id] ?? FALLBACK;
  const set = (id: string, row: Row) => setMappings((x) => ({ ...x, [id]: row }));
  const applySuggestion = (carrier: any) => {
    const s = suggestFor(carrier, basePct);
    if (!s) return;
    set(carrier.id, { mode: "level", carrier_level_name: s.level_name, carrier_pct: s.commission_pct != null ? String(s.commission_pct) : "" });
  };
  const suggestable = carriers.filter((c) => rowFor(c.id).mode === "fallback" && suggestFor(c, basePct));

  const submit = () => onSave({
    id: record?.id, name: name.trim(), base_pct: basePct, sort_order: basePct, can_invite: canInvite, active: true,
    mappings: Object.entries(mappings)
      .filter(([, m]) => m.mode !== "fallback" && (m.carrier_level_name || m.carrier_pct))
      .map(([org_carrier_id, m]) => ({
        org_carrier_id,
        carrier_level_name: m.carrier_level_name || null,
        carrier_pct: m.carrier_pct === "" ? null : Number(m.carrier_pct),
      })),
  });

  return <Dialog open={open} onOpenChange={(o) => !o && onClose()}><DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{record ? "Edit agency level" : "Add agency level"}</DialogTitle><DialogDescription>Create it once. Carrier levels are optional — anything you leave alone pays the position percentage.</DialogDescription></DialogHeader><div className="space-y-4">
    <div><Label>Level name</Label><Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Supervising Agent" /></div>
    <div><Label>Headline commission</Label><div className="relative mt-1"><Input type="number" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="65" className="pr-8" /><span className="absolute right-3 top-2 text-sm text-muted-foreground">%</span></div></div>
    <div className="flex items-center justify-between rounded-lg border border-border p-3"><div><p className="text-sm font-medium">Can build a downline</p><p className="text-xs text-muted-foreground">Allow people at this level to create invite links.</p></div><Switch checked={canInvite} onCheckedChange={setCanInvite} /></div>

    <button type="button" onClick={() => setShowOverrides((v) => !v)} className="text-sm font-medium text-primary">{showOverrides ? "Hide" : "Match"} carrier levels</button>
    {showOverrides && <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">Pick the carrier's own level for this position. Leave a carrier on the position percentage and it pays {pct || "this"}% there.</p>
        {suggestable.length > 0 && <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => suggestable.forEach(applySuggestion)}><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Use {suggestable.length} suggestion{suggestable.length === 1 ? "" : "s"}</Button>}
      </div>
      {carriers.length === 0 && <p className="text-xs text-muted-foreground">Add carriers first and their levels will appear here.</p>}
      {carriers.map((c) => {
        const row = rowFor(c.id);
        const levels = carrierLevels(c);
        const suggestion = suggestFor(c, basePct);
        const value = row.mode === "fallback" ? "__fallback" : row.mode === "custom" ? "__custom" : (levels.find((l) => l.level_name === row.carrier_level_name)?.id ?? "__custom");
        return <div key={c.id} className="space-y-1.5 border-t border-border pt-3 first:border-0 first:pt-0">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{c.name}</span>
            <Select value={value} onValueChange={(v) => {
              if (v === "__fallback") return set(c.id, FALLBACK);
              if (v === "__custom") return set(c.id, { ...row, mode: "custom" });
              const l = levels.find((x) => x.id === v);
              set(c.id, { mode: "level", carrier_level_name: l?.level_name ?? "", carrier_pct: l?.commission_pct != null ? String(l.commission_pct) : "" });
            }}>
              <SelectTrigger className="h-9 w-[210px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__fallback">Use position percentage{pct ? ` (${pct}%)` : ""}</SelectItem>
                {levels.map((l) => <SelectItem key={l.id} value={l.id}>{l.level_name}{l.commission_pct != null ? ` — ${Number(l.commission_pct)}%` : ""}</SelectItem>)}
                <SelectItem value="__custom">Enter it manually…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {row.mode === "custom" && <div className="grid grid-cols-[1fr_90px] gap-2">
            <Input value={row.carrier_level_name} onChange={(e) => set(c.id, { ...row, mode: "custom", carrier_level_name: e.target.value })} placeholder="Carrier level name" />
            <Input type="number" value={row.carrier_pct} onChange={(e) => set(c.id, { ...row, mode: "custom", carrier_pct: e.target.value })} placeholder={pct || "%"} />
          </div>}
          {row.mode === "fallback" && suggestion && <button type="button" onClick={() => applySuggestion(c)} className="text-[11px] text-primary">
            Suggested: {suggestion.level_name}{suggestion.commission_pct != null ? ` (${Number(suggestion.commission_pct)}%)` : ""} — use it
          </button>}
        </div>;
      })}
    </div>}
  </div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={pending || !name.trim() || pct === ""}>{pending ? "Saving…" : "Save level"}</Button></DialogFooter></DialogContent></Dialog>;
}
