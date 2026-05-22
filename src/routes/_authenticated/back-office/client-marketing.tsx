import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/back-office/client-marketing")({
  head: () => ({
    meta: [
      { title: "Client Marketing — Agent Cloud" },
      { name: "description", content: "Publish landing pages to capture leads for life insurance, annuities, and more." },
    ],
  }),
  component: ClientMarketingPage,
});

const TEMPLATES = [
  { slug: "final-expense", name: "Final Expense", desc: "Simple quote form, trust badges, and BBB social proof." },
  { slug: "iul-savings", name: "IUL Tax-Free Retirement", desc: "Long-form IUL explainer with calculator CTA." },
  { slug: "mortgage-protect", name: "Mortgage Protection", desc: "Letter-style outreach with auto-quote form." },
  { slug: "annuity-rollover", name: "Annuity Rollover", desc: "401k/IRA rollover focused with comparison chart." },
];

const PAGES = [
  { name: "Final Expense — Houston", slug: "houston-fe", published: true, views: 8420, leads: 312 },
  { name: "IUL Retirement Plan", slug: "iul-plan", published: true, views: 4310, leads: 98 },
  { name: "Mortgage Protect — Draft", slug: "mp-draft", published: false, views: 0, leads: 0 },
];

function ClientMarketingPage() {
  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-end justify-between mb-3">
          <h2 className="text-lg font-semibold">Landing page templates</h2>
          <Button><Plus className="h-4 w-4 mr-1" /> New page</Button>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {TEMPLATES.map((t) => (
            <Card key={t.slug}>
              <div className="h-28 bg-gradient-to-br from-success/20 to-info/20 rounded-t-xl" />
              <CardHeader><CardTitle className="text-base">{t.name}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{t.desc}</p>
                <Button size="sm" variant="outline" className="w-full">Use template</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">My landing pages</h2>
        <Card>
          <CardContent className="p-0 divide-y">
            {PAGES.map((p) => (
              <div key={p.slug} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium flex items-center gap-2">{p.name} {p.published && <Badge variant="secondary">Live</Badge>}</div>
                  <div className="text-xs text-muted-foreground">agentcloud.app/c/{p.slug}</div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-sm text-right">
                    <div>{p.views.toLocaleString()} views</div>
                    <div className="text-muted-foreground text-xs">{p.leads} leads</div>
                  </div>
                  <Switch checked={p.published} />
                  <Button variant="ghost" size="icon" aria-label="Open"><ExternalLink className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
