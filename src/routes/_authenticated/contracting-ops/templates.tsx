import { createFileRoute, redirect } from "@tanstack/react-router";

// Submission templates are agency configuration, so they live under Settings
// now. The path stays for bookmarks.
export const Route = createFileRoute("/_authenticated/contracting-ops/templates")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/agency", search: { tab: "contracting" } as any });
  },
});
