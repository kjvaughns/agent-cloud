import { createFileRoute, redirect } from "@tanstack/react-router";

const SETTINGS_TAB: Record<string, string> = {
  carriers: "carriers",
  levels: "levels",
  grids: "carriers",
};

// Carrier Setup is a tab of Agency settings — configuration lives with
// configuration, and the Contracting tab keeps the daily work. The old tabs map
// onto the new ones; the path stays for bookmarks, tiles and the checklist.
export const Route = createFileRoute("/_authenticated/contracting-ops/carriers")({
  validateSearch: (s: Record<string, unknown>): { tab?: string } =>
    typeof s.tab === "string" ? { tab: s.tab } : {},
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/settings/agency",
      search: { tab: SETTINGS_TAB[(search as any).tab ?? "carriers"] ?? "carriers" } as any,
    });
  },
});
