import { createFileRoute, redirect } from "@tanstack/react-router";

// White label is workspace configuration, so it lives in the Settings hub now
// rather than floating with no frame around it. Old path kept for bookmarks.
export const Route = createFileRoute("/_authenticated/white-label")({
  beforeLoad: () => { throw redirect({ to: "/settings/white-label" }); },
});
