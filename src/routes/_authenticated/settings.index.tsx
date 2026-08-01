import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Settings has no overview page.
 *
 * Clients and Agency earn theirs by showing something — counts of work
 * waiting, agents who cannot sell yet. A Settings overview would only be a
 * menu of its own contents. So /settings opens its first section.
 *
 * That first section used to be Billing. Billing is agency money and lives
 * under Agency now, so this points at the first thing that is actually
 * personal.
 */
export const Route = createFileRoute("/_authenticated/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/notifications" });
  },
});
