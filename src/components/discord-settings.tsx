import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MessageSquare, Send, Trash2, Loader2, Plus, RotateCcw, Pencil } from "lucide-react";
import { toast } from "sonner";
import { MENTIONS, MENTION_LABELS, type Mention } from "@/lib/discord/mention";
import { healthState, healthDetail, HEALTH_LABELS } from "@/lib/discord/retry";
import { EVENT_LABEL, EVENT_PURPOSE, DISCORD_EVENTS, eventsFor, eventSummary } from "@/lib/discord/message";
import type { DiscordEvent } from "@/lib/discord/message";
import {
  getDiscordSettings, saveDiscordSettings, disconnectDiscord,
  sendDiscordTest, listDiscordDeliveries, retryDiscordDelivery,
} from "@/lib/discord.functions";

/**
 * Discord bots.
 *
 * One bot is one webhook pointed at one channel, posting exactly the events it
 * was created for — a Sales bot in #sales, an Announcements bot in #general.
 * Nothing is switched on behind the owner's back: a new bot writes its event
 * choices explicitly rather than inheriting column defaults, which is what
 * used to make a "sales" webhook also carry announcements.
 *
 * A webhook URL is a bearer credential, so the server returns only a masked
 * form and every send happens server-side.
 */

type Webhook = {
  id: string;
  name?: string | null;
  description?: string | null;
  channel_label: string | null;
  webhook_masked: string;
  enabled: boolean;
  post_deals: boolean;
  post_new_agents: boolean;
  post_announcements?: boolean;
  announcement_mention?: string | null;
  min_annual_premium: number;
  last_error: string | null;
  last_error_at?: string | null;
  last_success_at?: string | null;
  consecutive_failures?: number | null;
  next_retry_at?: string | null;
};

type Delivery = {
  id: string;
  integration_id: string;
  event_type: string;
  status: string;
  http_status: number | null;
  error: string | null;
  skip_reason?: string | null;
  created_at: string;
};

const EVENT_COLUMN: Record<DiscordEvent, "post_deals" | "post_announcements" | "post_new_agents"> = {
  sales: "post_deals",
  announcements: "post_announcements",
  new_agents: "post_new_agents",
};

function HealthBadge({ webhook }: { webhook: Webhook }) {
  const state = healthState(webhook);
  if (state === "healthy" || state === "off") return null;
  return (
    <Badge variant={state === "broken" ? "destructive" : "secondary"}>{HEALTH_LABELS[state]}</Badge>
  );
}

type Draft = {
  id?: string;
  name: string;
  description: string;
  channel_label: string;
  webhook_url: string;
  events: DiscordEvent[];
  enabled: boolean;
  min_annual_premium: string;
  /** Default ping when an announcement posts into this channel. */
  announcement_mention: Mention;
};

const emptyDraft: Draft = {
  name: "",
  description: "",
  channel_label: "",
  webhook_url: "",
  events: [],
  enabled: true,
  min_annual_premium: "0",
  announcement_mention: "none",
};

function draftFrom(w: Webhook): Draft {
  return {
    id: w.id,
    name: w.name ?? "",
    description: w.description ?? "",
    channel_label: w.channel_label ?? "",
    webhook_url: "",
    events: eventsFor(w),
    enabled: !!w.enabled,
    min_annual_premium: String(w.min_annual_premium ?? 0),
    announcement_mention: (MENTIONS as readonly string[]).includes(w.announcement_mention ?? "")
      ? (w.announcement_mention as Mention)
      : "none",
  };
}

export function DiscordSettings() {
  const qc = useQueryClient();
  const getFn = useServerFn(getDiscordSettings);
  const saveFn = useServerFn(saveDiscordSettings);
  const testFn = useServerFn(sendDiscordTest);
  const dropFn = useServerFn(disconnectDiscord);
  const logFn = useServerFn(listDiscordDeliveries);
  const retryFn = useServerFn(retryDiscordDelivery);

  const { data, isLoading } = useQuery({ queryKey: ["discord"], queryFn: () => getFn() });
  const { data: log } = useQuery({
    queryKey: ["discord", "log"],
    queryFn: () => logFn({ data: {} }),
  });

  const webhooks = ((data as any)?.webhooks ?? []) as Webhook[];
  const isOwner = Boolean((data as any)?.isOwner);
  const maxWebhooks = Number((data as any)?.maxWebhooks ?? 10);
  const deliveries = ((log as any)?.deliveries ?? []) as Delivery[];

  const byBot = useMemo(() => {
    const m = new Map<string, Delivery[]>();
    for (const d of deliveries) {
      const list = m.get(d.integration_id) ?? [];
      list.push(d);
      m.set(d.integration_id, list);
    }
    return m;
  }, [deliveries]);

  const [draft, setDraft] = useState<Draft | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["discord"] });

  const save = useMutation({
    mutationFn: (patch: any) => saveFn({ data: patch }),
    onSuccess: (_r, patch: any) => {
      toast.success(patch.id ? "Saved" : "Discord bot added");
      setDraft(null);
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
    onSuccess: () => { toast.success("Bot removed"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't remove that bot"),
  });

  const retry = useMutation({
    mutationFn: (id: string) => retryFn({ data: { id } }),
    onSuccess: (r: any) => {
      toast.success(r?.alreadySent ? "That event had already been posted — nothing sent twice." : "Retried");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Retry failed"),
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

  function submitDraft() {
    if (!draft) return;
    if (!draft.name.trim()) return toast.error("Give this bot a name.");
    if (draft.events.length === 0) return toast.error("Pick at least one event for this bot to post.");
    if (!draft.id && !draft.webhook_url.trim()) return toast.error("Paste the Discord webhook URL.");

    const patch: Record<string, unknown> = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      channel_label: draft.channel_label.trim() || null,
      enabled: draft.enabled,
      min_annual_premium: Number(draft.min_annual_premium || 0),
      post_deals: draft.events.includes("sales"),
      post_announcements: draft.events.includes("announcements"),
      announcement_mention: draft.announcement_mention,
      post_new_agents: draft.events.includes("new_agents"),
    };
    if (draft.id) patch.id = draft.id;
    if (draft.webhook_url.trim()) patch.webhook_url = draft.webhook_url.trim();
    save.mutate(patch);
  }

  return (
    <div className="flex flex-col gap-[var(--gap)]">
      <Panel
        title="Discord bots"
        action={
          <Button size="sm" disabled={atLimit} onClick={() => setDraft({ ...emptyDraft })}>
            <Plus className="mr-2 h-4 w-4" /> Add Discord bot
          </Button>
        }
      >
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <MessageSquare className="h-4 w-4" />
          </span>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Each bot is one Discord webhook posting only the events you tick. Create the
            webhook under <strong>Server Settings → Integrations → Webhooks</strong>, pick the
            channel, then add it here — a Sales bot in #sales, an Announcements bot in
            #general, each independent of the other.
          </p>
        </div>
        <p className="mt-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          Posts never include client names, policy numbers or contact details. Discord
          servers often have wide membership, and that is not a place for customer identity.
        </p>
        {atLimit && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            You have reached the limit of {maxWebhooks} bots.
          </p>
        )}
      </Panel>

      {webhooks.length === 0 && (
        <Panel>
          <p className="py-6 text-center text-sm text-muted-foreground">
            No Discord bots yet. Add one to start posting to a channel.
          </p>
        </Panel>
      )}

      {webhooks.map((w) => {
        const events = eventsFor(w);
        const detail = healthDetail(w);
        const rows = byBot.get(w.id) ?? [];
        return (
          <Panel
            key={w.id}
            title={w.name || w.channel_label || "Discord bot"}
            action={
              <div className="flex items-center gap-1.5">
                <HealthBadge webhook={w} />
                <Badge variant={w.enabled ? "success" : "secondary"}>{w.enabled ? "Live" : "Paused"}</Badge>
              </div>
            }
          >
            {w.description && <p className="text-sm text-muted-foreground">{w.description}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {events.length === 0 ? (
                <Badge variant="outline">{eventSummary(events)}</Badge>
              ) : (
                events.map((e) => <Badge key={e} variant="secondary">{EVENT_LABEL[e]}</Badge>)
              )}
              {w.channel_label && <span className="text-xs text-muted-foreground">{w.channel_label}</span>}
            </div>

            <p className="mt-3 font-mono text-[11px] text-text-dim">{w.webhook_masked}</p>

            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <p>
                {w.last_success_at
                  ? `Last delivered ${new Date(w.last_success_at).toLocaleString()}`
                  : "Nothing delivered yet"}
              </p>
              {detail && <p className="text-warning">{detail}</p>}
              {w.last_error && <p className="text-destructive">{w.last_error}</p>}
              {events.includes("sales") && Number(w.min_annual_premium ?? 0) > 0 && (
                <p>Only sales at or above ${Number(w.min_annual_premium).toLocaleString()} annual premium.</p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => test.mutate(w.id)} disabled={test.isPending}>
                {test.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send test
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDraft(draftFrom(w))}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Button>
              <div className="ml-1 flex items-center gap-2">
                <Switch
                  checked={!!w.enabled}
                  onCheckedChange={(v) => save.mutate({ id: w.id, enabled: v })}
                />
                <span className="text-xs text-muted-foreground">{w.enabled ? "Enabled" : "Disabled"}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-destructive"
                onClick={() => disconnect.mutate(w.id)}
                disabled={disconnect.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Remove
              </Button>
            </div>

            {rows.length > 0 && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Recent deliveries</p>
                <ul className="space-y-1.5">
                  {rows.slice(0, 8).map((d) => (
                    <li key={d.id} className="flex items-center gap-2 text-xs">
                      <Badge
                        variant={d.status === "sent" ? "success" : d.status === "failed" ? "destructive" : "secondary"}
                      >
                        {d.status}
                      </Badge>
                      <span className="text-muted-foreground">{d.event_type}</span>
                      <span className="text-text-dim">{new Date(d.created_at).toLocaleString()}</span>
                      {(d.error || d.skip_reason) && (
                        <span className="truncate text-text-dim">{d.error ?? d.skip_reason}</span>
                      )}
                      {d.status === "failed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto h-6 px-2"
                          onClick={() => retry.mutate(d.id)}
                          disabled={retry.isPending}
                        >
                          <RotateCcw className="mr-1 h-3 w-3" /> Retry
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        );
      })}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit Discord bot" : "Add Discord bot"}</DialogTitle>
            <DialogDescription>
              This bot posts only the events you tick below — nothing else.
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Bot name</label>
                <Input
                  value={draft.name}
                  placeholder="Sales Bot"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Purpose</label>
                <Textarea
                  value={draft.description}
                  rows={2}
                  placeholder="Posts every deal into #sales."
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Discord channel</label>
                <Input
                  value={draft.channel_label}
                  placeholder="#sales"
                  onChange={(e) => setDraft({ ...draft, channel_label: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Webhook URL{draft.id ? " (leave blank to keep the current one)" : ""}
                </label>
                <Input
                  value={draft.webhook_url}
                  placeholder="https://discord.com/api/webhooks/…"
                  onChange={(e) => setDraft({ ...draft, webhook_url: e.target.value })}
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Events</p>
                <div className="space-y-2">
                  {DISCORD_EVENTS.map((ev) => {
                    const checked = draft.events.includes(ev);
                    return (
                      <label key={ev} className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2.5">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) =>
                            setDraft({
                              ...draft,
                              events: v
                                ? [...draft.events, ev]
                                : draft.events.filter((x) => x !== ev),
                            })
                          }
                        />
                        <span>
                          <span className="block text-sm font-medium">{EVENT_LABEL[ev]}</span>
                          <span className="block text-[11px] text-muted-foreground">{EVENT_PURPOSE[ev]}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {draft.events.includes("announcements") && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Ping this channel when an announcement posts
                  </label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={draft.announcement_mention}
                    onChange={(e) =>
                      setDraft({ ...draft, announcement_mention: e.target.value as Mention })}
                  >
                    {MENTIONS.map((m) => (
                      <option key={m} value={m}>{MENTION_LABELS[m]}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    The person posting can override this per announcement.
                  </p>
                </div>
              )}

              {draft.events.includes("sales") && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    Only post sales at or above (annual premium)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={draft.min_annual_premium}
                    onChange={(e) => setDraft({ ...draft, min_annual_premium: e.target.value })}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">0 posts every deal.</p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Switch
                  checked={draft.enabled}
                  onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
                />
                <span className="text-sm">Enabled</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={submitDraft} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {draft?.id ? "Save bot" : "Add bot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// `EVENT_COLUMN` documents the column each ticked event maps to; the payload
// above writes those columns directly, so it is exported for the checks.
export { EVENT_COLUMN };
