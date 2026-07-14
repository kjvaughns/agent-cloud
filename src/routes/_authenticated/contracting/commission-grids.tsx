import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyCarrierLevels, getCommissionGrid } from "@/lib/contracting.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contracting/commission-grids")({
  component: GridsPage,
  head: () => ({ meta: [{ title: "Commission Grids | Agent Cloud" }] }),
});

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

function GridsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["contracting", "myLevels"],
    queryFn: () => listMyCarrierLevels(),
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold font-heading tracking-wide">Commission Grids</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          View commission rates for your contracted carriers. Your assigned level is highlighted in gold.
        </p>
      </div>

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
                      <Badge className="bg-amber-500 text-white shrink-0">
                        Your Level: {r.commission_level} ({Number(r.assigned_pct)}%)
                      </Badge>
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

  // Build level columns: level_name → max year_1_pct
  const levelMap = new Map<string, number>();
  rows.forEach((r) => {
    if (r.level_name) {
      const pct = Number(r.year_1_pct);
      if (!levelMap.has(r.level_name) || pct > levelMap.get(r.level_name)!) {
        levelMap.set(r.level_name, pct);
      }
    }
  });
  const levels = Array.from(levelMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, pct]) => ({ name, pct }));

  if (levels.length === 0) {
    return <div className="text-sm text-muted-foreground">Grid data has no named levels.</div>;
  }

  if (!hasAgeBands) {
    return (
      <AgeBandTable rows={rows} levels={levels} myLevelName={myLevelName} myPct={myPct} />
    );
  }

  // Group by age band
  const bands = new Map<string, any[]>();
  rows.forEach((r) => {
    const key = `${r.age_group_min ?? ""}–${r.age_group_max ?? ""}`;
    if (!bands.has(key)) bands.set(key, []);
    bands.get(key)!.push(r);
  });

  return (
    <div className="space-y-6">
      {Array.from(bands.entries()).map(([range, bandRows]) => (
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
  const products = useMemo(
    () => Array.from(new Set(rows.map((r) => r.product_name as string))).sort(),
    [rows],
  );

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
