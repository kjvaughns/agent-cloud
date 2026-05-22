import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/resources/marketing")({
  component: MarketingPage,
});

const ASSETS = [
  { name: "Social Post — IUL benefits", type: "Image", format: "1080x1080" },
  { name: "Social Post — Family Protection", type: "Image", format: "1080x1350" },
  { name: "Reel Script — 30s annuity hook", type: "Video", format: "9:16" },
  { name: "Lead Magnet — Retirement Guide PDF", type: "PDF", format: "Letter" },
  { name: "Email Drip — 5 touch IUL sequence", type: "Email", format: "HTML" },
  { name: "Landing Page — Free Quote", type: "Web", format: "Responsive" },
  { name: "Business Card Template", type: "Print", format: "3.5x2in" },
  { name: "Door Hanger — Final Expense", type: "Print", format: "4x11in" },
];

function MarketingPage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {ASSETS.map((a) => (
        <Card key={a.name} className="overflow-hidden">
          <div className="aspect-video bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-xs text-muted-foreground">{a.format}</div>
          <CardContent className="p-4 space-y-2">
            <div className="text-sm font-medium line-clamp-2">{a.name}</div>
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="text-xs">{a.type}</Badge>
              <Button size="sm" variant="outline">Get</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
