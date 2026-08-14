/**
 * What your level actually pays, per carrier and product.
 *
 * Lifted out of the route it used to live in. `/contracting/commission-grids`
 * was a second door onto this same component while Contracts rendered it as a
 * tab — one page, two URLs, and the standalone one also carried a third door
 * into the grid editor that Settings ▸ Comp Grids already owns. The route
 * redirects into the tab now, and the component lives here so a redirect does
 * not have to export a page.
 */

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, RotateCcw } from "lucide-react";
import { listMyCarrierLevels, getCommissionGrid, clearMyCommissionLevels } from "@/lib/contracting.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useNavContext } from "@/hooks/use-my-access";
import { Button } from "@/components/ui/button";

function levelIsMe(
  levelName: string,
  myLevelName: string | null,
  myPct: number | null,
): boolean {
  if (!myLevelName && myPct === null) return false;
  if (levelName === myLevelName) return true;
  // Normalize: strip whitespace/parens and compare lowercase
  const norm = (s: string) =>
    s.toLowerCase().replace(/\s+/g, "").replace(/[()]/g, "");
  if (myLevelName && norm(levelName) === norm(myLevelName)) return true;
  return false;
}

export function CompGridsContent() {
  const qc = useQueryClient();
  const { canSeeAgency } = useNavContext();
  const clearFn = useServerFn(clearMyCommissionLevels);
  const { data, isLoading } = useQuery({
    queryKey: ["contracting", "myLevels"],
    queryFn: () => listMyCarrierLevels(),
  });

  const clear = useMutation({
    mutationFn: (carrier_id?: string) => clearFn({ data: carrier_id ? { carrier_id } : {} }),
    onSuccess: (r: any) => {
      toast.success(r?.cleared ? `Cleared ${r.cleared} level${r.cleared === 1 ? "" : "s"}` : "Nothing to clear");
      qc.invalidateQueries({ queryKey: ["contracting", "myLevels"] });
      qc.invalidateQueries({ queryKey: ["comp-grids"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't clear that"),
  });

  const mine = (data?.rows ?? []).filter((r: any) => r.commission_level).length;

  return (
    <div className="flex flex-col gap-[var(--gap)]">

      {canSeeAgency && mine > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            You have a level on <span className="tnum font-medium text-foreground">{mine}</span>{" "}
            carrier{mine === 1 ? "" : "s"}. A level is matched to a comp grid by its exact text,
            so clearing one and setting it again is the fix when a grid and a contract disagree.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={clear.isPending}
            onClick={() => clear.mutate(undefined)}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Clear all mine
          </Button>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : (data?.rows.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No carrier levels assigned yet.
          </CardContent>
        </Card>
      ) : (
        <Accordion type="single" collapsible className="space-y-2">
          {(data?.rows ?? []).map((r: any) => (
            <Card key={r.carrier_id}>
              <AccordionItem value={r.carrier_id} className="border-0">
                <AccordionTrigger className="px-4 hover:no-underline">
                  <div className="flex items-center gap-3 flex-1 flex-wrap">
                    <div className="text-left flex-1">
                      <div className="font-semibold">{r.carriers?.name ?? "Carrier"}</div>
                      {r.carriers?.is_annuity_carrier && (
                        <div className="text-xs">
                          <Badge variant="secondary">Annuity</Badge>
                        </div>
                      )}
                    </div>
                    {r.commission_level ? (
                      <span className="flex items-center gap-1.5 shrink-0">
                        <Badge className="bg-amber-500 text-white">
                          Your Level: {r.commission_level} ({Number(r.assigned_pct)}%)
                        </Badge>
                        {canSeeAgency && (
                          // Assigning a level has always been an upsert, so a
                          // level set once — or imported wrongly — could only
                          // be overwritten, never removed.
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label={`Clear my level for ${r.carriers?.name ?? "this carrier"}`}
                            title="Clear my level for this carrier"
                            className="rounded p-1 text-muted-foreground hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); clear.mutate(r.carrier_id); }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); clear.mutate(r.carrier_id); }
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {Number(r.assigned_pct)}%
                      </span>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <GridDetail
                    carrierId={r.carrier_id}
                    myLevelName={r.commission_level ?? null}
                    myPct={r.assigned_pct ? Number(r.assigned_pct) : null}
                  />
                </AccordionContent>
              </AccordionItem>
            </Card>
          ))}
        </Accordion>
      )}
    </div>
  );
}

function GridDetail({
  carrierId,
  myLevelName,
  myPct,
}: {
  carrierId: string;
  myLevelName: string | null;
  myPct: number | null;
}) {
  const fn = useServerFn(getCommissionGrid);
  const { data, isLoading } = useQuery({
    queryKey: ["contracting", "grid", carrierId],
    queryFn: () => fn({ data: { carrier_id: carrierId } }),
  });

  if (isLoading) return <Skeleton className="h-32" />;

  if (data?.noLevelAssigned) {
    return (
      <div className="rounded-lg bg-muted/40 border p-4 text-sm text-muted-foreground">
        No commission level has been assigned to you for this carrier yet. Contact your admin.
      </div>
    );
  }

  const rows: any[] = data?.rows ?? [];
  if (rows.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        No grid data available for this carrier.
      </div>
    );
  }

  const hasAgeBands = rows.some((r) => r.age_group_min != null);

  // Build level columns: level_name → max year_1_pct, plus its authored
  // position where one was saved.
  const levelMap = new Map<string, number>();
  const levelPos = new Map<string, number>();
  rows.forEach((r) => {
    if (r.level_name) {
      const pct = Number(r.year_1_pct);
      if (!levelMap.has(r.level_name) || pct > levelMap.get(r.level_name)!) {
        levelMap.set(r.level_name, pct);
      }
      if (r.level_sort != null) {
        const cur = levelPos.get(r.level_name);
        if (cur == null || r.level_sort < cur) levelPos.set(r.level_name, r.level_sort);
      }
    }
  });
  // Authored column order when the editor saved one; rate magnitude as the
  // fallback for grids saved before the order columns existed. Legacy rows
  // have no level_sort, so they sort to the back of an authored grid rather
  // than scrambling it.
  const levels = Array.from(levelMap.entries())
    .sort((a, b) =>
      (levelPos.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (levelPos.get(b[0]) ?? Number.MAX_SAFE_INTEGER) ||
      b[1] - a[1])
    .map(([name, pct]) => ({ name, pct }));

  if (levels.length === 0) {
    return <div className="text-sm text-muted-foreground">Grid data has no named levels.</div>;
  }

  if (!hasAgeBands) {
    return (
      <AgeBandTable rows={rows} levels={levels} myLevelName={myLevelName} myPct={myPct} />
    );
  }

  // Group by age band, presented youngest first. The rows arrive sorted by
  // rate, so Map insertion order would put whichever band pays most on top —
  // "Ages 60–80" above "Ages 18–59" reads like a mistake even when every
  // number in it is right.
  const bands = new Map<string, any[]>();
  rows.forEach((r) => {
    const key = `${r.age_group_min ?? ""}–${r.age_group_max ?? ""}`;
    if (!bands.has(key)) bands.set(key, []);
    bands.get(key)!.push(r);
  });
  const orderedBands = Array.from(bands.entries()).sort(
    (a, b) => (a[1][0]?.age_group_min ?? -1) - (b[1][0]?.age_group_min ?? -1),
  );

  return (
    <div className="space-y-6">
      {orderedBands.map(([range, bandRows]) => (
        <div key={range}>
          <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            Ages {range}
          </div>
          <AgeBandTable
            rows={bandRows}
            levels={levels}
            myLevelName={myLevelName}
            myPct={myPct}
          />
        </div>
      ))}
    </div>
  );
}

function AgeBandTable({
  rows,
  levels,
  myLevelName,
  myPct,
}: {
  rows: any[];
  levels: { name: string; pct: number }[];
  myLevelName: string | null;
  myPct: number | null;
}) {
  // Authored row order when the editor saved one — grids are arranged the way
  // the carrier publishes them, and alphabetical was throwing that away.
  // Alphabetical stays as the fallback for rows saved before sort_order.
  const products = useMemo(() => {
    const pos = new Map<string, number>();
    for (const r of rows) {
      if (r.sort_order == null) continue;
      const cur = pos.get(r.product_name);
      if (cur == null || r.sort_order < cur) pos.set(r.product_name, r.sort_order);
    }
    return Array.from(new Set(rows.map((r) => r.product_name as string))).sort((a, b) =>
      (pos.get(a) ?? Number.MAX_SAFE_INTEGER) - (pos.get(b) ?? Number.MAX_SAFE_INTEGER) ||
      a.localeCompare(b));
  }, [rows]);

  const lookup = useMemo(() => {
    const m = new Map<string, any>();
    rows.forEach((r) => m.set(`${r.product_name}::${r.level_name}`, r));
    return m;
  }, [rows]);

  // Sort: agent's own level first (leftmost), then descending by pct
  const sortedLevels = useMemo(() => {
    const mine = levels.filter((l) => levelIsMe(l.name, myLevelName, myPct));
    const others = levels
      .filter((l) => !levelIsMe(l.name, myLevelName, myPct))
      .sort((a, b) => b.pct - a.pct);
    return [...mine, ...others];
  }, [levels, myLevelName, myPct]);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground border-r bg-muted/40 sticky left-0 min-w-[180px] z-10 text-xs uppercase tracking-wide">
              Product
            </th>
            {sortedLevels.map((l) => {
              const isMe = levelIsMe(l.name, myLevelName, myPct);
              return (
                <th
                  key={l.name}
                  className={cn(
                    "text-center px-3 py-2.5 font-semibold border-r whitespace-nowrap min-w-[100px]",
                    isMe
                      ? "bg-primary/20 text-gold-bright dark:text-primary"
                      : "bg-muted/40 text-muted-foreground",
                  )}
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs">{l.name}</span>
                    {isMe && (
                      <span className="inline-flex items-center rounded-full bg-primary text-gold-foreground text-[9px] font-bold px-1.5 py-0 leading-4">
                        YOU
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {products.map((product, pi) => (
            <tr key={product} className={cn("hover:bg-muted/20", pi % 2 === 1 && "bg-muted/5")}>
              <td className="px-3 py-2.5 font-medium sticky left-0 bg-background border-r z-10 whitespace-nowrap text-sm">
                {product}
              </td>
              {sortedLevels.map((l) => {
                const cell = lookup.get(`${product}::${l.name}`);
                const isMe = levelIsMe(l.name, myLevelName, myPct);
                const yr1 = cell ? Number(cell.year_1_pct) : null;
                const yr25 = cell ? Number(cell.years_2_5_pct) : null;
                const yr6 = cell ? Number(cell.years_6_plus_pct) : null;

                return (
                  <td
                    key={l.name}
                    className={cn("px-3 py-2.5 text-center border-r", isMe && "bg-primary/10")}
                  >
                    {yr1 !== null ? (
                      <div className="space-y-0.5">
                        <div
                          className={cn(
                            "font-mono font-semibold text-sm",
                            isMe
                              ? "text-gold-bright dark:text-primary"
                              : "text-foreground",
                          )}
                        >
                          {yr1 === 0 ? "LOA" : `${yr1}%`}
                        </div>
                        {(yr25 ?? 0) > 0 && (
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {yr25}% / {(yr6 ?? 0) > 0 ? `${yr6}%` : "—"}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Legend */}
      <div className="px-3 py-2 border-t bg-muted/20 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span>
          <span className="font-semibold">Yr 1</span> = First-year commission rate
        </span>
        {rows.some((r) => Number(r.years_2_5_pct) > 0) && (
          <span>
            <span className="font-semibold">Yr 2-5 / Yr 6+</span> = Renewal rates
          </span>
        )}
      </div>
    </div>
  );
}
