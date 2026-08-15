import { createFileRoute, redirect } from "@tanstack/react-router";

// Notification preferences are a tab of Agency settings now; the panel itself
// is @/components/settings/notifications-panel.
export const Route = createFileRoute("/_authenticated/settings/notifications")({
  beforeLoad: () => { throw redirect({ to: "/settings/agency", search: { tab: "notifications" } as any }); },
});
