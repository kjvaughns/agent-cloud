import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/page-shell";
import { PhoneCall, MessageSquare, Cake, Users, Sparkles, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { generateNovaDrafts, type NovaDraft } from "@/lib/ai-features.functions";

export const Route = createFileRoute("/_authenticated/nova/activity")({
  head: () => ({
    meta: [
      { title: "Nova Activity — Agent Cloud" },
      { name: "description", content: "AI-drafted outreach to your clients — review and send." },
    ],
  }),
  component: NovaActivityPage,
});

type T = "recovery" | "sms" | "birthday" | "beneficiary";
const ICONS: Record<T, React.ComponentType<{ className?: string }>> = { recovery: PhoneCall, sms: MessageSquare, birthday: Cake, beneficiary: Users };
const LABEL: Record<T, string> = { recovery: "Policy Recovery", sms: "SMS Follow-up", birthday: "Birthday", beneficiary: "Beneficiary" };

function NovaActivityPage() {
  const [kind, setKind] = useState<T>("sms");
  const [drafts, setDrafts] = useState<NovaDraft[]>([]);
  const gen = useServerFn(generateNovaDrafts);
  const mut = useMutation({
    mutationFn: (k: T) => gen({ data: { kind: k, limit: 8 } }),
    onSuccess: (d) => {
      setDrafts(d.drafts);
      if (!d.drafts.length) toast.info("No matching clients right now.");
    },
    onError: (e: any) => toast.error(e?.message ?? "AI failed"),
  });

  const copy = (t: string) => {
    navigator.clipboard.writeText(t);
    toast.success("Copied");
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(LABEL) as T[]).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={kind === k ? "default" : "outline"}
            onClick={() => {
              setKind(k);
              mut.mutate(k);
            }}
          >
            {LABEL[k]}
          </Button>
        ))}
      </div>

      <Panel pad={false}>
        <div className="flex flex-row items-center justify-between p-[var(--pad)] border-b border-border">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-gold-bright" />
            AI-drafted outreach
          </h2>
          <Button size="sm" onClick={() => mut.mutate(kind)} disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
            Generate {LABEL[kind]}
          </Button>
        </div>
        <div className="divide-y divide-border">
          {drafts.length === 0 && !mut.isPending && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Pick an automation above and click Generate to draft personalized messages for your matching clients.
            </div>
          )}
          {drafts.map((d, i) => {
            const Icon = ICONS[d.kind];
            return (
              <div key={i} className="p-4 flex items-start gap-3 transition hover:bg-surface-2">
                <div className="h-9 w-9 rounded-full bg-gold-glow grid place-items-center text-gold-bright shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{d.client_name}</div>
                    <Badge variant="outline" className="text-[10px] uppercase">{d.channel}</Badge>
                  </div>
                  <div className="text-sm mt-1 whitespace-pre-wrap">{d.body}</div>
                  <div className="text-xs text-muted-foreground mt-1.5 italic">{d.rationale}</div>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(d.body)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
