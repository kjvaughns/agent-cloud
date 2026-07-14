import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMeetingBrief, type MeetingBrief } from "@/lib/ai-features.functions";
import { toast } from "sonner";

export function MeetingBriefPanel({
  clientId,
  eventTitle,
  eventAt,
}: {
  clientId: string;
  eventTitle?: string;
  eventAt?: string;
}) {
  const fn = useServerFn(getMeetingBrief);
  const [brief, setBrief] = useState<MeetingBrief | null>(null);
  const mut = useMutation({
    mutationFn: () => fn({ data: { client_id: clientId, event_title: eventTitle, event_at: eventAt } }),
    onSuccess: (r) => setBrief(r),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!brief) {
    return (
      <Button variant="outline" size="sm" className="w-full" onClick={() => mut.mutate()} disabled={mut.isPending}>
        {mut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
        AI pre-meeting brief
      </Button>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
        <Sparkles className="h-3 w-3" /> Pre-Meeting Brief
      </div>
      <p className="leading-snug">{brief.snapshot}</p>
      <Section title="Key facts" items={brief.key_facts} />
      <Section title="Suggested agenda" items={brief.suggested_agenda} />
      <Section title="Questions to ask" items={brief.questions_to_ask} />
      {brief.watch_outs?.length > 0 && <Section title="Watch-outs" items={brief.watch_outs} accent />}
    </div>
  );
}

function Section({ title, items, accent }: { title: string; items: string[]; accent?: boolean }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className={`text-xs font-medium mb-1 ${accent ? "text-amber-600 dark:text-amber-400" : ""}`}>{title}</div>
      <ul className="list-disc pl-4 space-y-0.5 text-xs">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}
