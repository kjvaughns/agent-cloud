import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, AlertTriangle, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { getDailyBriefing } from "@/lib/ai-features.functions";

export function AiDailyBriefing() {
  const fetchBriefing = useServerFn(getDailyBriefing);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["ai-daily-briefing"],
    queryFn: () => fetchBriefing(),
    staleTime: 1000 * 60 * 60, // 1 hour
    retry: false,
  });

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Briefing
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-7 text-xs"
        >
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : isError ? (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Couldn't load your briefing — try again in a moment.</span>
          </div>
        ) : data ? (
          <>
            <p className="font-medium text-foreground">{data.briefing.headline}</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {data.briefing.bullets.map((b, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            {data.briefing.next_actions?.length > 0 && (
              <div className="border-t pt-3 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Next best actions
                </div>
                {data.briefing.next_actions.map((a, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-sm rounded-md p-2 -mx-2 hover:bg-muted/50"
                  >
                    <ChevronRight className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium">{a.title}</div>
                      <div className="text-xs text-muted-foreground">{a.reason}</div>
                    </div>
                    <Badge
                      variant="secondary"
                      className={
                        a.priority === "high"
                          ? "bg-red-500/10 text-red-700 dark:text-red-400"
                          : a.priority === "medium"
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {a.priority}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
