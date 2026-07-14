import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Sparkles, Send, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askAiAssistant } from "@/lib/ai-assistant.functions";
import { cn } from "@/lib/utils";

type SuggestedAction = { label: string; onClick: () => void };

/**
 * Nova — the ambient AI assistant block for the context rail.
 * Renders an optional page-contextual insight, suggested actions,
 * and an ask box wired to the existing askAiAssistant server fn.
 */
export function NovaRail({
  insight,
  actions,
  context,
}: {
  insight?: string;
  actions?: SuggestedAction[];
  context?: string;
}) {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const askFn = useServerFn(askAiAssistant);

  const ask = useMutation({
    mutationFn: (question: string) =>
      askFn({
        data: {
          messages: [
            ...(context ? [{ role: "user" as const, content: `Context: ${context}` }] : []),
            { role: "user" as const, content: question },
          ],
        },
      }),
    onSuccess: (res: any) => setAnswer(res?.reply ?? ""),
  });

  const submit = () => {
    const question = q.trim();
    if (!question) return;
    setAnswer(null);
    ask.mutate(question);
    setQ("");
  };

  return (
    <div className="rounded-[var(--radius)] border border-primary/25 bg-gradient-to-br from-primary/[0.06] to-transparent p-pad">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-6 w-6 rounded-md bg-primary/15 grid place-items-center">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="font-display font-semibold text-sm" style={{ fontFamily: "var(--font-display)" }}>Nova</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-text-dim ml-auto">AI Assistant</span>
      </div>

      {insight && <p className="text-sm text-muted-foreground mb-3">{insight}</p>}

      {actions && actions.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={a.onClick}
              className="w-full flex items-center gap-2 text-left text-sm rounded-lg border border-border bg-surface-2 px-3 py-2 hover:border-primary/40 transition-colors"
            >
              <span className="flex-1 min-w-0 truncate">{a.label}</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}

      {answer !== null && (
        <div className="text-sm text-foreground whitespace-pre-wrap rounded-lg bg-surface-2 border border-border p-3 mb-3">
          {ask.isPending ? "Thinking…" : answer || "No answer."}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Ask Nova anything…"
          className="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/50 transition-colors"
        />
        <Button size="icon" className="h-9 w-9 shrink-0" onClick={submit} disabled={ask.isPending || !q.trim()} aria-label="Ask">
          <Send className={cn("h-4 w-4", ask.isPending && "opacity-50")} />
        </Button>
      </div>
    </div>
  );
}
