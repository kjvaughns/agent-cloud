import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wrench } from "lucide-react";
import { QuoteRecommender } from "@/components/ai/quote-recommender";

export const Route = createFileRoute("/_authenticated/tools/quoter")({
  head: () => ({
    meta: [
      { title: "Toolkits — Agent Cloud" },
      { name: "description", content: "Agent tools for quoting, verification, and more." },
    ],
  }),
  component: ToolkitsPage,
});

const TOOLS = [
  { name: "FEX Quoter", desc: "Quote Final Expense products across 50+ carriers instantly.", url: "https://quotify.life", icon: "📋" },
  { name: "Term Quoter", desc: "Compare term life rates for clients of any age and health class.", url: "https://quotify.life", icon: "📊" },
  { name: "IUL Quoter", desc: "Illustrate indexed universal life scenarios and premium options.", url: "https://quotify.life", icon: "📈" },
  { name: "Funeral Home Quotes", desc: "Obtain pre-need funeral expense estimates for client planning.", url: "https://quotify.life", icon: "🏛️" },
  { name: "Bank Validator", desc: "Verify client banking details before submitting an application.", url: "https://quotify.life", icon: "🏦" },
];

function ToolkitsPage() {
  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Wrench className="h-6 w-6" /> Toolkits
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Agent tools for quoting, verification, and client planning.</p>
      </div>

      <QuoteRecommender />

      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        {TOOLS.map((t) => (
          <Card key={t.name}>
            <CardContent className="p-5 flex flex-col gap-3">
              <div className="text-3xl">{t.icon}</div>
              <div>
                <div className="font-semibold">{t.name}</div>
                <p className="text-sm text-muted-foreground mt-0.5">{t.desc}</p>
              </div>
              <Button asChild size="sm" className="mt-auto w-fit">
                <a href={t.url} target="_blank" rel="noreferrer">Open</a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
