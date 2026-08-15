import { createFileRoute, redirect } from "@tanstack/react-router";

// Contracting settings are agency configuration, so they live under Settings
// now (How Contracting Works). The path stays for bookmarks.
export const Route = createFileRoute("/_authenticated/contracting-ops/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/agency", search: { tab: "contracting" } as any });
  },
});
