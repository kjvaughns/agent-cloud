import { createFileRoute, redirect } from "@tanstack/react-router";

// A tab of Agency settings now.
export const Route = createFileRoute("/_authenticated/settings/automations")({
  beforeLoad: () => { throw redirect({ to: "/settings/agency", search: { tab: "automations" } as any }); },
});
