import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyCarrierLevels, getCommissionGrid } from "@/lib/contracting.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contracting/commission-grids")({
  component: GridsPage,
  head: () => ({ meta: [{ title: "Commission Grids | Agent Cloud" }] }),
});

function GridsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["contracting","myLevels"], queryFn: () => listMyCarrierLevels() });

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Commission Grids</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          View commission rates for your contracted carriers. Click on a carrier to expand and view the full commission grid.
          Your assigned level is highlighted in gold. You can only view commission levels at or below your assigned level.
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
                <div className="flex items-center gap-3 flex-1">
                  <div className="text-left flex-1">
                    <div className="font-semibold">{r.carriers?.name ?? "Carrier"}</div>
                    {r.carriers?.is_annuity_carrier && <div className="text-xs"><Badge variant="secondary">Annuity</Badge></div>}
                  </div>
                  <Badge variant={r.carriers?.active ? "default" : "secondary"}>{r.carriers?.active ? "Active" : "Inactive"}</Badge>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Your Level:</span>{" "}
                    <span className="font-mono">{r.commission_level ?? "—"} ({Number(r.assigned_pct)}%)</span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <GridDetail carrierId={r.carrier_id} myPct={Number(r.assigned_pct)} />
              </AccordionContent>
            </AccordionItem></Card>
          ))}
        </Accordion>
      )}
    </div>
  );
}

function GridDetail({ carrierId, myPct }: { carrierId: string; myPct: number }) {
  const fn = useServerFn(getCommissionGrid);
  const { data, isLoading } = useQuery({
    queryKey: ["contracting","grid",carrierId],
    queryFn: () => fn({ data: { carrier_id: carrierId } }),
  });
  if (isLoading) return <Skeleton className="h-32" />;
  const rows: any[] = data?.rows ?? [];
  if (rows.length === 0) return <div className="text-sm text-muted-foreground py-4">No grid rows available for your level.</div>;

  const byAge = new Map<string, any[]>();
  rows.forEach(r => {
    const key = `${r.age_group_min ?? "—"}-${r.age_group_max ?? "—"}`;
    if (!byAge.has(key)) byAge.set(key, []);
    byAge.get(key)!.push(r);
  });

  return (
    <div className="space-y-4">
      {Array.from(byAge.entries()).map(([range, list]) => (
        <div key={range}>
          <div className="text-xs font-semibold text-muted-foreground mb-1">Ages {range}</div>
          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-6 bg-muted/40 text-xs font-semibold py-2 px-3 text-muted-foreground">
              <div className="col-span-2">Product</div>
              <div>Level</div>
              <div className="text-right">Year 1</div>
              <div className="text-right">Years 2–5</div>
              <div className="text-right">Years 6+</div>
            </div>
            {list.map((l) => {
              const isMine = Number(l.year_1_pct) === myPct;
              return (
                <div key={l.id} className={cn("grid grid-cols-6 py-2 px-3 text-sm border-t", isMine && "bg-amber-400/20 font-semibold")}>
                  <div className="col-span-2">{l.product_name}</div>
                  <div className="font-mono text-xs">{l.level_name ?? "—"}</div>
                  <div className="text-right font-mono">{Number(l.year_1_pct ?? 0)}%</div>
                  <div className="text-right font-mono">{Number(l.years_2_5_pct ?? 0)}%</div>
                  <div className="text-right font-mono">{Number(l.years_6_plus_pct ?? 0)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
