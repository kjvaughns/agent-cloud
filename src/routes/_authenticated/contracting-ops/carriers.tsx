import { createFileRoute, redirect } from "@tanstack/react-router";

const SETTINGS_HOME: Record<string, string> = {
  carriers: "/settings/carriers",
  levels: "/settings/levels",
  grids: "/settings/comp-grids",
};

// Carrier Setup moved under Settings — configuration lives with configuration,
// and the Contracting tab keeps the daily work. The old tabs map to the three
// Settings pages; the path stays for bookmarks, tiles and the setup checklist.
export const Route = createFileRoute("/_authenticated/contracting-ops/carriers")({
  validateSearch: (s: Record<string, unknown>): { tab?: string } =>
    typeof s.tab === "string" ? { tab: s.tab } : {},
  beforeLoad: ({ search }) => {
    throw redirect({ to: SETTINGS_HOME[(search as any).tab ?? "carriers"] ?? "/settings/carriers" });
  },
});
