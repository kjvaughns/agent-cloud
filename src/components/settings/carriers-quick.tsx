/**
 * Carriers, simple view: on/off cards plus one-click standard levels.
 * The full directory and comp grid live behind "Advanced" in the hub.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useServerFn } from "@/hooks/use-server-fn";
import { listOrgCarriers, saveOrgCarrier } from "@/lib/contracting-ops.functions";
import { listAgencyLevels, saveAgencyLevel } from "@/lib/contracting-records.functions";
import { carrierLevelOptions, autoMatchLevel, mappingFor } from "@/lib/compensation/carrier-levels";

const STANDARD = [
  { name: "Trainee", base_pct: 50, can_invite: false },
  { name: "Agent", base_pct: 60, can_invite: false },
  { name: "Senior Agent", base_pct: 70, can_invite: true },
  { name: "MGA", base_pct: 80, can_invite: true },
];

export function CarriersQuick({ onAdvanced }: { onAdvanced: () => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listOrgCarriers);
  const saveCarrier = useServerFn(saveOrgCarrier);
  const levelsFn = useServerFn(listAgencyLevels);
  const saveLevel = useServerFn(saveAgencyLevel);
  const { data, isLoading } = useQuery({ queryKey: ["contracting-ops", "carriers"], queryFn: () => listFn() });
  const { data: levelData } = useQuery({ queryKey: ["agency-levels"], queryFn: () => levelsFn() });

  const carriers = ((data?.carriers ?? []) as any[]).filter((c) => c.state?.status !== "archived");
  const canManage = Boolean(data?.access?.canManageCarriers);
  const levels = (levelData?.rows ?? []) as any[];

  const toggle = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      saveCarrier({ data: { id, status: on ? "active" : "paused", enabled: on } }),
    onSuccess: (_r, v) => {
      toast.success(v.on ? "Carrier is live for your agents." : "Carrier switched off.");
      qc.invalidateQueries({ queryKey: ["contracting-ops"] });
      qc.invalidateQueries({ queryKey: ["settings", "agency-setup-progress"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not change the carrier"),
  });

  const standard = useMutation({
    mutationFn: async () => {
      // Create the standard ladder only when there is none; never overwrite a custom one.
      const ladder = levels.length
        ? levels
        : STANDARD.map((r) => ({ ...r, sort_order: r.base_pct, active: true, agency_level_carrier_mappings: [] }));
      let mapped = 0;
      for (const level of ladder) {
        const base = Number(level.base_pct ?? 0);
        const existing = new Map(((level.agency_level_carrier_mappings ?? []) as any[]).map((m) => [m.org_carrier_id, m]));
        const mappings: any[] = [];
        for (const c of carriers) {
          const prior = existing.get(c.id);
          if (prior?.carrier_level_name || prior?.carrier_pct != null) {
            mappings.push({ org_carrier_id: c.id, carrier_level_name: prior.carrier_level_name ?? null, carrier_pct: prior.carrier_pct ?? null });
            continue;
          }
          const opts = Array.isArray(c.level_options) ? c.level_options
            : carrierLevelOptions({ carrier_comp_levels: c.carrier_comp_levels ?? [], carrier_grid_levels: c.carrier_grid_levels ?? [] });
          const s = autoMatchLevel(opts, base);
          if (!s) continue;
          const m = mappingFor(s);
          mappings.push({ org_carrier_id: c.id, carrier_level_name: m.carrier_level_name || null, carrier_pct: m.carrier_pct ?? null });
          mapped++;
        }
        await saveLevel({ data: {
          ...(level.id ? { id: level.id } : {}),
          name: level.name, base_pct: base, sort_order: level.sort_order ?? base,
          can_invite: Boolean(level.can_invite), active: level.active !== false, mappings,
        } });
      }
      return { created: levels.length === 0, mapped };
    },
    onSuccess: ({ created, mapped }) => {
      toast.success(`${created ? "Standard levels created. " : ""}Matched ${mapped} carrier level${mapped === 1 ? "" : "s"}.`);
      qc.invalidateQueries({ queryKey: ["agency-levels"] });
      qc.invalidateQueries({ queryKey: ["settings", "agency-setup-progress"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not apply standard levels"),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Standard levels</p>
          <p className="text-xs text-muted-foreground">
            {levels.length
              ? `${levels.length} levels set. One click matches them to each carrier's comp.`
              : "Trainee 50% · Agent 60% · Senior 70% · MGA 80%, matched to every carrier."}
          </p>
        </div>
        <Button variant="ink" className="shrink-0 rounded-full" disabled={!canManage || standard.isPending} onClick={() => standard.mutate()}>
          {standard.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Use standard levels
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-1 xl:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : carriers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium">No carriers yet</p>
          <Button size="sm" variant="outline" className="mt-3 rounded-full" onClick={onAdvanced}>Add a carrier</Button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-1 2xl:grid-cols-2">
          {carriers.map((c) => {
            const on = c.state?.status === "active";
            const may = on || Boolean(c.state?.canActivate);
            const busy = toggle.isPending && toggle.variables?.id === c.id;
            return (
              <li key={c.id} className={cn("flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors", on ? "border-primary/40" : "border-border")}>
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold", on ? "bg-primary/15 text-primary" : "bg-surface-2 text-muted-foreground")}>
                  {on ? <Check className="h-4 w-4" /> : String(c.name ?? "?").slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {on ? "Live for agents" : may ? "Off" : (c.state?.problems?.[0] ?? "Needs setup")}
                  </p>
                </div>
                {may ? (
                  <Switch checked={on} disabled={!canManage || busy} aria-label={`${on ? "Switch off" : "Switch on"} ${c.name}`}
                    onCheckedChange={(v) => toggle.mutate({ id: c.id, on: v })} />
                ) : (
                  <Button size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={onAdvanced}>Finish</Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
