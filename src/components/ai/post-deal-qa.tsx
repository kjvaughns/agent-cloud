import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Sparkles, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reviewPostDeal, type PostDealQa } from "@/lib/ai-features.functions";
import { toast } from "sonner";

type QaPayload = {
  client: { first_name: string; last_name: string; phone?: string; date_of_birth?: string };
  policy: { carrier_name?: string; product?: string; policy_number?: string; effective_date?: string; face_amount: number; monthly_premium: number };
  beneficiaries: { first_name: string; last_name: string; relationship: string; percentage: number }[];
  notes?: string;
};

export function PostDealQaButton({ buildPayload }: { buildPayload: () => QaPayload | null }) {
  const fn = useServerFn(reviewPostDeal);
  const [result, setResult] = useState<PostDealQa | null>(null);
  const mut = useMutation({
    mutationFn: (payload: any) => fn({ data: payload }),
    onSuccess: setResult,
    onError: (e: Error) => toast.error(e.message),
  });

  const onClick = () => {
    const p = buildPayload();
    if (!p) {
      toast.error("Fill in carrier, product, and premium first.");
      return;
    }
    mut.mutate(p);
  };

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" onClick={onClick} disabled={mut.isPending}>
        {mut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
        AI review before submit
      </Button>
      {result && (
        <div className="rounded-lg border p-3 text-sm space-y-2">
          <div className={`flex items-center gap-2 font-medium ${result.ready_to_submit ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
            {result.ready_to_submit ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {result.ready_to_submit ? "Looks ready to submit." : "Issues to address before submitting."}
          </div>
          {result.issues?.length > 0 && (
            <ul className="space-y-1.5">
              {result.issues.map((iss, i) => (
                <li key={i} className="text-xs">
                  <span className={`font-semibold ${iss.severity === "high" ? "text-destructive" : iss.severity === "medium" ? "text-amber-600" : ""}`}>
                    [{iss.severity}] {iss.field}:
                  </span>{" "}
                  {iss.problem} — <span className="text-muted-foreground">{iss.fix}</span>
                </li>
              ))}
            </ul>
          )}
          {result.suggestions?.length > 0 && (
            <div>
              <div className="text-xs font-medium mt-2 mb-1">Suggestions</div>
              <ul className="list-disc pl-4 text-xs space-y-0.5">
                {result.suggestions.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
