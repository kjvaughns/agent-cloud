import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, Send, Trash2, Loader2, ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  getDiscordSettings, saveDiscordSettings, disconnectDiscord,
  sendDiscordTest, listDiscordDeliveries,
} from "@/lib/discord.functions";

/**
 * Discord sales bot settings. Owner-only — a webhook URL is a credential, and
 * the server never returns one in full, only a masked form.
 *
 * Several channels are supported because agencies genuinely want different
 * audiences: everything in #sales, only the large cases in a leadership
 * channel. Each channel carries its own threshold and its own event switches
 * rather than one shared set.
 */

type Webhook = {
  id: string;
  channel_label: string | null;
  webhook_masked: string;
  enabled: boolean;
  post_deals: boolean;
  post_new_agents: boolean;
  post_announcements?: boolean;
  min_annual_premium: number;
  last_error: string | null;
};

/**
 * Only switches that do something.
 *
 * "Milestones — production milestones and streaks" was offered here since
 * Discord shipped. Nothing ever sent one, and there is no milestone or streak
 * concept anywhere in the product for it to describe, so an owner could turn
 * it on and wait forever. The column stays in the database, unused; the
 * control is gone, because a switch that can never do anything is worse than
 * no switch.
 *
 * "New agents" was in the same state and now has the sender it implied.
 * "Announcements" is new: agency announcements have always gone to every
 * enabled channel with no way to say no short of turning the channel off.
 */
const EVENTS = [
  ["post_deals", "Posted deals", "A message each time someone writes business."],
  ["post_new_agents", "New agents", "When someone joins the agency."],
  ["post_announcements", "Announcements", "Agency announcements posted from the Announcements page."],
] as const;

export function DiscordSettings() {
  const qc = useQueryClient();
  const getFn = useServerFn(getDiscordSettings);
  const saveFn = useServerFn(saveDiscordSettings);
  const testFn = useServerFn(sendDiscordTest);
  const dropFn = useServerFn(disconnectDiscord);
  const logFn = useServerFn(listDiscordDeliveries);

  const { data, isLoading } = useQuery({ queryKey: ["discord"], queryFn: () => getFn() });
  const { data: log } = useQuery({ queryKey: ["discord", "log"], queryFn: () => logFn() });

  const webhooks = ((data as any)?.webhooks ?? []) as Webhook[];
  const isOwner = Boolean((data as any)?.isOwner);
  const maxWebhooks = Number((data as any)?.maxWebhooks ?? 10);

  const [adding, setAdding] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newMin, setNewMin] = useState("0");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["discord"] });

  const save = useMutation({
    mutationFn: (patch: any) => saveFn({ data: patch }),
    onSuccess: (_r, patch: any) => {
      if (!patch.id) {
        toast.success("Discord channel connected");
        setAdding(false); setNewUrl(""); setNewLabel(""); setNewMin("0");
      } else {
        toast.success("Saved");
      }
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't save"),
  });

  const test = useMutation({
    mutationFn: (id: string) => testFn({ data: { id } }),
    onSuccess: () => { toast.success("Test message sent — check your channel"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Discord rejected the message"),
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => dropFn({ data: { id } }),
    onSuccess: () => { toast.success("Channel removed"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't remove that channel"),
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

  const atLimit = webhooks.length >= maxWebhooks;

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <Panel
        title="Discord Sales Bot"
        action={
          webhooks.length > 0
            ? <Badge variant="secondary">{webhooks.length} channel{webhooks.length === 1 ? "" : "s"}</Badge>
            : <Badge variant="outline">Not connected</Badge>
        }
      >
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <MessageSquare className="h-4 w-4" />
          </span>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Announce posted deals in your agency's Discord. Create an incoming webhook
            under <strong>Server Settings → Integrations → Webhooks</strong>, pick the
            channel, and paste the URL here. Add as many channels as you like — each one
            has its own premium threshold, so a leadership channel can hear only about the
            large cases.
          </p>
        </div>

        <p className="mt-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          Announcements never include client names or policy numbers. Discord servers
          often have wide membership, and that is not a place for customer identity.
        </p>
      </Panel>

      {webhooks.map((w) => (
        <Panel
          key={w.id}
          title={w.channel_label || "Discord channel"}
          action={<Badge variant={w.enabled ? "success" : "secondary"}>{w.enabled ? "Live" : "Paused"}</Badge>}
        >
          <p className="font-mono text-[11px] text-text-dim">{w.webhook_masked}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Channel name (for your reference)</label>
              <Input
                defaultValue={w.channel_label ?? ""}
                placeholder="#sales"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (w.channel_label ?? "")) save.mutate({ id: w.id, channel_label: v || null });
                }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Only announce deals at or above</label>
              <Input
                type="number" min={0} inputMode="numeric"
                defaultValue={String(w.min_annual_premium ?? 0)}
                onBlur={(e) => {
                  const v = Number(e.target.value || 0);
                  if (v !== Number(w.min_annual_premium ?? 0)) save.mutate({ id: w.id, min_annual_premium: v });
                }}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Annual premium. 0 announces every deal.</p>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Channel enabled</p>
                <p className="text-xs text-muted-foreground">Turn this channel off without removing it.</p>
              </div>
              <Switch
                className="mt-0.5 shrink-0"
                checked={w.enabled}
                onCheckedChange={(v) => save.mutate({ id: w.id, enabled: v })}
              />
            </div>
            {EVENTS.map(([key, title, desc]) => (
              <div key={key} className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <Switch
                  className="mt-0.5 shrink-0"
                  // `!== false`, not `Boolean(...)`. Before 20260814240000 the
                  // announcements column is absent and reads as undefined —
                  // and the truth in that window is that announcements DO go
                  // to every enabled channel, so a switch showing "off" would
                  // be describing the opposite of what happens. The other two
                  // columns are real booleans and read identically either way.
                  checked={w[key] !== false}
                  onCheckedChange={(v) => save.mutate({ id: w.id, [key]: v })}
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => test.mutate(w.id)}
                    disabled={test.isPending && test.variables === w.id}>
              {test.isPending && test.variables === w.id
                ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                : <Send className="mr-1 h-3.5 w-3.5" />}
              Send test message
            </Button>
            <Button size="sm" variant="outline" className="text-muted-foreground hover:text-destructive"
                    onClick={() => disconnect.mutate(w.id)}
                    disabled={disconnect.isPending && disconnect.variables === w.id}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
            </Button>
          </div>

          {w.last_error && (
            <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Last attempt failed: {w.last_error}
            </p>
          )}
        </Panel>
      ))}

      {adding || webhooks.length === 0 ? (
        <Panel title={webhooks.length === 0 ? "Connect your first channel" : "Add another channel"}>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Webhook URL</label>
              <Input
                type="password" autoComplete="off"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/…"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Channel name (for your reference)</label>
                <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="#sales" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Only announce deals at or above</label>
                <Input type="number" min={0} inputMode="numeric" value={newMin}
                       onChange={(e) => setNewMin(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => save.mutate({
                  webhook_url: newUrl.trim(),
                  channel_label: newLabel.trim() || null,
                  min_annual_premium: Number(newMin || 0),
                })}
                disabled={save.isPending || !newUrl.trim()}
              >
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect channel"}
              </Button>
              {webhooks.length > 0 && (
                <Button variant="outline" onClick={() => { setAdding(false); setNewUrl(""); }}>Cancel</Button>
              )}
            </div>
          </div>
        </Panel>
      ) : (
        <div>
          <Button variant="outline" size="sm" onClick={() => setAdding(true)} disabled={atLimit}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add another channel
          </Button>
          {atLimit && (
            <p className="mt-2 text-[11px] text-text-dim">
              You've reached the limit of {maxWebhooks} channels.
            </p>
          )}
        </div>
      )}

      {((log as any)?.deliveries ?? []).length > 0 && (
        <Panel title="Recent Announcements">
          <ul className="-my-1 divide-y divide-border-soft">
            {((log as any).deliveries as any[]).map((d) => {
              const target = webhooks.find((w) => w.id === d.integration_id);
              return (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate capitalize text-muted-foreground">
                    {String(d.event_type).replace(/_/g, " ")}
                    {target && (
                      <span className="ml-2 text-[11px] normal-case text-text-dim">
                        {target.channel_label || "channel"}
                      </span>
                    )}
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
              );
            })}
          </ul>
        </Panel>
      )}

      {webhooks.length === 0 && (
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
