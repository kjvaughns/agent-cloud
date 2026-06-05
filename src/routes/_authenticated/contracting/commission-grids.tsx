import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyCarrierLevels, getCommissionGrid } from "@/lib/contracting.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/contracting/commission-grids")({
  component: GridsPage,
  head: () => ({ meta: [{ title: "Commission Grids | Agent Cloud" }] }),
});

function GridsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["contracting","myLevels"], queryFn: () => listMyCarrierLevels() });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Commission Grids</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          View commission rates for your contracted carriers. Your assigned level is highlighted in gold.
        </p>
      </div>

      {isLoading ? <Skeleton className="h-40" /> : (data?.rows.length ?? 0) === 0 ? (
        <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">
          No carrier levels assigned yet.
        </CardContent></Card>
      ) : (
        <Accordion type="single" collapsible className="space-y-2">
          {(data?.rows ?? []).map((r: any) => (
            <Card key={r.carrier_id}><AccordionItem value={r.carrier_id} className="border-0">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-3 flex-1 flex-wrap">
                  <div className="text-left flex-1">
                    <div className="font-semibold">{r.carriers?.name ?? "Carrier"}</div>
                    {r.carriers?.is_annuity_carrier && <div className="text-xs"><Badge variant="secondary">Annuity</Badge></div>}
                  </div>
                  {r.commission_level ? (
                    <Badge className="bg-amber-500 text-white shrink-0">
                      Your Level: {r.commission_level} ({Number(r.assigned_pct)}%)
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground shrink-0">{Number(r.assigned_pct)}%</span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <GridDetail carrierId={r.carrier_id} myLevelName={r.commission_level ?? null} />
              </AccordionContent>
            </AccordionItem></Card>
          ))}
        </Accordion>
      )}
    </div>
  );
}

function GridDetail({ carrierId, myLevelName }: { carrierId: string; myLevelName: string | null }) {
  const fn = useServerFn(getCommissionGrid);
  const { data, isLoading } = useQuery({
    queryKey: ["contracting", "grid", carrierId],
    queryFn: () => fn({ data: { carrier_id: carrierId } }),
  });

  if (isLoading) return <Skeleton className="h-32" />;
  const rows: any[] = data?.rows ?? [];
  if (rows.length === 0) return <div className="text-sm text-muted-foreground py-4">No grid data available.</div>;

  const hasAgeBands = rows.some((r) => r.age_group_min != null);

  // Build unique level columns: level_name → max year_1_pct, sorted desc
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
    // No named levels — show flat list
    return (
      <div className="text-sm text-muted-foreground">Grid data has no named levels configured.</div>
    );
  }

  if (!hasAgeBands) {
    return <AgeBandTable rows={rows} levels={levels} myLevelName={myLevelName} />;
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
          <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Ages {range}</div>
          <AgeBandTable rows={bandRows} levels={levels} myLevelName={myLevelName} />
        </div>
      ))}
    </div>
  );
}

function AgeBandTable({
  rows,
  levels,
  myLevelName,
}: {
  rows: any[];
  levels: { name: string; pct: number }[];
  myLevelName: string | null;
}) {
  const products = useMemo(
    () => Array.from(new Set(rows.map((r) => r.product_name as string))).sort(),
    [rows]
  );
  const lookup = useMemo(() => {
    const m = new Map<string, any>();
    rows.forEach((r) => m.set(`${r.product_name}::${r.level_name}`, r));
    return m;
  }, [rows]);

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left px-3 py-2 font-medium text-muted-foreground border-b border-r bg-muted/40 sticky left-0 min-w-[160px] z-10">
              Product
            </th>
            {levels.map((l) => {
              const isMe = l.name === myLevelName;
              return (
                <th
                  key={l.name}
                  colSpan={3}
                  className={`text-center px-3 py-2 font-medium border-b border-r whitespace-nowrap min-w-[200px] ${
                    isMe
                      ? "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300"
                      : "bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span>{l.name}</span>
                    <span className="text-xs font-normal opacity-75">{l.pct}%</span>
                    {isMe && (
                      <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0 h-4 mt-0.5">
                        YOU
                      </Badge>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
          <tr>
            <th className="sticky left-0 bg-muted/20 border-b border-r px-3 py-1.5 z-10" />
            {levels.map((l) => {
              const isMe = l.name === myLevelName;
              const bg = isMe ? "bg-amber-50/60 dark:bg-amber-950/30" : "bg-muted/20";
              return (
                <>
                  <th key={`${l.name}-yr1`} className={`${bg} border-b px-2 py-1 text-[10px] text-center text-muted-foreground font-medium min-w-[60px]`}>Yr 1</th>
                  <th key={`${l.name}-yr25`} className={`${bg} border-b px-2 py-1 text-[10px] text-center text-muted-foreground font-medium min-w-[60px]`}>Yr 2–5</th>
                  <th key={`${l.name}-yr6`} className={`${bg} border-b border-r px-2 py-1 text-[10px] text-center text-muted-foreground font-medium min-w-[60px]`}>Yr 6+</th>
                </>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {products.map((product) => (
            <tr key={product} className="hover:bg-muted/20">
              <td className="px-3 py-2 font-medium sticky left-0 bg-background border-r z-10 whitespace-nowrap">
                {product}
              </td>
              {levels.map((l) => {
                const cell = lookup.get(`${product}::${l.name}`);
                const isMe = l.name === myLevelName;
                const bg = isMe ? "bg-amber-50/30 dark:bg-amber-950/15" : "";
                if (!cell) {
                  return (
                    <>
                      <td key={`${l.name}-yr1`} className={`${bg} px-2 py-2 text-center text-muted-foreground font-mono text-xs`}>—</td>
                      <td key={`${l.name}-yr25`} className={`${bg} px-2 py-2 text-center text-muted-foreground font-mono text-xs`}>—</td>
                      <td key={`${l.name}-yr6`} className={`${bg} px-2 py-2 text-center text-muted-foreground font-mono text-xs border-r`}>—</td>
                    </>
                  );
                }
                return (
                  <>
                    <td key={`${l.name}-yr1`} className={`${bg} px-2 py-2 text-center font-mono text-xs`}>{Number(cell.year_1_pct)}%</td>
                    <td key={`${l.name}-yr25`} className={`${bg} px-2 py-2 text-center font-mono text-xs`}>{Number(cell.years_2_5_pct) ? `${Number(cell.years_2_5_pct)}%` : "—"}</td>
                    <td key={`${l.name}-yr6`} className={`${bg} px-2 py-2 text-center font-mono text-xs border-r`}>{Number(cell.years_6_plus_pct) ? `${Number(cell.years_6_plus_pct)}%` : "—"}</td>
                  </>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
