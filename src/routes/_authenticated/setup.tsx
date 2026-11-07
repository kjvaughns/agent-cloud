import { createFileRoute, redirect } from "@tanstack/react-router";

// The old setup wizard is retired: /start builds the agency, and the Launchpad
// in Agency settings finishes it. Path kept for old links and emails.
export const Route = createFileRoute("/_authenticated/setup")({
  beforeLoad: () => { throw redirect({ to: "/settings/agency" }); },
});
