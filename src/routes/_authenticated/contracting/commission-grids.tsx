import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { CARRIERS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contracting/commission-grids")({
  component: GridsPage,
});

const LEVELS = [
  { name: "Personal Producer", code: "PP", yr1: 75, yr2_5: 5, yr6: 3 },
  { name: "Agency 90", code: "A90", yr1: 90, yr2_5: 7, yr6: 4 },
  { name: "Agency 105", code: "A105", yr1: 105, yr2_5: 7, yr6: 4 },
  { name: "Manager 115", code: "M115", yr1: 115, yr2_5: 9, yr6: 5 },
  { name: "Director 125", code: "D125", yr1: 125, yr2_5: 9, yr6: 5 },
];

const MY_LEVEL = "A105";

function GridsPage() {
  return (
    <div className="p-6 space-y-3">
      <p className="text-sm text-muted-foreground">Your current level is highlighted. Levels below show what your downline can earn.</p>
      <Accordion type="multiple" className="space-y-2">
        {CARRIERS.slice(0, 6).map((c) => (
          <Card key={c}>
            <AccordionItem value={c} className="border-0">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-3 flex-1">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 grid place-items-center text-primary font-bold text-xs">
                    {c.split(" ").map((w)=>w[0]).join("").slice(0,2)}
                  </div>
                  <div className="text-left flex-1">
                    <div className="font-semibold">{c}</div>
                    <div className="text-xs text-muted-foreground">Final Expense · Whole Life · Term</div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="rounded-lg border overflow-hidden">
                  <div className="grid grid-cols-4 bg-muted/40 text-xs font-semibold py-2 px-3 text-muted-foreground">
                    <div>Level</div><div className="text-right">Year 1</div><div className="text-right">Years 2–5</div><div className="text-right">Years 6+</div>
                  </div>
                  {LEVELS.map((l) => (
                    <div key={l.code} className={cn(
                      "grid grid-cols-4 py-2.5 px-3 text-sm border-t",
                      l.code === MY_LEVEL && "bg-primary/10 font-semibold"
                    )}>
                      <div className="flex items-center gap-2">
                        {l.code === MY_LEVEL && <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded">YOU</span>}
                        {l.name}
                      </div>
                      <div className="text-right font-mono">{l.yr1}%</div>
                      <div className="text-right font-mono">{l.yr2_5}%</div>
                      <div className="text-right font-mono">{l.yr6}%</div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Card>
        ))}
      </Accordion>
    </div>
  );
}
