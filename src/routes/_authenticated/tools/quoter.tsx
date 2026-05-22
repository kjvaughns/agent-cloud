import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Quote } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tools/quoter")({
  head: () => ({
    meta: [
      { title: "Life Insurance Quoter — Agent Cloud" },
      { name: "description", content: "Quote 100+ carriers including Final Expense, Term Life, IUL, and more." },
    ],
  }),
  component: QuoterPage,
});

const FEATURES = ["FEX Quoter", "Term Quoter", "IUL Quoter", "Funeral Quotes", "Bank Validator"];

function QuoterPage() {
  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2"><Quote className="h-7 w-7" /> Life Insurance Quoter</h1>
        <p className="text-muted-foreground mt-1">Quote 100+ carriers including Final Expense, Term Life, IUL, and more.</p>
      </div>
      <Card>
        <CardContent className="p-8 space-y-6">
          <div className="grid sm:grid-cols-3 gap-3">
            {FEATURES.map((f) => (
              <div key={f} className="rounded-lg border p-3 text-center text-sm font-medium bg-muted/30">{f}</div>
            ))}
          </div>
          <Button size="lg" className="w-full" asChild>
            <a href="https://quotify.life" target="_blank" rel="noreferrer">Open Quoter <ExternalLink className="h-4 w-4 ml-2" /></a>
          </Button>
          <p className="text-xs text-muted-foreground text-center">Powered by Quotify.life</p>
        </CardContent>
      </Card>
    </div>
  );
}
