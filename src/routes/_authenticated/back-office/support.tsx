import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/back-office/support")({
  component: SupportPage,
});

const TICKETS = [
  { id: "T-1042", subject: "Commission discrepancy — Sep statement", agent: "M. Chen", priority: "High", status: "Open", age: "2d" },
  { id: "T-1041", subject: "Carrier portal login error (Aegis)", agent: "P. Singh", priority: "Medium", status: "In Progress", age: "1d" },
  { id: "T-1039", subject: "Update direct deposit info", agent: "S. Lopez", priority: "Low", status: "Resolved", age: "5d" },
  { id: "T-1037", subject: "Need replacement form template", agent: "J. O'Connor", priority: "Low", status: "Resolved", age: "1w" },
];

function SupportPage() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button>New Ticket</Button></div>
      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {TICKETS.map((t) => (
              <div key={t.id} className="p-4 flex items-center justify-between hover:bg-muted/30">
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-muted-foreground">{t.id}</span>
                    <span className="font-medium">{t.subject}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{t.agent} · {t.age} old</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{t.priority}</Badge>
                  <Badge variant={t.status === "Resolved" ? "secondary" : "default"}>{t.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
