import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Megaphone, Pin, Calendar } from "lucide-react";

export const Route = createFileRoute("/_authenticated/announcements")({
  component: AnnouncementsPage,
});

const ANNOUNCEMENTS = [
  { id: 1, title: "Q3 Bonus Program Launch", body: "Earn an extra 5% override on all new IUL placements through September. Top 10 producers get a paid trip to Cabo.", author: "Leadership", date: "2 days ago", pinned: true, tag: "Incentive" },
  { id: 2, title: "New Carrier: Aegis Life Onboarded", body: "Aegis is now live in our system. Competitive IUL rates and 110% comp at A-level. Contract via the Contracting tab.", author: "Carrier Relations", date: "5 days ago", pinned: true, tag: "Carrier" },
  { id: 3, title: "Annual Convention — Registration Open", body: "March 14-17 in Nashville. Early bird pricing ends Dec 1.", author: "Events", date: "1 week ago", pinned: false, tag: "Event" },
  { id: 4, title: "Compliance Update: Annuity Suitability", body: "New best-interest disclosure required for all annuity sales starting Nov 1. Updated forms in Resources.", author: "Compliance", date: "2 weeks ago", pinned: false, tag: "Compliance" },
  { id: 5, title: "Sophai 2.0 Released", body: "Smarter call summaries, lead scoring, and automatic follow-up drafting. Try it in the AI Assistant tab.", author: "Product", date: "3 weeks ago", pinned: false, tag: "Product" },
];

function AnnouncementsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Megaphone className="h-7 w-7" /> Announcements</h1>
          <p className="text-muted-foreground mt-1">Agency news, incentives, and important updates.</p>
        </div>
        <Button>New Announcement</Button>
      </div>

      <div className="space-y-4">
        {ANNOUNCEMENTS.map((a) => (
          <Card key={a.id} className={a.pinned ? "border-primary/50" : ""}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2">
                    {a.pinned && <Pin className="h-4 w-4 text-primary" />}
                    {a.title}
                  </CardTitle>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                    <span>{a.author}</span>
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{a.date}</span>
                  </div>
                </div>
                <Badge variant="secondary">{a.tag}</Badge>
              </div>
            </CardHeader>
            <CardContent><p className="text-sm">{a.body}</p></CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
