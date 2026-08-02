import { createFileRoute } from "@tanstack/react-router";
import { AgencyTeamPage } from "@/components/agency-team-page";

export const Route = createFileRoute("/_authenticated/settings/roles")({
  head: () => ({ meta: [{ title: "Team & Permissions — Agent Cloud" }] }),
  component: AgencyTeamPage,
});
