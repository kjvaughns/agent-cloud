import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListAgentCompLevels, adminSetCompLevel, listAllCarriers } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export function CompLevelEditor({ agentId, agentName }: { agentId: string; agentName: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListAgentCompLevels);
  const setFn = useServerFn(adminSetCompLevel);
  const carriersFn = useServerFn(listAllCarriers);

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
  const [editValue, setEditValue] = useState({ pct: "", name: "" });
  const [saving, setSaving] = useState(false);

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
        },
      });
      qc.invalidateQueries({ queryKey: ["admin-comp-levels", agentId] });
      setEditing(null);
      toast.success(`Comp level updated`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  }

  if (levelsLoading || carriersLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Commission Levels</p>
        <span className="text-xs text-muted-foreground">{agentName}</span>
      </div>

      <div className="space-y-1.5">
        {(carriers as any[]).map((carrier: any) => {
          const existing = levelMap.get(carrier.id);
          const isEditing = editing === carrier.id;

          return (
            <div key={carrier.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{carrier.name}</div>
                {!isEditing && (
                  <div className="text-xs text-muted-foreground">
                    {existing
                      ? `${existing.assigned_pct}% · ${existing.commission_level ?? ""}`.replace(" · ", existing.commission_level ? " · " : "")
                      : "Not assigned"}
                  </div>
                )}
                {isEditing && (
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
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
                    <Button size="sm" className="h-7 text-xs px-2" onClick={() => save(carrier.id)} disabled={saving}>
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
                  {existing && (
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
                      });
                    }}
                  >
                    {existing ? "Edit" : "Set"}
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
