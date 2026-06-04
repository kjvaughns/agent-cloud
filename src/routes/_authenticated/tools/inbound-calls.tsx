import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, PhoneIncoming } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tools/inbound-calls")({
  head: () => ({
    meta: [
      { title: "Inbound Calls — Agent Cloud" },
      { name: "description", content: "Have qualified life insurance prospects call you." },
    ],
  }),
  component: InboundCallsPage,
});

const FEATURES = [
  "Online/Offline status toggle",
  "Pay only for billable calls",
  "TCPA compliant",
  "Customizable campaigns",
  "Agency leaderboard",
];

function InboundCallsPage() {
  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2"><PhoneIncoming className="h-7 w-7" /> Inbound Calls</h1>
        <p className="text-muted-foreground mt-1">Have qualified life insurance prospects call you.</p>
      </div>
      <Card>
        <CardContent className="p-8 space-y-6">
          <p className="text-muted-foreground">Stop making cold calls. Get inbound calls from prospects who are actively looking for life insurance coverage.</p>
          <ul className="space-y-2">
            {FEATURES.map((f) => <li key={f} className="flex items-center gap-2 text-sm"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> {f}</li>)}
          </ul>
          <Button size="lg" className="w-full" asChild>
            <a href="https://www.fexcalls.com" target="_blank" rel="noreferrer">Go to Inbound Calls Platform <ExternalLink className="h-4 w-4 ml-2" /></a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
