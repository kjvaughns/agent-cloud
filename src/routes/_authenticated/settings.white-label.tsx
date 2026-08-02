import { createFileRoute, redirect } from "@tanstack/react-router";

// White label is a plan, so it lives with the other things you pay for.
export const Route = createFileRoute("/_authenticated/settings/white-label")({
  beforeLoad: () => { throw redirect({ to: "/settings/billing", search: { tab: "white-label" } as any }); },
});
