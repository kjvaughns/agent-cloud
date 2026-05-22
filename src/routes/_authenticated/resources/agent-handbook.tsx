import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/resources/agent-handbook")({
  head: () => ({
    meta: [
      { title: "Agent Handbook — Agent Cloud" },
      { name: "description", content: "The complete agent handbook: code of conduct, commissions, chargebacks, and compliance." },
    ],
  }),
  component: HandbookPage,
});

const TOC = [
  { id: "code-of-conduct", title: "1. Code of Conduct" },
  { id: "commissions", title: "2. Commissions & Advances" },
  { id: "chargebacks", title: "3. Chargebacks & Persistency" },
  { id: "compliance", title: "4. Compliance & Suitability" },
  { id: "ce", title: "5. Continuing Education" },
  { id: "leaving", title: "6. Releasing & Transfers" },
];

const SECTIONS = [
  { id: "code-of-conduct", title: "Code of Conduct", body: "All agents represent Agent Cloud and its carriers with integrity. No misrepresentation of products, replacement without clear benefit, or pressure tactics. Suitability is the standard, not the floor." },
  { id: "commissions", title: "Commissions & Advances", body: "Commissions are paid on issued and paid policies. Advances are issued at the carrier's discretion, capped per your contract level. Year-1 commissions vest after 12 months of paid premium." },
  { id: "chargebacks", title: "Chargebacks & Persistency", body: "Chargebacks occur when a policy lapses within the advance period. Persistency below 75% over a rolling 12 months may trigger carrier review and contract level adjustment." },
  { id: "compliance", title: "Compliance & Suitability", body: "Document needs analysis for every IUL and annuity sale. Retain illustrations and signed disclosures for 7 years. Replacement sales require completed comparison and reason-why letters." },
  { id: "ce", title: "Continuing Education", body: "Track your CE credits in State Licenses. Most states require 24 hours every 2 years, including 3 hours of ethics. Carrier-specific annuity training is required annually." },
  { id: "leaving", title: "Releasing & Transfers", body: "Releases follow your contracted upline hierarchy. Use Transfer Requests to move existing contracts. Standard release window is 6 months after last submitted business unless waived." },
];

function HandbookPage() {
  return (
    <div className="grid lg:grid-cols-4 gap-6">
      <Card className="lg:col-span-1 h-fit sticky top-16">
        <CardHeader><CardTitle className="text-base">Table of contents</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {TOC.map((t) => (
            <a key={t.id} href={`#${t.id}`} className="block text-sm py-1.5 px-2 rounded hover:bg-muted text-muted-foreground hover:text-foreground">{t.title}</a>
          ))}
        </CardContent>
      </Card>

      <div className="lg:col-span-3 space-y-6">
        {SECTIONS.map((s) => (
          <Card key={s.id} id={s.id}>
            <CardHeader><CardTitle>{s.title}</CardTitle></CardHeader>
            <CardContent className="prose prose-sm max-w-none text-foreground/90 leading-relaxed">
              <p>{s.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
