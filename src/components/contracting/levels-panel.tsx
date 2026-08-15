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
import {
  carrierLevelOptions, levelLabel, levelOrigin, suggestLevel, mappingFor, findLevel,
  type CarrierLevelOption,
} from "@/lib/compensation/carrier-levels";

/** One carrier's mapping for the rung being edited. */
type Row = { mode: "fallback" | "level" | "custom"; carrier_level_name: string; carrier_pct: string };
const FALLBACK: Row = { mode: "fallback", carrier_level_name: "", carrier_pct: "" };

/**
 * Every level a carrier is known to go by, named.
 *
 * The list used to be built from `carrier_comp_levels` alone — hand-entered,
 * and so empty for nearly every carrier — which is why this dropdown offered
 * no level names at all. `carrierLevelOptions` reads the uploaded comp grid
 * too, where the carrier's own vocabulary already lives. The server ships the
 * merged list; falling back to computing it here keeps the panel working
 * against a cached response from before that shipped.
 */
function levelsFor(carrier: any): CarrierLevelOption[] {
  const shipped = carrier?.level_options as CarrierLevelOption[] | undefined;
  if (Array.isArray(shipped)) return shipped;
  return carrierLevelOptions({
    carrier_comp_levels: carrier?.carrier_comp_levels ?? [],
    carrier_grid_levels: carrier?.carrier_grid_levels ?? [],
  });
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
  // The four rungs nearly every agency starts with, offered rather than
  // assumed: an empty ladder means every agent is unassigned, and typing four
  // near-identical dialogs to get going is where owners stopped.
  const STARTER = [
    { name: "Trainee", base_pct: 50, can_invite: false },
    { name: "Agent", base_pct: 60, can_invite: false },
    { name: "Senior Agent", base_pct: 70, can_invite: true },
    { name: "MGA", base_pct: 80, can_invite: true },
  ];
  const starter = useMutation({
    mutationFn: async () => {
      for (const rung of STARTER) {
        await saveFn({ data: { ...rung, sort_order: rung.base_pct, active: true, mappings: [] } });
      }
    },
    onSuccess: () => {
      toast.success("Four starter positions created. Rename or change the percentages any time.");
      qc.invalidateQueries({ queryKey: ["agency-levels"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create the starter ladder"),
  });

  const save = useMutation({ mutationFn: (p: any) => saveFn({ data: p }), onSuccess: () => { toast.success("Agency level saved"); setAdding(false); setEditing(null); qc.invalidateQueries({ queryKey: ["agency-levels"] }); }, onError: (e: any) => toast.error(e?.message ?? "Could not save the agency level") });
  // A ladder reads top down: the highest position first, the entry rung last.
  const rows = [...((data?.rows ?? []) as any[])].sort(
    (a, b) => Number(b.base_pct ?? 0) - Number(a.base_pct ?? 0),
  );
  const canManage = (data as any)?.canManage !== false;
  // Everything except what has been filed away. This used to keep only
  // `status === "active"`, so a carrier still being set up — which is exactly
  // when its levels need mapping — never appeared here at all, and the mapping
  // section looked broken.
  const carriers = ((carrierData?.carriers ?? []) as any[])
    .filter((c) => c.state?.status !== "archived" && c.status !== "archived");
  const dialog = <AgencyLevelDialog open={adding || Boolean(editing)} record={editing} carriers={carriers} pending={save.isPending} onClose={() => { setAdding(false); setEditing(null); }} onSave={(p) => save.mutate(p)} />;

  if (!isLoading && rows.length === 0) return <>
    <EmptyState
      title={canManage ? "Create your agency promotion ladder" : "No positions to show yet"}
      body={canManage
        ? "Create each level once, such as Trainee 50%, Agent 60%, and MGA 80%. Carrier equivalents are optional exceptions inside the level."
        : "You will see your own position and the positions below you once your agency places you on the ladder."}
      action={canManage ? <div className="flex flex-wrap justify-center gap-2">
        <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Create first level</Button>
        <Button size="sm" variant="outline" disabled={starter.isPending} onClick={() => starter.mutate()}>
          <Sparkles className="mr-1.5 h-3.5 w-3.5" /> {starter.isPending ? "Creating…" : "Use a starter ladder"}
        </Button>
      </div> : undefined}
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
    // Open when there is anything to map. The brief asks for carrier matching
    // in the position editor rather than behind a link, and a collapsed section
    // is why positions stayed on the fallback without anybody deciding to.
    setShowOverrides(carriers.length > 0);
  }

  const basePct = Number(pct);
  const rowFor = (id: string) => mappings[id] ?? FALLBACK;
  const set = (id: string, row: Row) => setMappings((x) => ({ ...x, [id]: row }));
  const pick = (carrierId: string, o: CarrierLevelOption) => {
    // `mappingFor` decides whether a percentage is stored beside the name. A
    // level whose grid rates vary by product stores the name only, so the grid
    // keeps pricing each product rather than being outranked by one figure.
    const m = mappingFor(o);
    set(carrierId, {
      mode: "level",
      carrier_level_name: m.carrier_level_name,
      carrier_pct: m.carrier_pct != null ? String(m.carrier_pct) : "",
    });
  };
  const suggestionFor = (c: any) => suggestLevel(levelsFor(c), basePct);
  const suggestable = carriers.filter((c) => rowFor(c.id).mode === "fallback" && suggestionFor(c));

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
        {suggestable.length > 0 && <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => suggestable.forEach((c) => { const s = suggestionFor(c); if (s) pick(c.id, s); })}><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Use {suggestable.length} suggestion{suggestable.length === 1 ? "" : "s"}</Button>}
      </div>
      {carriers.length === 0 && <p className="text-xs text-muted-foreground">Add carriers first and their levels will appear here.</p>}
      {carriers.map((c) => {
        const row = rowFor(c.id);
        const levels = levelsFor(c);
        const suggestion = suggestLevel(levels, basePct);
        const chosen = findLevel(levels, row.carrier_level_name);
        const value = row.mode === "fallback" ? "__fallback" : row.mode === "custom" ? "__custom" : (chosen?.id ?? "__custom");
        return <div key={c.id} className="space-y-1.5 border-t border-border pt-3 first:border-0 first:pt-0">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{c.name}</span>
            <Select value={value} onValueChange={(v) => {
              if (v === "__fallback") return set(c.id, FALLBACK);
              if (v === "__custom") return set(c.id, { ...row, mode: "custom" });
              const l = levels.find((x) => x.id === v);
              if (l) pick(c.id, l);
            }}>
              <SelectTrigger className="h-9 w-[210px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__fallback">Use position percentage{pct ? ` (${pct}%)` : ""}</SelectItem>
                {/* The carrier's own names. A level appearing here from the comp
                    grid is not a lesser entry — a grid is written in exactly
                    this vocabulary, which is why it can be matched at all. */}
                {levels.map((l) => <SelectItem key={l.id} value={l.id}>{levelLabel(l)}</SelectItem>)}
                <SelectItem value="__custom">Enter it manually…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Named rather than counted: an owner picking between "Level 40" and
              "Level 55" wants to know one came from the grid they uploaded. */}
          {chosen && row.mode === "level" && <p className="text-[11px] text-muted-foreground">{levelOrigin(chosen)}{chosen.pct == null && chosen.minPct !== chosen.maxPct ? " — rates vary by product, so each deal prices from the grid" : ""}</p>}
          {row.mode === "custom" && <div className="grid grid-cols-[1fr_90px] gap-2">
            <Input value={row.carrier_level_name} onChange={(e) => set(c.id, { ...row, mode: "custom", carrier_level_name: e.target.value })} placeholder="Carrier level name" />
            <Input type="number" value={row.carrier_pct} onChange={(e) => set(c.id, { ...row, mode: "custom", carrier_pct: e.target.value })} placeholder={pct || "%"} />
          </div>}
          {row.mode === "fallback" && suggestion && <button type="button" onClick={() => pick(c.id, suggestion)} className="text-[11px] text-primary">
            Suggested: {levelLabel(suggestion)} — use it
          </button>}
          {/* The state the screenshot was stuck in. Saying which screens define
              a level beats an empty dropdown that looks like a fault. */}
          {levels.length === 0 && <p className="text-[11px] text-muted-foreground">No levels recorded for {c.name} yet — add them on the carrier, or upload its comp grid, and they will appear here by name.</p>}
        </div>;
      })}
    </div>}
  </div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={pending || !name.trim() || pct === ""}>{pending ? "Saving…" : "Save level"}</Button></DialogFooter></DialogContent></Dialog>;
}
