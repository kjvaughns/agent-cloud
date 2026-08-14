import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { requireSession } from "@/lib/require-session";

/**
 * "Getting agents ready" means two different things depending on who you are.
 *
 * This redirected everyone to the owner's view. For an agent that is a dead
 * end — a page about a team they do not have. Their own version is the Get
 * Ready panel on their dashboard, which is the same data
 * (`getAgentOnboarding`) scoped to them.
 *
 * The owner's half is no longer a tab: getting agents ready is the first list
 * on the Team page itself, so this lands on /team with nothing to select.
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
      throw redirect({ to: "/team" });
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
        ? { to: "/team" }
        : { to: "/dashboard" as any },
    );
  },
});
