import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/back-office/recruiting-funnels")({
  head: () => ({
    meta: [
      { title: "Recruiting Funnels — Agent Cloud" },
      { name: "description", content: "Build branded recruiting websites to attract licensed and unlicensed agents." },
    ],
  }),
  component: FunnelsPage,
});

const TEMPLATES = [
  { slug: "career-launch", name: "Career Launch", desc: "For unlicensed prospects exploring the industry." },
  { slug: "veteran-agent", name: "Veteran Agent", desc: "Pitch your contracts and uplines to experienced agents." },
  { slug: "part-time", name: "Part-Time Income", desc: "Side-hustle angle for working professionals." },
];

const MY = [
  { name: "Texas Career Launch", slug: "tx-career", published: true, views: 2480, leads: 47 },
  { name: "Veteran Recruit — FL", slug: "fl-vet", published: true, views: 1120, leads: 28 },
  { name: "Side Income Pilot", slug: "side-pilot", published: false, views: 0, leads: 0 },
];

function FunnelsPage() {
  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-end justify-between mb-3">
          <h2 className="text-lg font-semibold">Templates</h2>
          <Button><Plus className="h-4 w-4 mr-1" /> New from blank</Button>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {TEMPLATES.map((t) => (
            <Card key={t.slug}>
              <div className="h-32 bg-gradient-to-br from-primary/20 to-accent rounded-t-xl" />
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
        <h2 className="text-lg font-semibold mb-3">My funnels</h2>
        <Card>
          <CardContent className="p-0 divide-y">
            {MY.map((f) => (
              <div key={f.slug} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium flex items-center gap-2">{f.name} {f.published && <Badge variant="secondary">Live</Badge>}</div>
                  <div className="text-xs text-muted-foreground">agentcloud.app/r/{f.slug}</div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-sm text-right">
                    <div>{f.views.toLocaleString()} views</div>
                    <div className="text-muted-foreground text-xs">{f.leads} leads</div>
                  </div>
                  <Switch checked={f.published} />
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
