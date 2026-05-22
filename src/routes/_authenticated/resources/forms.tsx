import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/resources/forms")({
  component: FormsPage,
});

const FORMS = [
  { name: "HIPAA Authorization", category: "Compliance", updated: "Oct 2025", required: true },
  { name: "Replacement Form (NAIC)", category: "Replacement", updated: "Sep 2025", required: true },
  { name: "Annuity Suitability Worksheet", category: "Annuity", updated: "Nov 2025", required: true },
  { name: "Illustration Acknowledgement", category: "IUL", updated: "Aug 2025", required: false },
  { name: "Carrier Appointment Application — Americo", category: "Contracting", updated: "Jul 2025", required: false },
  { name: "E&O Certificate Template", category: "Compliance", updated: "Jan 2025", required: false },
  { name: "Beneficiary Change Form", category: "Service", updated: "Jun 2025", required: false },
];

function FormsPage() {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {FORMS.map((f) => (
            <div key={f.name} className="flex items-center justify-between p-4 hover:bg-muted/30">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    {f.name}
                    {f.required && <Badge variant="outline" className="text-xs">Required</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{f.category} · Updated {f.updated}</div>
                </div>
              </div>
              <Button variant="ghost" size="sm"><Download className="h-4 w-4 mr-2" />Download</Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
