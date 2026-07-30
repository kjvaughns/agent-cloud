import { createFileRoute, redirect } from "@tanstack/react-router";

// Analytics and Reports are one page now, at /reports. This route stays so
// bookmarks, saved links and the dashboard's older shortcuts keep working.
export const Route = createFileRoute("/_authenticated/analytics")({
  beforeLoad: () => {
    throw redirect({ to: "/reports" });
  },
});
