import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Calculator, Printer, UserPlus, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getNeedsAnalysis, type NeedsAnalysisResult } from "@/lib/ai-features.functions";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/tools/needs-analysis")({
  head: () => ({
    meta: [
      { title: "Needs Analysis Calculator — Agent Cloud" },
      { name: "description", content: "Calculate appropriate life insurance coverage for your clients." },
    ],
  }),
  component: NeedsAnalysisPage,
});

function NeedsAnalysisPage() {
  const fn = useServerFn(getNeedsAnalysis);
  const [form, setForm] = useState({
    age: "", income: "", married: false, dependents: "",
    housing: "", utilities: "", transport: "", food: "", health: "", childcare: "", other: "",
    mortgage: "", savings: "", existing: "",
  });
  const [result, setResult] = useState<NeedsAnalysisResult | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });
  const n = (v: string) => Number(v || 0);

  const mut = useMutation({
    mutationFn: () =>
      fn({
        data: {
          age: n(form.age), annual_income: n(form.income), married: form.married,
          dependents: n(form.dependents),
          monthly_expenses: n(form.housing) + n(form.utilities) + n(form.transport) + n(form.food) + n(form.health) + n(form.childcare) + n(form.other),
          mortgage_balance: n(form.mortgage), savings: n(form.savings), existing_coverage: n(form.existing),
        },
      }),
    onSuccess: setResult,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Calculator className="h-7 w-7" /> Life Insurance Needs Analysis</h1>
        <p className="text-muted-foreground mt-1">AI-powered coverage recommendation using the DIME method.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Personal Information</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <Field label="Age" value={form.age} onChange={set("age")} />
              <Field label="Annual Income" prefix="$" value={form.income} onChange={set("income")} />
              <div className="space-y-1.5">
                <Label className="text-xs">Married?</Label>
                <div className="flex items-center gap-2 h-9"><Switch checked={form.married} onCheckedChange={(v) => setForm({ ...form, married: v })} /></div>
              </div>
              <Field label="Number of Dependents" value={form.dependents} onChange={set("dependents")} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Monthly Household Expenses</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <Field label="Housing (Rent/Mortgage)" prefix="$" value={form.housing} onChange={set("housing")} />
              <Field label="Utilities" prefix="$" value={form.utilities} onChange={set("utilities")} />
              <Field label="Transportation" prefix="$" value={form.transport} onChange={set("transport")} />
              <Field label="Food & Groceries" prefix="$" value={form.food} onChange={set("food")} />
              <Field label="Healthcare" prefix="$" value={form.health} onChange={set("health")} />
              <Field label="Childcare" prefix="$" value={form.childcare} onChange={set("childcare")} />
              <Field label="Other Monthly Expenses" prefix="$" value={form.other} onChange={set("other")} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Financial Assets & Debts</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <Field label="Mortgage Balance" prefix="$" value={form.mortgage} onChange={set("mortgage")} />
              <Field label="Savings & Checking" prefix="$" value={form.savings} onChange={set("savings")} />
              <Field label="Existing Life Insurance" prefix="$" value={form.existing} onChange={set("existing")} />
            </CardContent>
          </Card>

          <Button size="lg" className="w-full" onClick={() => mut.mutate()} disabled={mut.isPending || !form.age || !form.income}>
            {mut.isPending ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <Sparkles className="h-5 w-5 mr-2" />}
            Calculate Coverage Need
          </Button>
        </div>

        <Card className="h-fit sticky top-16">
          <CardHeader><CardTitle>Professional Analysis</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!result ? (
              <p className="text-sm text-muted-foreground italic">Fill in client details and click Calculate.</p>
            ) : (
              <>
                <Row label="Income Replacement" value={money(result.income_replacement)} />
                <Row label="Debt Coverage" value={money(result.debt_coverage)} />
                <Row label="Final Expense" value={money(result.final_expense)} />
                <Row label="Education Fund" value={money(result.education_fund)} />
                <div className="rounded-lg bg-primary/10 p-4 mt-4">
                  <div className="text-xs uppercase text-muted-foreground">Total Recommended Coverage</div>
                  <div className="text-3xl font-bold text-primary mt-1">{money(result.total_recommended)}</div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Range: {money(result.range_low)} – {money(result.range_high)}
                  </div>
                </div>
                {result.rationale && (
                  <p className="text-xs text-muted-foreground italic pt-2">{result.rationale}</p>
                )}
                {result.client_summary && (
                  <div className="rounded-md bg-muted p-3 text-xs">
                    <div className="font-semibold mb-1">Client-friendly summary</div>
                    {result.client_summary}
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1"><Printer className="h-3 w-3 mr-1" /> Save</Button>
                  <Button size="sm" className="flex-1"><UserPlus className="h-3 w-3 mr-1" /> Attach</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, prefix, value, onChange }: { label: string; prefix?: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{prefix}</span>}
        <Input className={prefix ? "pl-7" : ""} placeholder="0" value={value} onChange={onChange} type="number" />
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
