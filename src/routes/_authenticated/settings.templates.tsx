import { createFileRoute, redirect } from "@tanstack/react-router";

// Submission templates live with the contracting rules that use them.
export const Route = createFileRoute("/_authenticated/settings/templates")({
  beforeLoad: () => { throw redirect({ to: "/settings/agency", search: { tab: "contracting" } as any }); },
});
