import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Settings has no overview page.
 *
 * The other two hubs earn theirs by showing something — counts of work
 * waiting, agents who cannot sell yet. A Settings overview would only be a
 * menu of the rail beside it, which is the thing this hub was criticised for
 * in the first place. So /settings goes straight to the first section, which
 * is also the tab it used to open on.
 */
export const Route = createFileRoute("/_authenticated/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/billing" });
  },
});
