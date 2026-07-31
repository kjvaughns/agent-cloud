import { createFileRoute } from "@tanstack/react-router";
import { SupportConsole } from "@/components/support-console";

// Was a tab inside the Settings page with no route of its own, so it could not
// be linked to, bookmarked, or found by name in the command palette.
export const Route = createFileRoute("/_authenticated/settings/support")({
  head: () => ({ meta: [{ title: "Support Desk — Agent Cloud" }] }),
  component: SupportConsole,
});
