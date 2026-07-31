import { createFileRoute, redirect } from "@tanstack/react-router";

// Agency configuration lives under Settings now; /agency is for the people
// side of running an agency. The old path stays for bookmarks.
export const Route = createFileRoute("/_authenticated/agency/emails")({
  beforeLoad: () => { throw redirect({ to: "/settings/emails" }); },
});
