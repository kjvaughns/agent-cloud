import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Loader2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { askKnowledgeBase, type KbAnswer } from "@/lib/ai-features.functions";

export function AiHelpSearch() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<KbAnswer | null>(null);
  const ask = useServerFn(askKnowledgeBase);
  const mut = useMutation({
    mutationFn: (question: string) => ask({ data: { question } }),
    onSuccess: setAnswer,
    onError: (e: any) => toast.error(e?.message ?? "AI failed"),
  });

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          Ask AI — searches the handbook, FAQ, scripts, and academy
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim().length >= 3) mut.mutate(q.trim());
          }}
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. How do I post a deal? How does the wallet work?"
          />
          <Button type="submit" disabled={mut.isPending || q.trim().length < 3}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
          </Button>
        </form>
        {answer && (
          <div className="rounded-md bg-background border p-3 space-y-2">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{answer.answer}</ReactMarkdown>
            </div>
            {answer.sources?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2 border-t">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <BookOpen className="h-3 w-3" /> Sources:
                </span>
                {answer.sources.map((s, i) => (
                  <Badge key={i} variant="outline" className="text-xs font-normal">
                    {s.source}: {s.title}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
