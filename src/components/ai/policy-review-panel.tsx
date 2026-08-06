/**
 * Annual review prep for one client.
 *
 * Every line here is a line an agent reads out loud to somebody, which is why
 * the gaps are computed rather than generated: a coverage shortfall that comes
 * out differently on two runs is a number nobody can defend across a table.
 *
 * The income box is the honest part of the design. `clients` has no income
 * column — the migration template asks for "Monthly Income" and the importer
 * appends it to a notes string — so rather than parse a number back out of
 * prose, the agent is asked, and the needs calculation is simply absent until
 * they answer. Absent, not zero: a zero would read as "they need no cover".
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { ClipboardCheck, Loader2, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { getPolicyReviewPrep } from "@/lib/ai-features.functions";

const TONE = {
  high: "border-destructive/40 bg-destructive/5",
  medium: "border-warning/40 bg-warning/5",
  low: "border-border bg-surface-2",
} as const;

export function PolicyReviewPanel({ clientId }: { clientId: string }) {
  const [income, setIncome] = useState("");
  const [data, setData] = useState<any>(null);
  const prepFn = useServerFn(getPolicyReviewPrep);

  const mut = useMutation({
    mutationFn: () => {
      const n = Number(income.replace(/[$,\s]/g, ""));
      return prepFn({
        data: {
          clientId,
          statedAnnualIncome: Number.isFinite(n) && n > 0 ? n : null,
        },
      });
    },
    onSuccess: setData,
    onError: (e: any) => toast.error(e?.message ?? "Couldn't prepare the review"),
  });

  const gaps = (data?.gaps ?? []) as any[];

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-2/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ClipboardCheck className="h-4 w-4 text-primary" />
          Review prep
        </div>
        <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Prepare"}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={income}
          onChange={(e) => setIncome(e.target.value)}
          placeholder="Annual income (optional)"
          inputMode="numeric"
          className="h-8 text-sm"
        />
      </div>
      <p className="text-[11px] text-muted-foreground -mt-1">
        We don't store income, so the coverage-gap check only runs when you type it here.
      </p>

      {data && (
        <div className="space-y-2 pt-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              <span className="tnum font-medium text-foreground">{data.policyCount}</span> in force
            </span>
            <span>
              <span className="tnum font-medium text-foreground">{money(data.inForceFace)}</span> total cover
            </span>
            {data.needs && (
              <span>
                guideline <span className="tnum font-medium text-foreground">{money(data.needs.recommended)}</span>
              </span>
            )}
          </div>

          {gaps.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No gaps found. Worth confirming the beneficiary and the carrier's current address anyway.
            </p>
          ) : (
            gaps.map((g) => (
              <div key={g.id} className={cn("rounded-[var(--radius)] border p-2.5", TONE[g.severity as keyof typeof TONE])}>
                <div className="flex items-start gap-2">
                  {g.severity === "high"
                    ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-destructive" />
                    : <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />}
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm font-medium">{g.headline}</div>
                    <div className="text-xs text-muted-foreground">{g.detail}</div>
                    {/* What to actually say. A gap without this is a fact the
                        agent still has to turn into a conversation. */}
                    <div className="text-xs">{g.agenda}</div>
                  </div>
                </div>
              </div>
            ))
          )}

          {/* What the review could not look at, named rather than implied. */}
          {(data.missingInputs ?? []).length > 0 && (
            <div className="pt-1 space-y-1">
              {(data.missingInputs as any[]).map((m) => (
                <p key={m.input} className="text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="mr-1.5 text-[10px]">{m.input}</Badge>
                  {m.why}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
