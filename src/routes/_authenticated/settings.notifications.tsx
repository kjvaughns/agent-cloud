import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  getNotificationPrefs, updateNotificationPrefs,
  NOTIFICATION_CATEGORIES, type NotificationPrefs,
} from "@/lib/notification-prefs.functions";
import { useNavContext } from "@/hooks/use-my-access";

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Agent Cloud" }] }),
  component: NotificationSettings,
});

export function NotificationSettings() {
  const qc = useQueryClient();
  const { audience } = useNavContext();
  const getFn = useServerFn(getNotificationPrefs);
  const saveFn = useServerFn(updateNotificationPrefs);

  const { data, isLoading } = useQuery({ queryKey: ["notification-prefs"], queryFn: () => getFn() });
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data?.prefs) { setPrefs(data.prefs); setDirty(false); }
  }, [data]);

  const set = (k: keyof NotificationPrefs, v: boolean) => {
    setPrefs((p) => (p ? { ...p, [k]: v } : p));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () => saveFn({ data: prefs as any }),
    onSuccess: () => {
      toast.success("Notification preferences saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["notification-prefs"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't save"),
  });

  if (isLoading || !prefs) {
    return (
      <PageShell>
        <div className="max-w-2xl mx-auto flex flex-col gap-[var(--gap)]">
          <Skeleton className="h-12 w-56" />
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand title="Notifications" subtitle="Choose what reaches you, and how" />

        <Panel title="Delivery">
          <div className="space-y-4">
            <Row
              title="Email"
              description="Turn this off and you'll only see notifications inside the app."
              checked={prefs.email_enabled}
              onChange={(v) => set("email_enabled", v)}
            />
            <Row
              title="SMS"
              description="Requires Nova AI Pro and a provisioned number."
              checked={prefs.sms_enabled}
              onChange={(v) => set("sms_enabled", v)}
              disabled
              note="Not available yet — telephony is not connected."
            />
          </div>
        </Panel>

        <Panel title="What to send">
          <p className="text-xs text-muted-foreground mb-3">
            These apply to email. The in-app notification centre always shows everything.
            Your agency also controls its own automated messages separately — if a category is
            off there, nothing sends regardless of what you choose here.
          </p>
          <div className="space-y-4">
            {NOTIFICATION_CATEGORIES
              // A switch for something that cannot happen to you is not a
              // choice, it is a suggestion that you might be someone else.
              .filter((c) => !("audience" in c) || (c.audience as readonly string[]).includes(audience))
              .map((c) => (
              <Row
                key={c.key}
                title={c.label}
                description={c.description}
                checked={Boolean(prefs[c.key as keyof NotificationPrefs])}
                onChange={(v) => set(c.key as keyof NotificationPrefs, v)}
                disabled={!prefs.email_enabled}
              />
            ))}
          </div>
        </Panel>

        <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} className="self-start">
          {save.isPending ? "Saving…" : dirty ? "Save preferences" : "Saved"}
        </Button>
      </div>
    </PageShell>
  );
}

function Row({
  title, description, checked, onChange, disabled, note,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  note?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
        {note && <p className="text-xs text-warning mt-0.5">{note}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} className="shrink-0 mt-0.5" />
    </div>
  );
}
