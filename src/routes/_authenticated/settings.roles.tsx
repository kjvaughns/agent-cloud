import { createFileRoute, redirect } from "@tanstack/react-router";

// Roles & permissions is a tab of Agency settings now — who may do what is part
// of how the agency is configured, not a separate subject.
export const Route = createFileRoute("/_authenticated/settings/roles")({
  beforeLoad: () => { throw redirect({ to: "/settings/agency", search: { tab: "roles" } as any }); },
});
