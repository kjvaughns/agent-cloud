import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/back-office/case-design")({
  head: () => ({
    meta: [
      { title: "Case Design — Agent Cloud" },
      { name: "description", content: "Submit complex cases for advanced design and product recommendations." },
    ],
  }),
  component: CaseDesignPage,
});

const CASES = [
  { id: "CD-1042", client: "Maria Gonzalez", product: "IUL Blend", premium: "$650/mo", status: "Quoted", updated: "2h ago" },
  { id: "CD-1039", client: "James O'Connor", product: "Annuity Rollover", premium: "$120k single", status: "In Review", updated: "1d ago" },
  { id: "CD-1031", client: "Aisha Patel", product: "Term + IUL Stack", premium: "$310/mo", status: "New", updated: "3d ago" },
  { id: "CD-1024", client: "Lee Chen", product: "Final Expense", premium: "$48/mo", status: "Closed", updated: "1w ago" },
];

const STATUS_COLORS: Record<string, string> = {
  New: "bg-info/15 text-info",
  "In Review": "bg-warning/15 text-warning",
  Quoted: "bg-primary/15 text-primary",
  Closed: "bg-success/15 text-success",
};

function CaseDesignPage() {
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle>Submit a case</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Client name</Label><Input placeholder="Jane Doe" /></div>
          <div><Label>Product focus</Label><Input placeholder="IUL, Annuity, Term…" /></div>
          <div><Label>Budget</Label><Input placeholder="$/mo or lump sum" /></div>
          <div><Label>Goals & constraints</Label><Textarea rows={5} placeholder="Health class, beneficiaries, income goals…" /></div>
          <Button className="w-full">Submit Case</Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Open cases</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {CASES.map((c) => (
            <div key={c.id} className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/40">
              <div>
                <div className="font-medium">{c.client} <span className="text-muted-foreground text-xs ml-2">{c.id}</span></div>
                <div className="text-sm text-muted-foreground">{c.product} · {c.premium}</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge className={STATUS_COLORS[c.status]} variant="secondary">{c.status}</Badge>
                <span className="text-xs text-muted-foreground w-16 text-right">{c.updated}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
