import { createFileRoute, redirect } from "@tanstack/react-router";

// The support desk is a tab in Help now, beside the tickets it answers.
export const Route = createFileRoute("/_authenticated/settings/support")({
  beforeLoad: () => { throw redirect({ to: "/account/help", search: { tab: "desk" } as any }); },
});
