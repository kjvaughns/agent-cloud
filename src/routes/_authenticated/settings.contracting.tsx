import { createFileRoute, redirect } from "@tanstack/react-router";

// The contracting policy and its setup checklist are a tab of Agency settings
// now, alongside the submission templates they drive.
export const Route = createFileRoute("/_authenticated/settings/contracting")({
  beforeLoad: () => { throw redirect({ to: "/settings/agency", search: { tab: "contracting" } as any }); },
});
