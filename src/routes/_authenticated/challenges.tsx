import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Trophy, Target } from "lucide-react";

export const Route = createFileRoute("/_authenticated/challenges")({
  head: () => ({
    meta: [
      { title: "Challenges — Agent Cloud" },
      { name: "description", content: "Daily, weekly, monthly, and quarterly sales challenges. Earn trophies as you crush goals." },
    ],
  }),
  component: ChallengesPage,
});

const TROPHIES = [
  { name: "First Deal", date: "Feb 12" },
  { name: "10 Policies Month", date: "Mar 30" },
  { name: "Q1 Top 50", date: "Apr 02" },
  { name: "Recruit a Producer", date: "Apr 18" },
  { name: "Persistency 90%", date: "May 05" },
];

const CHALLENGES = [
  { period: "Daily", type: "Dials", target: 60, current: 42, desc: "Hit 60 outbound dials today." },
  { period: "Daily", type: "Appointments", target: 3, current: 2, desc: "Book 3 appointments by EOD." },
  { period: "Weekly", type: "Submitted Premium", target: 5000, current: 3420, desc: "Submit $5k AP this week.", isMoney: true },
  { period: "Weekly", type: "New Pipeline", target: 25, current: 18, desc: "Add 25 leads to your pipeline." },
  { period: "Monthly", type: "Issued Policies", target: 15, current: 11, desc: "Issue 15 policies this month." },
  { period: "Quarterly", type: "Production", target: 75000, current: 41200, desc: "Hit $75k AP for Q2.", isMoney: true },
];

function ChallengesPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Target className="h-7 w-7 text-primary" /> Challenges & Trophies</h1>
        <p className="text-muted-foreground mt-1">Goals reset on their period. Trophies stay forever.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-warning" /> Trophy case</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {TROPHIES.map((t) => (
              <div key={t.name} className="shrink-0 w-32 text-center border rounded-xl p-3 bg-gradient-to-b from-warning/10 to-transparent">
                <Trophy className="h-8 w-8 mx-auto text-warning" />
                <div className="font-medium text-sm mt-2">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.date}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CHALLENGES.map((c, i) => {
          const pct = Math.min(100, Math.round((c.current / c.target) * 100));
          const fmt = (n: number) => c.isMoney ? `$${n.toLocaleString()}` : n.toLocaleString();
          return (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{c.type}</CardTitle>
                  <Badge variant="outline">{c.period}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{c.desc}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-end justify-between">
                  <div className="text-2xl font-bold">{fmt(c.current)}</div>
                  <div className="text-sm text-muted-foreground">of {fmt(c.target)}</div>
                </div>
                <Progress value={pct} />
                <div className="text-xs text-muted-foreground">{pct}% complete</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
