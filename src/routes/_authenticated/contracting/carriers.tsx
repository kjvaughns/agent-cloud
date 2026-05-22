import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CARRIERS } from "@/lib/mock-data";
import { Phone, Globe, Clock, TrendingUp, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/contracting/carriers")({
  component: CarriersPage,
});

const META = [
  "Final Expense · Whole Life · Term", "Final Expense · Term", "Whole Life · IUL",
  "Final Expense · Annuity", "Term · Whole Life", "Term · IUL · Annuity",
  "Final Expense · Whole Life", "Term · Whole Life", "Final Expense", "Whole Life · Annuity",
];

function CarriersPage() {
  return (
    <div className="p-6 grid md:grid-cols-2 gap-4">
      {CARRIERS.map((c, i) => (
        <Card key={c}><CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary/10 grid place-items-center text-primary font-bold">
              {c.split(" ").map((w)=>w[0]).join("").slice(0,2)}
            </div>
            <div className="flex-1">
              <div className="font-semibold">{c}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{META[i % META.length]}</div>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Appointed</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
            <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-muted-foreground" /> 105% Year 1</div>
            <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /> 9-mo advance</div>
            <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> (800) 555-{(1000 + i * 17).toString().slice(-4)}</div>
            <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-muted-foreground" /> Mon–Fri 8–6 CT</div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button size="sm" variant="outline"><ExternalLink className="h-3.5 w-3.5" /> Open portal</Button>
            <Button size="sm" variant="ghost">View grid</Button>
          </div>
        </CardContent></Card>
      ))}
    </div>
  );
}
