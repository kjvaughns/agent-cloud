import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, FileWarning } from "lucide-react";

export const Route = createFileRoute("/_authenticated/back-office/compliance")({
  component: CompliancePage,
});

const ITEMS = [
  { icon: ShieldCheck, label: "E&O Coverage", detail: "Renews Mar 2026", status: "ok" },
  { icon: AlertTriangle, label: "Annuity CE Hours", detail: "4 of 8 hours complete", status: "warn" },
  { icon: FileWarning, label: "Replacement Form — R. Davis", detail: "Missing signature page", status: "warn" },
  { icon: ShieldCheck, label: "AML Training 2026", detail: "Completed Oct 12", status: "ok" },
];

function CompliancePage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {ITEMS.map((it) => (
        <Card key={it.label}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <it.icon className={`h-5 w-5 ${it.status === "ok" ? "text-emerald-500" : "text-amber-500"}`} />
              {it.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{it.detail}</span>
            <Badge variant={it.status === "ok" ? "secondary" : "destructive"}>{it.status === "ok" ? "Compliant" : "Action needed"}</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
