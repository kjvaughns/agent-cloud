import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@/hooks/use-server-fn";
import { listAgencyLevels, saveAgencyLevel } from "@/lib/contracting-records.functions";
import { CarriersQuick } from "@/components/settings/carriers-quick";
import { HubCard, HubLayout, PreviewCard, AdvancedDrawer, type SaveStatus } from "@/components/settings/hub-card";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function CarriersHub({ advanced, advancedOpen, onAdvancedChange }: {
  advanced: ReactNode; advancedOpen: boolean; onAdvancedChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listAgencyLevels);
  const saveFn = useServerFn(saveAgencyLevel);
  const { data } = useQuery({ queryKey: ["agency-levels"], queryFn: () => listFn() });
  const rows = [...((data?.rows ?? []) as any[])].sort((a, b) => Number(b.base_pct ?? 0) - Number(a.base_pct ?? 0));
  const canManage = (data as any)?.canManage !== false;
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [edits, setEdits] = useState<Record<string, { name?: string; pct?: string }>>({});

  const save = useMutation({
    mutationFn: (level: any) => saveFn({ data: level }),
    onMutate: () => setStatus("saving"),
    onSuccess: () => { setStatus("saved"); qc.invalidateQueries({ queryKey: ["agency-levels"] }); },
    onError: (e: any) => { setStatus("idle"); toast.error(e?.message ?? "Couldn't save the level"); },
  });

  function commit(l: any) {
    const e = edits[l.id];
    if (!e) return;
    const name = (e.name ?? l.name).trim();
    const pct = Number(e.pct ?? l.base_pct);
    if (!name || !Number.isFinite(pct) || pct < 0 || pct > 200) { toast.error("Use a name and a % between 0 and 200."); return; }
    if (name === l.name && pct === Number(l.base_pct)) return;
    save.mutate({
      id: l.id, name, base_pct: pct, sort_order: l.sort_order ?? pct, can_invite: Boolean(l.can_invite), active: l.active !== false,
      mappings: ((l.agency_level_carrier_mappings ?? []) as any[]).map((m) => ({
        org_carrier_id: m.org_carrier_id, carrier_level_name: m.carrier_level_name ?? null, carrier_pct: m.carrier_pct ?? null,
      })),
    });
  }

  const preview = (
    <PreviewCard>
      <div className="border-b border-border p-3">
        <p className="text-sm font-semibold">On a $1,000 deal</p>
        <p className="text-[11px] text-muted-foreground">What each level earns before carrier-specific rates</p>
      </div>
      <ul className="divide-y divide-border">
        {rows.length === 0 && <li className="p-3 text-xs text-muted-foreground">Add levels to see earnings.</li>}
        {rows.map((l) => {
          const pct = Number(edits[l.id]?.pct ?? l.base_pct ?? 0);
          return (
            <li key={l.id} className="flex items-center justify-between gap-2 p-3 text-sm">
              <span className="truncate">{edits[l.id]?.name ?? l.name}</span>
              <span className="tnum font-semibold text-primary">{money(10 * pct)}</span>
            </li>
          );
        })}
      </ul>
    </PreviewCard>
  );

  return (
    <HubLayout preview={preview}>
      <HubCard title="Carriers" blurb="Switch on the carriers you write with.">
        <CarriersQuick onAdvanced={() => onAdvancedChange(true)} />
      </HubCard>

      <HubCard title="Your ladder" blurb="Tap a level to rename it or change its %." status={status}>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No levels yet. Press "Use standard levels" above to start.</p>
        ) : (
          <ol className="space-y-2">
            {rows.map((l, i) => (
              <li key={l.id} className="flex items-center gap-3 rounded-xl border border-border p-2.5"
                style={{ marginLeft: `${Math.min(i, 4) * 12}px` }}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{rows.length - i}</span>
                <Input aria-label="Level name" disabled={!canManage} className="h-9 min-w-0 flex-1 border-transparent bg-transparent shadow-none focus-visible:border-input"
                  value={edits[l.id]?.name ?? l.name}
                  onChange={(e) => setEdits({ ...edits, [l.id]: { ...edits[l.id], name: e.target.value } })}
                  onBlur={() => commit(l)} />
                <div className="flex shrink-0 items-center rounded-md border border-input pr-2">
                  <input aria-label={`${l.name} percent`} disabled={!canManage} inputMode="decimal"
                    className="tnum h-9 w-14 bg-transparent px-2 text-right text-sm outline-none"
                    value={edits[l.id]?.pct ?? String(l.base_pct ?? "")}
                    onChange={(e) => setEdits({ ...edits, [l.id]: { ...edits[l.id], pct: e.target.value } })}
                    onBlur={() => commit(l)} />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </HubCard>

      <AdvancedDrawer label="full carrier list, comp grids, level mapping & renewals" open={advancedOpen} onOpenChange={onAdvancedChange}>
        {advanced}
      </AdvancedDrawer>
    </HubLayout>
  );
}
