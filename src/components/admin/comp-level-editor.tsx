import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import {
  adminListAgentCompLevels,
  adminSetCompLevel,
  listAllCarriers,
  listCarrierGridLevels,
  adminAssignAllCarriers,
} from "@/lib/admin.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export function CompLevelEditor({ agentId, agentName }: { agentId: string; agentName: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListAgentCompLevels);
  const setFn = useServerFn(adminSetCompLevel);
  const carriersFn = useServerFn(listAllCarriers);
  const gridLevelsFn = useServerFn(listCarrierGridLevels);
  const assignAllFn = useServerFn(adminAssignAllCarriers);

  const { data: levels = [], isLoading: levelsLoading } = useQuery({
    queryKey: ["admin-comp-levels", agentId],
    queryFn: () => listFn({ data: { agent_id: agentId } }),
    enabled: !!agentId,
  });

  const { data: carriers = [], isLoading: carriersLoading } = useQuery({
    queryKey: ["all-carriers"],
    queryFn: () => carriersFn(),
  });

  const levelMap = useMemo(
    () => new Map((levels as any[]).map((l: any) => [l.carrier_id, l])),
    [levels]
  );

  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState({ pct: "", name: "", writing_number: "" });
  const [saving, setSaving] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPct, setBulkPct] = useState("150");
  const [bulkName, setBulkName] = useState("Executive 150");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [writingEdits, setWritingEdits] = useState<Record<string, string>>({});

  const { data: gridLevels = [] } = useQuery({
    queryKey: ["carrier-grid-levels", editing],
    queryFn: () => gridLevelsFn({ data: { carrier_id: editing! } }),
    enabled: !!editing,
  });

  async function save(carrierId: string) {
    const pct = parseFloat(editValue.pct);
    if (isNaN(pct) || pct < 0) { toast.error("Enter a valid percentage"); return; }
    setSaving(true);
    try {
      await setFn({
        data: {
          agent_id: agentId,
          carrier_id: carrierId,
          assigned_pct: pct,
          commission_level: editValue.name.trim() || `${pct}%`,
          writing_number: editValue.writing_number.trim() || null,
        },
      });
      qc.invalidateQueries({ queryKey: ["admin-comp-levels", agentId] });
      setEditing(null);
      toast.success("Comp level updated");
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveWritingNumber(carrierId: string, existing: any) {
    const wn = writingEdits[carrierId];
    if (wn === undefined) return;
    if ((existing?.writing_number ?? "") === wn) return;
    if (!existing?.assigned_pct) {
      toast.error("Set a commission level before assigning a writing number");
      return;
    }
    try {
      await setFn({
        data: {
          agent_id: agentId,
          carrier_id: carrierId,
          assigned_pct: Number(existing.assigned_pct),
          commission_level: existing.commission_level ?? `${existing.assigned_pct}%`,
          writing_number: wn || null,
        },
      });
      qc.invalidateQueries({ queryKey: ["admin-comp-levels", agentId] });
      toast.success("Writing # saved");
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    }
  }

  async function bulkAssign() {
    const pct = parseFloat(bulkPct);
    if (isNaN(pct) || pct < 0) { toast.error("Enter a valid percentage"); return; }
    if (!bulkName.trim()) { toast.error("Enter a level name"); return; }
    setBulkSaving(true);
    try {
      const res: any = await assignAllFn({
        data: { agent_id: agentId, assigned_pct: pct, commission_level: bulkName.trim() },
      });
      qc.invalidateQueries({ queryKey: ["admin-comp-levels", agentId] });
      toast.success(`Assigned ${res.carriers_assigned} carriers • ${res.contracts_created} contracts created`);
      setBulkOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBulkSaving(false);
    }
  }

  if (levelsLoading || carriersLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Commission Levels</p>
          <span className="text-xs text-muted-foreground">{agentName}</span>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setBulkOpen((v) => !v)}>
          Set across all carriers
        </Button>
      </div>

      {bulkOpen && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2">
          <div>
            <label className="block text-[10px] uppercase text-muted-foreground mb-0.5">Level name</label>
            <Input
              value={bulkName}
              onChange={(e) => setBulkName(e.target.value)}
              className="h-7 text-xs w-40"
              placeholder="Executive 150"
            />
          </div>
          <div className="relative">
            <label className="block text-[10px] uppercase text-muted-foreground mb-0.5">Pct</label>
            <Input
              value={bulkPct}
              onChange={(e) => setBulkPct(e.target.value)}
              className="h-7 text-xs w-20 pr-5"
              inputMode="decimal"
            />
            <span className="absolute right-2 top-[22px] text-xs text-muted-foreground">%</span>
          </div>
          <Button size="sm" className="h-7 text-xs" onClick={bulkAssign} disabled={bulkSaving}>
            {bulkSaving ? "Saving…" : "Apply to all"}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setBulkOpen(false)}>
            Cancel
          </Button>
        </div>
      )}

      <div className="space-y-1.5">
        {(carriers as any[]).map((carrier: any) => {
          const existing = levelMap.get(carrier.id);
          const isEditing = editing === carrier.id;
          const isPending = existing?.pending === true || (existing && !existing.assigned_pct);

          return (
            <div key={carrier.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-2">
                  {carrier.name}
                  {isPending && (
                    <Badge className="bg-amber-500/15 text-amber-600 text-[10px] px-1.5 py-0">Pending</Badge>
                  )}
                </div>
                {!isEditing && (
                  <div className="text-xs text-muted-foreground">
                    {existing?.assigned_pct
                      ? `${existing.commission_level ?? ""} (${existing.assigned_pct}%)`.replace(/^\s*\(/, "(")
                      : "Not assigned"}
                  </div>
                )}
                {isEditing && (
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {(gridLevels as any[]).length > 0 ? (
                      <Select
                        value={editValue.name}
                        onValueChange={(v) => {
                          const found = (gridLevels as any[]).find((l: any) => l.level_name === v);
                          setEditValue({ ...editValue, name: v, pct: found ? String(found.max_pct) : editValue.pct });
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs w-44">
                          <SelectValue placeholder="Select level..." />
                        </SelectTrigger>
                        <SelectContent>
                          {(gridLevels as any[]).map((l: any) => (
                            <SelectItem key={l.level_name} value={l.level_name}>
                              {l.level_name} ({l.max_pct}%)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <>
                        <div className="relative w-20">
                          <Input
                            value={editValue.pct}
                            onChange={(e) => setEditValue({ ...editValue, pct: e.target.value })}
                            className="h-7 text-xs pr-5"
                            placeholder="50"
                            inputMode="decimal"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") save(carrier.id);
                              if (e.key === "Escape") setEditing(null);
                            }}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                        </div>
                        <Input
                          value={editValue.name}
                          onChange={(e) => setEditValue({ ...editValue, name: e.target.value })}
                          className="h-7 text-xs w-28"
                          placeholder="Level name"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") save(carrier.id);
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                      </>
                    )}
                    <Input
                      value={editValue.writing_number}
                      onChange={(e) => setEditValue({ ...editValue, writing_number: e.target.value })}
                      className="h-7 text-xs w-32"
                      placeholder="Writing #"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") save(carrier.id);
                        if (e.key === "Escape") setEditing(null);
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => save(carrier.id)}
                      disabled={saving || !editValue.name}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditing(null)}>
                      ✕
                    </Button>
                  </div>
                )}
              </div>
              {!isEditing && (
                <div className="flex items-center gap-2 shrink-0">
                  {existing?.assigned_pct ? (
                    <Input
                      className="h-7 w-28 text-xs"
                      placeholder="Writing #"
                      value={writingEdits[carrier.id] ?? existing.writing_number ?? ""}
                      onChange={(e) => setWritingEdits((p) => ({ ...p, [carrier.id]: e.target.value }))}
                      onBlur={() => saveWritingNumber(carrier.id, existing)}
                    />
                  ) : null}
                  {existing?.assigned_pct && (
                    <span className="text-xs font-bold text-primary">{existing.assigned_pct}%</span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      setEditing(carrier.id);
                      setEditValue({
                        pct: existing?.assigned_pct?.toString() ?? "",
                        name: existing?.commission_level ?? "",
                        writing_number: existing?.writing_number ?? "",
                      });
                    }}
                  >
                    {existing?.assigned_pct ? "Edit" : "Set"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {(carriers as any[]).length === 0 && (
          <p className="text-xs text-muted-foreground">No active carriers configured.</p>
        )}
      </div>
    </div>
  );
}
