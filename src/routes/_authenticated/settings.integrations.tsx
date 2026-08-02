import { createFileRoute, redirect } from "@tanstack/react-router";

// A tab of Agency settings now.
export const Route = createFileRoute("/_authenticated/settings/integrations")({
  beforeLoad: () => { throw redirect({ to: "/settings/agency", search: { tab: "integrations" } as any }); },
});
