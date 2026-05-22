import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { CARRIERS } from "@/lib/mock-data";
import { CheckCircle2, Clock, XCircle, FileText, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contracting/")({
  component: ContractingHome,
});

type Status = "appointed" | "in_progress" | "requested" | "rejected" | "needs_action";
const STATUS_META: Record<Status, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  appointed:    { label: "Appointed",    cls: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30", icon: CheckCircle2 },
  in_progress:  { label: "In Progress",  cls: "bg-blue-500/15 text-blue-600 border-blue-500/30",         icon: Clock },
  requested:    { label: "Requested",    cls: "bg-slate-500/15 text-slate-600 border-slate-500/30",      icon: Clock },
  rejected:     { label: "Rejected",     cls: "bg-rose-500/15 text-rose-600 border-rose-500/30",         icon: XCircle },
  needs_action: { label: "Needs Action", cls: "bg-amber-500/15 text-amber-600 border-amber-500/30",      icon: AlertCircle },
};

const MY_CONTRACTS = CARRIERS.slice(0, 7).map((name, i) => ({
  name,
  status: (["appointed","appointed","in_progress","needs_action","requested","appointed","rejected"] as Status[])[i],
  level: ["110%","115%","Pending","—","Pending","105%","—"][i],
  writing: i < 3 ? `WN-${10000 + i * 137}` : "—",
  product: ["Term/WL","Final Expense","IUL","Term","Annuity","Whole Life","Final Expense"][i],
}));

function ContractingHome() {
  return (
    <div className="p-6">
      <Tabs defaultValue="my">
        <TabsList>
          <TabsTrigger value="my">My Contracts</TabsTrigger>
          <TabsTrigger value="downline">Downline</TabsTrigger>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
        </TabsList>

        <TabsContent value="my" className="mt-4">
          <Accordion type="multiple" className="space-y-2">
            {MY_CONTRACTS.map((c) => {
              const meta = STATUS_META[c.status];
              const Icon = meta.icon;
              return (
                <Card key={c.name}>
                  <AccordionItem value={c.name} className="border-0">
                    <AccordionTrigger className="px-4 hover:no-underline">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 grid place-items-center text-primary font-bold text-sm">
                          {c.name.split(" ").map((w) => w[0]).join("").slice(0,2)}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="font-semibold">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.product} · Writing # {c.writing}</div>
                        </div>
                        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium mr-3", meta.cls)}>
                          <Icon className="h-3 w-3" />{meta.label}
                        </span>
                        <span className="text-sm font-mono mr-3">{c.level}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="grid md:grid-cols-3 gap-3 text-sm">
                        <Detail label="Submitted" value="May 12, 2026" />
                        <Detail label="Activated" value={c.status === "appointed" ? "May 18, 2026" : "—"} />
                        <Detail label="Pay frequency" value="Weekly" />
                        <Detail label="Advance cap" value="9 month" />
                        <Detail label="Portal" value="surepath.example.com" />
                        <Detail label="Support" value="(800) 555-0144" />
                      </div>
                      <div className="flex gap-2 mt-4">
                        <Button size="sm" variant="outline"><FileText className="h-4 w-4" /> View packet</Button>
                        <Button size="sm" variant="outline">Open portal</Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Card>
              );
            })}
          </Accordion>
        </TabsContent>

        <TabsContent value="downline" className="mt-4">
          <Card><CardContent className="p-0">
            <div className="divide-y">
              {[
                { agent: "Sarah Lee", carrier: "Mutual of Omaha", status: "appointed" as Status, date: "May 14" },
                { agent: "Marcus Reed", carrier: "Americo", status: "in_progress" as Status, date: "May 16" },
                { agent: "Priya Shah", carrier: "Aetna", status: "needs_action" as Status, date: "May 18" },
                { agent: "Diego Alvarez", carrier: "Foresters", status: "appointed" as Status, date: "May 11" },
              ].map((r, i) => {
                const m = STATUS_META[r.status];
                return (
                  <div key={i} className="flex items-center gap-3 p-4">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{r.agent}</div>
                      <div className="text-xs text-muted-foreground">{r.carrier} · submitted {r.date}</div>
                    </div>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full border", m.cls)}>{m.label}</span>
                  </div>
                );
              })}
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="inbox" className="mt-4">
          <Card><CardContent className="p-0">
            <div className="divide-y">
              {[
                { from: "Mutual of Omaha", subj: "E&O certificate required", time: "2h ago" },
                { from: "Aetna", subj: "Welcome packet — log in to activate", time: "Yesterday" },
                { from: "Foresters", subj: "Background check approved", time: "3d ago" },
              ].map((m, i) => (
                <div key={i} className="flex items-center gap-3 p-4 hover:bg-muted/40 cursor-pointer">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 grid place-items-center"><FileText className="h-4 w-4 text-primary" /></div>
                  <div className="flex-1">
                    <div className="font-medium text-sm">{m.from}</div>
                    <div className="text-xs text-muted-foreground">{m.subj}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{m.time}</div>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium">{value}</div></div>
  );
}
