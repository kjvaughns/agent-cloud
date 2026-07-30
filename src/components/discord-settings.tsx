import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Send, Trash2, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getDiscordSettings, saveDiscordSettings, disconnectDiscord,
  sendDiscordTest, listDiscordDeliveries,
} from "@/lib/discord.functions";

/**
 * Discord sales bot settings. Owner-only — the webhook URL is a credential,
 * and the server never returns it in full, only a masked form.
 */
export function DiscordSettings() {
  const qc = useQueryClient();
  const getFn = useServerFn(getDiscordSettings);
  const saveFn = useServerFn(saveDiscordSettings);
  const testFn = useServerFn(sendDiscordTest);
  const dropFn = useServerFn(disconnectDiscord);
  const logFn = useServerFn(listDiscordDeliveries);

  const { data, isLoading } = useQuery({ queryKey: ["discord"], queryFn: () => getFn() });
  const { data: log } = useQuery({ queryKey: ["discord", "log"], queryFn: () => logFn() });

  const s = (data as any)?.settings;
  const isOwner = Boolean((data as any)?.isOwner);

  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [minPremium, setMinPremium] = useState("0");

  useEffect(() => {
    if (!s) return;
    setLabel(s.channel_label ?? "");
    setMinPremium(String(s.min_annual_premium ?? 0));
  }, [s]);

  const save = useMutation({
    mutationFn: (patch: any) => saveFn({ data: patch }),
    onSuccess: () => { toast.success("Saved"); setUrl(""); qc.invalidateQueries({ queryKey: ["discord"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't save"),
  });

  const test = useMutation({
    mutationFn: () => testFn(),
    onSuccess: () => { toast.success("Test message sent — check your channel"); qc.invalidateQueries({ queryKey: ["discord"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Discord rejected the message"),
  });

  const disconnect = useMutation({
    mutationFn: () => dropFn(),
    onSuccess: () => { toast.success("Discord disconnected"); qc.invalidateQueries({ queryKey: ["discord"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't disconnect"),
  });

  if (isLoading) return <Panel><Skeleton className="h-56" /></Panel>;

  if (!isOwner) {
    return (
      <Panel title="Discord">
        <p className="py-6 text-center text-sm text-muted-foreground">
          Only the agency owner can connect Discord.
        </p>
      </Panel>
    );
  }

  const connected = Boolean(s?.configured);

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <Panel
        title="Discord Sales Bot"
        action={
          connected
            ? <Badge variant={s.enabled ? "success" : "secondary"}>{s.enabled ? "Connected" : "Paused"}</Badge>
            : <Badge variant="outline">Not connected</Badge>
        }
      >
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <MessageSquare className="h-4 w-4" />
          </span>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Announce every posted deal in your agency's Discord. Create an incoming
            webhook in Discord under <strong>Server Settings → Integrations → Webhooks</strong>,
            pick the channel, and paste the URL here.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Webhook URL {connected && <span className="text-text-dim">— leave blank to keep the current one</span>}
            </label>
            <Input
              type="password"
              autoComplete="off"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={connected ? s.webhook_masked : "https://discord.com/api/webhooks/…"}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Channel name (for your reference)</label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="#sales" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Only announce deals at or above
              </label>
              <Input
                type="number" min={0} inputMode="numeric"
                value={minPremium}
                onChange={(e) => setMinPremium(e.target.value)}
                placeholder="0"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Annual premium. 0 announces every deal.</p>
            </div>
          </div>

          <Button
            onClick={() => save.mutate({
              ...(url.trim() ? { webhook_url: url.trim() } : {}),
              channel_label: label.trim() || null,
              min_annual_premium: Number(minPremium || 0),
            })}
            disabled={save.isPending || (!connected && !url.trim())}
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : connected ? "Save changes" : "Connect Discord"}
          </Button>
        </div>
      </Panel>

      {connected && (
        <>
          <Panel title="What gets announced">
            <div className="space-y-4">
              {([
                ["enabled", "Bot enabled", "Turn everything off without disconnecting."],
                ["post_deals", "Posted deals", "A message each time someone writes business."],
                ["post_milestones", "Milestones", "Production milestones and streaks."],
                ["post_new_agents", "New agents", "When someone joins the agency."],
              ] as const).map(([key, title, desc]) => (
                <div key={key} className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <Switch
                    className="mt-0.5 shrink-0"
                    checked={Boolean(s[key])}
                    onCheckedChange={(v) => save.mutate({ [key]: v })}
                  />
                </div>
              ))}
            </div>

            <p className="mt-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              Announcements never include client names or policy numbers. Discord servers
              often have wide membership, and that is not a place for customer identity.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
                {test.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                Send test message
              </Button>
              <Button size="sm" variant="outline" className="text-muted-foreground hover:text-destructive"
                onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Disconnect
              </Button>
            </div>

            {s.last_error && (
              <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Last attempt failed: {s.last_error}
              </p>
            )}
          </Panel>

          {((log as any)?.deliveries ?? []).length > 0 && (
            <Panel title="Recent Announcements">
              <ul className="-my-1 divide-y divide-border-soft">
                {((log as any).deliveries as any[]).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="capitalize text-muted-foreground">
                      {String(d.event_type).replace(/_/g, " ")}
                    </span>
                    <span className="flex items-center gap-2">
                      {d.error && <span className="max-w-[220px] truncate text-[11px] text-destructive">{d.error}</span>}
                      <Badge
                        variant={d.status === "sent" ? "success" : d.status === "skipped" ? "secondary" : "destructive"}
                        className="text-[10px]"
                      >
                        {d.status}
                      </Badge>
                      <span className="tnum text-[11px] text-muted-foreground">
                        {new Date(d.created_at).toLocaleDateString()}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}

      {!connected && (
        <a
          href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks"
          target="_blank"
          rel="noopener noreferrer"
          className={cn("inline-flex items-center gap-1 text-xs text-primary hover:underline")}
        >
          How to create a Discord webhook <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
