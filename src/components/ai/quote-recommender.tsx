import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { getQuoteRecommendation, type QuoteRecommendation } from "@/lib/ai-features.functions";
import { toast } from "sonner";

/** Required-field marker. aria-hidden — the hint below the button is the
 *  accessible version, and a screen reader announcing "asterisk" is noise. */
function Req() {
  return <span aria-hidden className="text-destructive">*</span>;
}

export function QuoteRecommender() {
  const fn = useServerFn(getQuoteRecommendation);
  const [age, setAge] = useState("");
  const [state, setState] = useState("");
  const [health, setHealth] = useState<"preferred" | "standard" | "table" | "tobacco" | "uninsurable">("standard");
  const [budget, setBudget] = useState("");
  const [goal, setGoal] = useState("");
  const [result, setResult] = useState<QuoteRecommendation | null>(null);

  /**
   * What is still needed, and why the button is dead.
   *
   * The button was `disabled={mut.isPending || !age || !state || !goal}` with
   * nothing marking those three as required — no asterisk, no helper text, no
   * tooltip. Fill in some of the form, click, nothing happens, no explanation.
   * It reads as broken rather than incomplete.
   *
   * `budget_monthly` was the sharper half: the server's schema requires it, but
   * it was absent from the disable expression — so the button could enable and
   * the request still fail validation. It is required here now, which is the
   * honest version of what the server already believed.
   */
  const missing = [
    !age && "age",
    !state && "state",
    !budget && "monthly budget",
    !goal && "goal",
  ].filter(Boolean) as string[];

  const mut = useMutation({
    mutationFn: () =>
      fn({
        data: {
          age: Number(age),
          state: state.toUpperCase(),
          health,
          budget_monthly: Number(budget),
          goal,
        },
      }),
    onSuccess: setResult,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> AI Product Recommender
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid sm:grid-cols-4 gap-3">
          <div><Label className="text-xs">Age <Req /></Label><Input value={age} onChange={(e) => setAge(e.target.value)} type="number" /></div>
          <div><Label className="text-xs">State <Req /></Label><Input value={state} onChange={(e) => setState(e.target.value)} maxLength={2} placeholder="TX" /></div>
          <div>
            {/* Not required — it defaults to Standard, and the server accepts
                that. Marking it would imply otherwise. */}
            <Label className="text-xs">Health</Label>
            <Select value={health} onValueChange={(v) => setHealth(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="preferred">Preferred</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="table">Table-rated</SelectItem>
                <SelectItem value="tobacco">Tobacco</SelectItem>
                <SelectItem value="uninsurable">Uninsurable</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Budget / mo <Req /></Label><Input value={budget} onChange={(e) => setBudget(e.target.value)} type="number" placeholder="80" /></div>
        </div>
        <div>
          <Label className="text-xs">Goal / situation <Req /></Label>
          <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={2} placeholder="e.g. Cover final expenses for grandkids, smoker, diabetes." />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || missing.length > 0}>
            {mut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Get recommendations
          </Button>
          {missing.length > 0 && (
            <span className="text-xs text-muted-foreground">
              Add {missing.length === 1
                ? missing[0]
                : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`} to continue.
            </span>
          )}
        </div>

        {result && (
          <div className="space-y-3 pt-2">
            <div className="space-y-2">
              {result.recommendations.map((r, i) => (
                <div key={i} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm">{r.carrier} — {r.product}</div>
                    <Badge variant={r.confidence === "high" ? "default" : "secondary"}>{r.confidence}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.why}</p>
                  {(r.est_face_amount || r.est_premium) && (
                    <div className="text-xs">
                      {r.est_face_amount && <span className="mr-3">Face: {r.est_face_amount}</span>}
                      {r.est_premium && <span>Premium: {r.est_premium}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {result.objections?.length > 0 && (
              <div className="rounded-lg border p-3">
                <div className="text-xs font-semibold mb-2 uppercase text-muted-foreground">Likely objections</div>
                <ul className="space-y-2 text-xs">
                  {result.objections.map((o, i) => (
                    <li key={i}><span className="font-medium">{o.objection}</span><div className="text-muted-foreground">{o.response}</div></li>
                  ))}
                </ul>
              </div>
            )}
            {result.notes && <p className="text-xs text-muted-foreground italic">{result.notes}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
