import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LifeBuoy, Mail, MessageSquare, Phone, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/account/help")({
  head: () => ({
    meta: [
      { title: "Help Center — Agent Cloud" },
      { name: "description", content: "Get help with Agent Cloud — articles, contact support, and live chat." },
    ],
  }),
  component: HelpPage,
});

const TOPICS = [
  { title: "Getting Started", desc: "Set up your account and complete onboarding", count: 8 },
  { title: "Pipeline & CRM", desc: "Managing leads, stages, and the client drawer", count: 12 },
  { title: "Posting Deals", desc: "Submit policies and track commissions", count: 6 },
  { title: "Contracting", desc: "Carrier requests, transfers, commission grids", count: 10 },
  { title: "Phone & SMS", desc: "Twilio setup, wallet, and dial lists", count: 7 },
  { title: "Sophai AI", desc: "Policy recovery, follow-ups, and birthday outreach", count: 5 },
];

function HelpPage() {
  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><LifeBuoy className="h-7 w-7" /> Help Center</h1>
        <p className="text-muted-foreground mt-1">Search the knowledge base or get in touch with our team.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9 h-11" placeholder="Search articles…" />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TOPICS.map((t) => (
          <Card key={t.title} className="hover:shadow-md transition cursor-pointer">
            <CardContent className="p-5">
              <div className="font-semibold">{t.title}</div>
              <div className="text-sm text-muted-foreground mt-1">{t.desc}</div>
              <div className="text-xs text-muted-foreground mt-3">{t.count} articles</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {[
          { icon: MessageSquare, title: "Live Chat", desc: "Mon–Fri, 8a–6p CT", cta: "Start Chat" },
          { icon: Mail, title: "Email", desc: "support@agentcloud.com", cta: "Email Us" },
          { icon: Phone, title: "Phone", desc: "(800) 555-CLOUD", cta: "Call Support" },
        ].map((c) => (
          <Card key={c.title}>
            <CardContent className="p-5 text-center space-y-2">
              <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center text-primary mx-auto"><c.icon className="h-5 w-5" /></div>
              <div className="font-semibold">{c.title}</div>
              <div className="text-sm text-muted-foreground">{c.desc}</div>
              <Button variant="outline" size="sm" className="w-full">{c.cta}</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
