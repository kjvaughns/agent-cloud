import { createFileRoute, redirect } from "@tanstack/react-router";

// Licensing has one entry point now: /licensing, which sends you to your own
// licences or to the agency roster depending on which one is your job. This
// path stays because the dashboard checklist and old bookmarks point at it.
export const Route = createFileRoute("/_authenticated/resources/state-licenses")({
  beforeLoad: () => {
    throw redirect({ to: "/licensing" });
  },
});
