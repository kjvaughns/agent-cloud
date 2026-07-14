import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Target } from "lucide-react";
import { getChallenges, getTrophies, type Challenge, type Trophy as TrophyType } from "@/lib/analytics.functions";

export const Route = createFileRoute("/_authenticated/challenges")({
  head: () => ({
    meta: [
      { title: "Challenges — Agent Cloud" },
      { name: "description", content: "Daily, weekly, monthly, and quarterly sales challenges. Earn trophies as you crush goals." },
    ],
  }),
  component: ChallengesPage,
});

const PERIOD_ORDER: Record<string, number> = { daily: 0, weekly: 1, monthly: 2, quarterly: 3 };

function ChallengesPage() {
  const getChallengesFn = useServerFn(getChallenges);
  const getTrophiesFn = useServerFn(getTrophies);

  const { data: challenges, isLoading: loadingChallenges } = useQuery({
    queryKey: ["challenges"],
    queryFn: () => getChallengesFn(),
  });

  const { data: trophies, isLoading: loadingTrophies } = useQuery({
    queryKey: ["trophies"],
    queryFn: () => getTrophiesFn(),
  });

  const sortedChallenges = [...(challenges ?? [])].sort(
    (a, b) => (PERIOD_ORDER[a.period ?? ""] ?? 99) - (PERIOD_ORDER[b.period ?? ""] ?? 99)
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Target className="h-7 w-7 text-primary" /> Challenges &amp; Trophies</h1>
        <p className="text-muted-foreground mt-1">Goals reset on their period. Trophies stay forever.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-warning" /> Trophy case</CardTitle></CardHeader>
        <CardContent>
          {loadingTrophies ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="shrink-0 h-24 w-32 rounded-xl" />)}
            </div>
          ) : (trophies ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No trophies yet — complete challenges to earn them!</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {(trophies as TrophyType[]).map((t) => (
                <div key={t.id} className="shrink-0 w-32 text-center border rounded-xl p-3 bg-gradient-to-b from-warning/10 to-transparent">
                  <Trophy className="h-8 w-8 mx-auto text-warning" />
                  <div className="font-medium text-sm mt-2">{t.type}</div>
                  <div className="text-xs text-muted-foreground">{t.earned_at ? new Date(t.earned_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {loadingChallenges ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : sortedChallenges.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No active challenges right now. Check back tomorrow!
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedChallenges.map((c: Challenge) => {
            const pct = Math.min(100, Math.round(((c.current_value ?? 0) / (c.target_value ?? 1)) * 100));
            const isMoney = (c.type ?? "").toLowerCase().includes("premium") || (c.type ?? "").toLowerCase().includes("production");
            const fmt = (n: number) => isMoney ? `$${n.toLocaleString()}` : n.toLocaleString();
            return (
              <Card key={c.id} className={c.completed ? "border-success/40 bg-success/5" : ""}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{c.type}</CardTitle>
                    <Badge variant="outline" className="capitalize">{c.period}</Badge>
                  </div>
                  {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-end justify-between">
                    <div className="text-2xl font-bold">{fmt(c.current_value ?? 0)}</div>
                    <div className="text-sm text-muted-foreground">of {fmt(c.target_value ?? 0)}</div>
                  </div>
                  <Progress value={pct} />
                  <div className="text-xs text-muted-foreground">{pct}% complete{c.completed && " ✓"}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
