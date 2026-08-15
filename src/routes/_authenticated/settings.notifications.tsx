import { createFileRoute } from "@tanstack/react-router";
import { PageShell, HeroBand } from "@/components/page-shell";
import { NotificationsPanel } from "@/components/settings/notifications-panel";

/**
 * Settings ▸ Notifications.
 *
 * Its own destination rather than a tab inside Agency Settings. Everything in
 * Agency Settings configures the AGENCY — its ladder, its carriers, who may
 * change them — and needs a permission to open. This configures what lands in
 * YOUR inbox, so an agent with no agency permissions at all still has to be
 * able to reach it and turn something off.
 */
export const Route = createFileRoute("/_authenticated/settings/notifications")({
  component: NotificationSettingsPage,
  head: () => ({ meta: [{ title: "Notifications | Settings | Agent Cloud" }] }),
});

function NotificationSettingsPage() {
  return (
    <PageShell>
      <div className="space-y-[var(--gap)]">
        <HeroBand
          title="Notifications"
          subtitle="What reaches you, and where"
        />
        <NotificationsPanel />
      </div>
    </PageShell>
  );
}
