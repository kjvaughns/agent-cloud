import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/back-office/advanced-desk")({
  head: () => ({
    meta: [
      { title: "Advanced Desk — Agent Cloud" },
      { name: "description", content: "Concierge support from senior agents and case managers." },
    ],
  }),
  component: AdvancedDeskPage,
});

const THREAD = [
  { who: "You", initials: "ME", text: "Client wants $500k Term with conversion option — best carrier under 45 prefn?", time: "9:12 AM" },
  { who: "Desk · Priya", initials: "PR", text: "Look at Mutual of Omaha Term Life Express — conversion to any permanent in their portfolio, no exam under $400k.", time: "9:18 AM" },
  { who: "You", initials: "ME", text: "He's 47, mild hypertension controlled. Standard plus realistic?", time: "9:22 AM" },
  { who: "Desk · Priya", initials: "PR", text: "Standard plus is achievable with BP under 140/90 and labs clean. Quote both Standard and Standard Plus to set expectations.", time: "9:24 AM" },
];

function AdvancedDeskPage() {
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1">
        <CardHeader><CardTitle>New request</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Topic (e.g. underwriting, illustration)" />
          <Textarea rows={6} placeholder="Describe your case or question…" />
          <Button className="w-full">Send to Desk</Button>
          <p className="text-xs text-muted-foreground">Avg response: 14 minutes during business hours.</p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Thread · Term conversion options</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {THREAD.map((m, i) => (
            <div key={i} className="flex gap-3">
              <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{m.initials}</AvatarFallback></Avatar>
              <div className="flex-1">
                <div className="text-sm"><span className="font-medium">{m.who}</span> <span className="text-muted-foreground ml-2 text-xs">{m.time}</span></div>
                <div className="text-sm mt-1 leading-relaxed">{m.text}</div>
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-2 border-t">
            <Input placeholder="Reply…" />
            <Button>Send</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
