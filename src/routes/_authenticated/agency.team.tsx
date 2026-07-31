import { createFileRoute, redirect } from "@tanstack/react-router";

// Roles & permissions is agency configuration, not an agency-people page, so
// it moved under Settings. The old path stays for bookmarks.
export const Route = createFileRoute("/_authenticated/agency/team")({
  beforeLoad: () => { throw redirect({ to: "/settings/roles" }); },
});
