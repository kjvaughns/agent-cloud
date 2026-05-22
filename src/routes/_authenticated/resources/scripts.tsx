import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Phone, FileText, Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/resources/scripts")({
  component: ScriptsPage,
});

const SCRIPTS = [
  { id: 1, title: "IUL Discovery Call — 20 min", cat: "Discovery", product: "IUL", rating: 4.9, uses: 1240 },
  { id: 2, title: "Final Expense Telesales Pitch", cat: "Pitch", product: "FE", rating: 4.8, uses: 980 },
  { id: 3, title: "Annuity Rollover Rebuttal Pack", cat: "Objection", product: "Annuity", rating: 4.7, uses: 645 },
  { id: 4, title: "Term Life Quick Quote", cat: "Pitch", product: "Term", rating: 4.6, uses: 1530 },
  { id: 5, title: "Recruit Interview — Existing Agent", cat: "Recruiting", product: "—", rating: 4.9, uses: 420 },
  { id: 6, title: "Voicemail Script That Gets Callbacks", cat: "Outreach", product: "All", rating: 4.5, uses: 2100 },
];

function ScriptsPage() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search scripts..." className="pl-9" />
        </div>
        <Button>Upload Script</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SCRIPTS.map((s) => (
          <Card key={s.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {s.cat === "Pitch" || s.cat === "Outreach" ? <Phone className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-primary" />}
                  {s.title}
                </CardTitle>
              </div>
              <div className="flex gap-2 mt-2">
                <Badge variant="secondary">{s.cat}</Badge>
                <Badge variant="outline">{s.product}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{s.rating}</span>
                <span>{s.uses.toLocaleString()} uses</span>
              </div>
              <Button variant="outline" size="sm" className="w-full mt-3">Open</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
