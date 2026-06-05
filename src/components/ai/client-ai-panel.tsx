import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Copy, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getClientAiSuggestions, type ClientAiSuggestions } from "@/lib/ai-features.functions";

export function ClientAiPanel({ clientId }: { clientId: string }) {
  const [data, setData] = useState<ClientAiSuggestions | null>(null);
  const fetchSuggestions = useServerFn(getClientAiSuggestions);
  const mut = useMutation({
    mutationFn: () => fetchSuggestions({ data: { clientId } }),
    onSuccess: setData,
    onError: (e: any) => toast.error(e?.message ?? "AI failed"),
  });

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Coach
        </div>
        <Button size="sm" variant="ghost" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Generate"}
        </Button>
      </div>
      {data ? (
        <>
          <div className="text-sm text-muted-foreground">{data.summary}</div>
          {data.stall_warning && (
            <div className="flex gap-2 text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 rounded p-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {data.stall_warning}
            </div>
          )}
          <div className="space-y-2">
            {data.messages?.map((m, i) => (
              <div key={i} className="rounded-md bg-background border p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {m.channel}
                  </Badge>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copy(m.body)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                {m.subject && <div className="text-xs font-medium">{m.subject}</div>}
                <div className="text-sm whitespace-pre-wrap">{m.body}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-xs text-muted-foreground">
          Click Generate for an AI summary, stall check, and three drafted messages tailored to this client.
        </div>
      )}
    </div>
  );
}
