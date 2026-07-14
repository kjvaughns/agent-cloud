import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Sparkles, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getPolicyAiInsight, type PolicyAiInsight } from "@/lib/ai-features.functions";

export function PolicyAiPanel({ policyId }: { policyId: string }) {
  const [data, setData] = useState<PolicyAiInsight | null>(null);
  const fetchInsight = useServerFn(getPolicyAiInsight);
  const mut = useMutation({
    mutationFn: () => fetchInsight({ data: { policyId } }),
    onSuccess: setData,
    onError: (e: any) => toast.error(e?.message ?? "AI failed"),
  });

  const bandColor =
    data?.lapse_risk.band === "high"
      ? "bg-red-500/10 text-red-700 dark:text-red-400"
      : data?.lapse_risk.band === "medium"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
      : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";

  return (
    <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Insight
        </div>
        <Button size="sm" variant="ghost" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Analyze"}
        </Button>
      </div>
      {data ? (
        <>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium">
                <TrendingDown className="h-3.5 w-3.5" /> Lapse risk
              </span>
              <Badge variant="secondary" className={bandColor}>
                {data.lapse_risk.band} · {data.lapse_risk.score}/100
              </Badge>
            </div>
            <Progress value={data.lapse_risk.score} className="h-1.5" />
            <ul className="text-xs text-muted-foreground space-y-0.5 mt-2">
              {data.lapse_risk.reasons.map((r, i) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>
          </div>
          <div className="border-t pt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Save plan
            </div>
            <ol className="text-sm space-y-1 list-decimal list-inside">
              {data.save_plan.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
          {data.cross_sell?.length > 0 && (
            <div className="border-t pt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> Cross-sell opportunities
              </div>
              <div className="space-y-2">
                {data.cross_sell.map((cs, i) => (
                  <div key={i} className="rounded-md bg-background border p-2.5">
                    <div className="font-medium text-sm">{cs.product}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{cs.rationale}</div>
                    <div className="text-xs italic text-foreground/80 mt-1.5 border-l-2 border-primary/40 pl-2">
                      {cs.talk_track}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-xs text-muted-foreground">
          Analyze this policy for lapse risk, a save plan, and cross-sell suggestions tailored to the client.
        </div>
      )}
    </div>
  );
}
