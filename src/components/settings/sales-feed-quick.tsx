/**
 * Sales feed, simple view: paste a Discord link, send a test, pick a style.
 * Multiple bots, thresholds and event choices stay under "Advanced".
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useServerFn } from "@/hooks/use-server-fn";
import { getDiscordSettings, saveDiscordSettings, sendDiscordTest } from "@/lib/discord.functions";
import { DEAL_STYLES, DEAL_STYLE_LABEL, asDealStyle, type DealStyle } from "@/lib/discord/deal-style";

export function SalesFeedQuick() {
  const qc = useQueryClient();
  const getFn = useServerFn(getDiscordSettings);
  const saveFn = useServerFn(saveDiscordSettings);
  const testFn = useServerFn(sendDiscordTest);
  const { data, isLoading } = useQuery({ queryKey: ["discord"], queryFn: () => getFn() });
  const hooks = ((data as any)?.webhooks ?? []) as any[];
  const feed = hooks.find((w) => w.post_deals) ?? null;
  const [url, setUrl] = useState("");
  const [style, setStyle] = useState<DealStyle | null>(null);
  const current = style ?? asDealStyle(feed?.message_style);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["discord"] });
    qc.invalidateQueries({ queryKey: ["settings", "agency-setup-progress"] });
  };

  const connect = useMutation({
    mutationFn: async () => {
      const link = url.trim();
      if (!/^https:\/\/(\w+\.)?discord(app)?\.com\/api\/webhooks\//.test(link)) throw new Error("That doesn't look like a Discord webhook link.");
      const r: any = await saveFn({ data: {
        name: "Sales feed", webhook_url: link, enabled: true, post_deals: true,
        post_announcements: false, post_new_agents: false, min_annual_premium: 0, message_style: current,
      } as any });
      const id = r?.id ?? r?.webhook?.id;
      if (id) await testFn({ data: { id } });
      return Boolean(id);
    },
    onSuccess: (tested) => { toast.success(tested ? "Connected — check Discord for the test post." : "Connected."); setUrl(""); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't connect"),
  });

  const test = useMutation({
    mutationFn: () => testFn({ data: { id: feed.id } }),
    onSuccess: () => { toast.success("Test sent — check your channel"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Discord rejected the message"),
  });

  const pick = useMutation({
    mutationFn: (s: DealStyle) => saveFn({ data: { id: feed.id, message_style: s } as any }),
    onSuccess: () => { toast.success("Style saved"); refresh(); },
    onError: (e: any) => { setStyle(null); toast.error(e?.message ?? "Couldn't save"); },
  });

  if (isLoading) return <Skeleton className="h-48 rounded-2xl" />;
  if (!(data as any)?.isOwner) return <p className="text-sm text-muted-foreground">Only the agency owner can connect the sales feed.</p>;

  const step = (n: number, done: boolean, title: string) => (
    <div className="flex items-center gap-2">
      <span className={cn("grid h-6 w-6 place-items-center rounded-full text-xs font-semibold", done ? "bg-success/15 text-success" : "bg-primary/15 text-primary")}>
        {done ? <Check className="h-3.5 w-3.5" /> : n}
      </span>
      <p className="text-sm font-semibold">{title}</p>
    </div>
  );

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card p-5">
      <div className="space-y-2">
        {step(1, Boolean(feed), "Paste your Discord link")}
        {feed ? (
          <p className="pl-8 font-mono text-xs text-muted-foreground">{feed.webhook_masked}</p>
        ) : (
          <div className="flex flex-col gap-2 pl-8 sm:flex-row">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://discord.com/api/webhooks/…" className="min-w-0" />
            <Button variant="ink" className="shrink-0 rounded-full" disabled={!url.trim() || connect.isPending} onClick={() => connect.mutate()}>
              {connect.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Connect & test
            </Button>
          </div>
        )}
        {!feed && <p className="pl-8 text-[11px] text-muted-foreground">In Discord: channel settings → Integrations → Webhooks → Copy URL.</p>}
      </div>

      <div className="space-y-2">
        {step(2, Boolean(feed?.last_success_at), "Send a test")}
        <div className="pl-8">
          <Button size="sm" variant="outline" className="rounded-full" disabled={!feed || test.isPending} onClick={() => test.mutate()}>
            {test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send test
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {step(3, Boolean(feed), "Pick a message style")}
        <div className="grid gap-2 pl-8 sm:grid-cols-3">
          {DEAL_STYLES.map((s) => (
            <button key={s} type="button" aria-pressed={current === s}
              onClick={() => { setStyle(s); if (feed) pick.mutate(s); }}
              className={cn("rounded-xl border p-3 text-left transition-colors", current === s ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}>
              <p className="text-sm font-medium">{DEAL_STYLE_LABEL[s].label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{DEAL_STYLE_LABEL[s].sample}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
