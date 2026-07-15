import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { formatDistanceToNow } from "date-fns";
import { Bell, X, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PageShell, HeroBand } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  clearAllNotifications,
} from "@/lib/notifications.functions";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Agent Cloud" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const list = useServerFn(listNotifications);
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const dismiss = useServerFn(dismissNotification);
  const clearAll = useServerFn(clearAllNotifications);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => list(),
  });

  useEffect(() => {
    const channel = supabase
      .channel("notifications-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const mRead = useMutation({ mutationFn: (id: string) => markRead({ data: { id } }), onSuccess: invalidate });
  const mAll = useMutation({ mutationFn: () => markAll(), onSuccess: invalidate });
  const mDismiss = useMutation({ mutationFn: (id: string) => dismiss({ data: { id } }), onSuccess: invalidate });
  const mClear = useMutation({ mutationFn: () => clearAll(), onSuccess: invalidate });

  const items = data ?? [];

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto">
      <HeroBand
        title={<span className="flex items-center gap-2"><Bell className="h-6 w-6" /> Notifications</span>}
        actions={
          items.length > 0 ? (
            <>
              <Button size="sm" variant="outline" onClick={() => mAll.mutate()}>
                <CheckCheck className="h-4 w-4 mr-1" /> Mark all as read
              </Button>
              <Button size="sm" variant="outline" className="text-destructive border-destructive/40" onClick={() => mClear.mutate()}>
                <Trash2 className="h-4 w-4 mr-1" /> Clear all
              </Button>
            </>
          ) : undefined
        }
      >
        {isLoading ? (
          <div className="space-y-2 mt-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 rounded-[var(--radius)] border border-border bg-card mt-2">
            <Bell className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <p className="mt-4 text-lg font-medium">All caught up!</p>
            <p className="text-sm text-muted-foreground">No new notifications. Check back later.</p>
          </div>
        ) : (
          <div className="space-y-2 mt-2">
            {items.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "rounded-[var(--radius)] border p-4 cursor-pointer transition hover:bg-surface-2",
                  !n.read ? "border-border bg-gold-glow" : "border-border bg-card",
                )}
                onClick={() => !n.read && mRead.mutate(n.id)}
              >
                <div className="flex items-start gap-3">
                  <div className={cn("mt-2 h-2 w-2 rounded-full shrink-0", !n.read ? "bg-gold-bright" : "bg-transparent")} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className={cn("font-medium text-sm", !n.read && "text-gold-bright")}>{n.title}</div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground tnum">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            mDismiss.mutate(n.id);
                          }}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Dismiss"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {n.description && (
                      <div className="text-sm text-muted-foreground mt-1">{n.description}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </HeroBand>
      </div>
    </PageShell>
  );
}
