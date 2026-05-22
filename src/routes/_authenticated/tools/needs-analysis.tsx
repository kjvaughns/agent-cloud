import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Calculator, Printer, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tools/needs-analysis")({
  head: () => ({
    meta: [
      { title: "Needs Analysis Calculator — Agent Cloud" },
      { name: "description", content: "Calculate appropriate life insurance coverage for your clients." },
    ],
  }),
  component: NeedsAnalysisPage,
});

function Field({ label, prefix }: { label: string; prefix?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{prefix}</span>}
        <Input className={prefix ? "pl-7" : ""} placeholder="0" />
      </div>
    </div>
  );
}

function NeedsAnalysisPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Calculator className="h-7 w-7" /> Life Insurance Needs Analysis</h1>
        <p className="text-muted-foreground mt-1">Calculate appropriate life insurance coverage for your clients.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <Field label="Age" />
              <Field label="Annual Income" prefix="$" />
              <div className="space-y-1.5">
                <Label className="text-xs">Married?</Label>
                <div className="flex items-center gap-2 h-9"><Switch /></div>
              </div>
              <Field label="Number of Dependents" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Monthly Household Expenses</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <Field label="Housing (Rent/Mortgage)" prefix="$" />
              <Field label="Utilities" prefix="$" />
              <Field label="Transportation" prefix="$" />
              <Field label="Food & Groceries" prefix="$" />
              <Field label="Healthcare" prefix="$" />
              <Field label="Childcare" prefix="$" />
              <Field label="Other Monthly Expenses" prefix="$" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Financial Assets & Debts</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <Field label="Mortgage Balance" prefix="$" />
              <Field label="Savings & Checking" prefix="$" />
              <Field label="Existing Life Insurance" prefix="$" />
            </CardContent>
          </Card>

          <Button size="lg" className="w-full">Calculate Coverage Need</Button>
        </div>

        <Card className="h-fit sticky top-16">
          <CardHeader><CardTitle>Professional Analysis</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Income Replacement" value="$650,000" />
            <Row label="Debt Coverage" value="$185,000" />
            <Row label="Final Expense" value="$15,000" />
            <Row label="Education Fund" value="$120,000" />
            <div className="rounded-lg bg-primary/10 p-4 mt-4">
              <div className="text-xs uppercase text-muted-foreground">Total Recommended Coverage</div>
              <div className="text-3xl font-bold text-primary mt-1">$970,000</div>
              <div className="text-xs text-muted-foreground mt-2">Range: $750K – $1.2M</div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="flex-1"><Printer className="h-3 w-3 mr-1" /> Save</Button>
              <Button size="sm" className="flex-1"><UserPlus className="h-3 w-3 mr-1" /> Attach</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
