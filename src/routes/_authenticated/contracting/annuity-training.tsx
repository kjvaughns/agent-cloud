import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileCheck2, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/contracting/annuity-training")({
  component: AnnuityTrainingPage,
});

const COURSES = [
  { name: "NAIC Annuity Suitability — 4-hour", status: "complete", date: "Mar 12, 2026" },
  { name: "Best Interest Standard — 1-hour", status: "complete", date: "Mar 14, 2026" },
  { name: "Indexed Annuity Product Specific", status: "pending" },
  { name: "Carrier — Mutual of Omaha Annuity", status: "pending" },
];

function AnnuityTrainingPage() {
  return (
    <div className="p-6 max-w-3xl space-y-4">
      <Card><CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/10 grid place-items-center text-primary"><GraduationCap className="h-6 w-6" /></div>
          <div className="flex-1">
            <h2 className="font-semibold">Upload your annuity training certificate</h2>
            <p className="text-sm text-muted-foreground mt-1">Required before any annuity application can be submitted. We'll match it to carriers automatically.</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border-2 border-dashed p-8 text-center">
          <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="mt-2 text-sm font-medium">Drop PDF here or click to upload</div>
          <div className="text-xs text-muted-foreground">Max 10MB · PDF only</div>
          <Button className="mt-4">Choose file</Button>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <div className="p-4 border-b font-semibold">Required courses</div>
        <div className="divide-y">
          {COURSES.map((c) => (
            <div key={c.name} className="flex items-center gap-3 p-4">
              <div className={`h-8 w-8 rounded-lg grid place-items-center ${c.status === "complete" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                <FileCheck2 className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-sm">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.status === "complete" ? `Completed ${c.date}` : "Not started"}</div>
              </div>
              {c.status === "pending" && <Button size="sm" variant="outline">Start on WebCE</Button>}
            </div>
          ))}
        </div>
      </CardContent></Card>
    </div>
  );
}
