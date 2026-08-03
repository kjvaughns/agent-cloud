import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { requireSession } from "@/lib/require-session";

/**
 * "Getting agents ready" means two different things depending on who you are.
 *
 * This redirected everyone to `/team?tab=onboarding`. For an agency owner that
 * is right — the tab is there, beside the roster. For an agent it is a dead
 * end, and a silent one: `team.tsx` early-returns a "No team members yet" empty
 * state that **replaces the entire tab block** when the viewer has no downline
 * and cannot manage roles, so the `tab` search param is discarded without a
 * word. A brand-new agent following this link landed on a Team Command Center
 * telling them they have no team, which is true and useless.
 *
 * The tab needs *both* a downline and `canManageRoles` to render, so for an
 * agent that destination can never work.
 *
 * Their own version of this is the Get Ready panel on the dashboard, which is
 * the same data — `getAgentOnboarding` — scoped to them.
 */
export const Route = createFileRoute("/_authenticated/onboarding")({
  beforeLoad: async () => {
    const session = await requireSession();

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .in("role", ["super_admin", "agency_owner", "admin", "manager"] as any)
      .limit(1);

    if (roleRows?.length) {
      throw redirect({ to: "/team", search: { tab: "onboarding" } as any });
    }

    // Not a role check for its own sake — somebody with direct reports has a
    // roster worth opening even without a management role.
    const { data: reports } = await supabase
      .from("profiles")
      .select("id")
      .eq("upline_id", session.user.id)
      .limit(1);

    throw redirect(
      reports?.length
        ? { to: "/team", search: { tab: "onboarding" } as any }
        : { to: "/dashboard" as any },
    );
  },
});
