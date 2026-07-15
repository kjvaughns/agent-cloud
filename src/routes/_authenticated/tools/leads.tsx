import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Pencil, Target, Zap, Check } from "lucide-react";
import { PageShell, HeroBand, Panel } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/tools/leads")({
  head: () => ({
    meta: [
      { title: "Leads — Agent Cloud" },
      { name: "description", content: "Manage your lead sources and purchases." },
    ],
  }),
  component: LeadsPage,
});

const STATES = ["TX", "FL", "GA", "NC", "OH", "PA", "TN", "AZ"];

function LeadsPage() {
  const [tab, setTab] = useState("packages");
  return (
    <PageShell>
      <div className="space-y-[var(--gap)]">
        <HeroBand
          title={<span className="flex items-center gap-2"><Target className="h-6 w-6 text-gold-bright" /> Leads</span>}
          subtitle="Manage your lead sources and purchases."
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="packages">Lead Packages</TabsTrigger>
            <TabsTrigger value="states">States</TabsTrigger>
            <TabsTrigger value="dialer">Dialer</TabsTrigger>
            <TabsTrigger value="inbound">Inbound Leads</TabsTrigger>
          </TabsList>

          <TabsContent value="packages" className="mt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Panel>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-bold text-lg">FEX Lead Package</h3>
                    <div className="tnum font-display font-bold text-gold-bright text-3xl mt-1 leading-none" style={{ fontFamily: "var(--font-display)" }}>$250<span className="text-sm font-normal text-muted-foreground">/week</span></div>
                  </div>
                  <ul className="text-sm space-y-2">
                    {["Real-time Final Expense leads", "Exclusive to your territory", "Pre-screened ages 50–85", "Guaranteed minimum 10 leads/week"].map((f) => (
                      <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-success shrink-0" />{f}</li>
                    ))}
                  </ul>
                  <Button className="w-full">Get Started</Button>
                </div>
              </Panel>
              <Panel>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-bold text-lg">Veteran Lead Package</h3>
                    <div className="tnum font-display font-bold text-gold-bright text-3xl mt-1 leading-none" style={{ fontFamily: "var(--font-display)" }}>$500<span className="text-sm font-normal text-muted-foreground">/week</span></div>
                  </div>
                  <ul className="text-sm space-y-2">
                    {["Real-time veteran & military leads", "Tri-care eligible prospects", "Pre-screened ages 45–80", "Guaranteed minimum 15 leads/week"].map((f) => (
                      <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-success shrink-0" />{f}</li>
                    ))}
                  </ul>
                  <Button className="w-full">Get Started</Button>
                </div>
              </Panel>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Lead packages are billed weekly. Cancel anytime with 7 days notice. Minimum 2-week commitment.</p>
          </TabsContent>

          <TabsContent value="states" className="mt-4">
            <Panel>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">States for Leads</h3>
                    <p className="text-sm text-muted-foreground">Your selected states for receiving leads</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{STATES.length} selected</Badge>
                    <Button variant="outline" size="sm"><Pencil className="h-3 w-3 mr-1" /> Edit</Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {STATES.map((s) => <Badge key={s} className="text-sm">{s}</Badge>)}
                </div>
                <Button className="w-full bg-success hover:bg-success/90" onClick={() => setTab("packages")}>View Lead Packages</Button>
              </div>
            </Panel>
          </TabsContent>

          <TabsContent value="dialer" className="mt-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Panel>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg">Premium Dialer</h3>
                    <Badge className="bg-primary text-gold-foreground"><Zap className="h-3 w-3 mr-1" /> Premium</Badge>
                  </div>
                  <div className="tnum font-display font-bold text-gold-bright text-3xl leading-none" style={{ fontFamily: "var(--font-display)" }}>$1,000<span className="text-sm font-normal text-muted-foreground">/week</span></div>
                  <ul className="text-sm space-y-1.5 text-muted-foreground">
                    <li>✓ Daily Lead Updates</li><li>✓ Integrated CRM + Dialer</li><li>✓ Analytics Dashboard</li>
                    <li>✓ Priority Lead Access</li><li>✓ Exclusive Lead Pool</li><li>✓ Priority Support</li>
                  </ul>
                  <Button className="w-full">Subscribe</Button>
                </div>
              </Panel>
              <Panel>
                <div className="space-y-4">
                  <h3 className="font-bold text-lg">Weekly Dialer</h3>
                  <div className="tnum font-display font-bold text-gold-bright text-3xl leading-none" style={{ fontFamily: "var(--font-display)" }}>$250<span className="text-sm font-normal text-muted-foreground">/week</span></div>
                  <ul className="text-sm space-y-1.5 text-muted-foreground">
                    <li>✓ Integrated CRM + Dialer</li><li>✓ Analytics Dashboard</li><li>✓ Call Recordings</li>
                    <li>✓ Instant Connect</li><li>✓ One-Minute Call Pacing</li><li>✓ Simple Setup</li>
                  </ul>
                  <Button variant="outline" className="w-full">Subscribe</Button>
                </div>
              </Panel>
            </div>
          </TabsContent>

          <TabsContent value="inbound" className="mt-4">
            <Panel>
              <div className="flex flex-col items-center text-center space-y-3 py-4">
                <Zap className="h-10 w-10 text-muted-foreground" />
                <h3 className="font-bold text-xl">Inbound Leads</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Receive inbound calls and web form submissions routed directly to your pipeline. Configure your inbound lead flow and get notified in real time.
                </p>
              </div>
            </Panel>
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  );
}
