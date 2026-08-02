import { createFileRoute, redirect } from "@tanstack/react-router";

// Getting agents ready is a tab in Team management, beside the roster.
export const Route = createFileRoute("/_authenticated/onboarding")({
  beforeLoad: () => { throw redirect({ to: "/team", search: { tab: "onboarding" } as any }); },
});
