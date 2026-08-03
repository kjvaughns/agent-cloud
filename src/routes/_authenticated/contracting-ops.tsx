import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireSession } from "@/lib/require-session";

export const Route = createFileRoute("/_authenticated/contracting-ops")({
  component: ContractingOpsLayout,
  /**
   * Staff only.
   *
   * Every page under this layout was reachable by typing the URL. The
   * navigation registry hides the entry behind `unlock: "agency-admin"`, and
   * `/licensing` picks between the staff view and the agent view with a
   * client-side branch — but neither is a guard. A hidden link is not a closed
   * door, and a bookmark, a shared URL or a deep link from the work inbox all
   * bypassed both.
   *
   * Same shape as `settings.agency.tsx`: `limit(1)` rather than
   * `maybeSingle()`, because an owner legitimately holds several of these roles
   * at once and `maybeSingle()` errors on more than one row.
   *
   * This is the outer layer. The server functions underneath do their own
   * checks and are the real boundary — this only stops the page rendering at
   * all, which is what makes a stale bookmark land somewhere sensible instead
   * of on a staff console.
   */
  beforeLoad: async () => {
    const session = await requireSession();
    const [{ data: roleRows }, { data: perms }] = await Promise.all([
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .in("role", ["super_admin", "agency_owner", "admin", "manager"] as any)
        .limit(1),
      supabase
        .from("role_permissions")
        .select("staff_is_admin, contracting_manage_licenses, contracting_manage_carriers, contracting_view_sensitive_docs")
        .eq("profile_id", session.user.id)
        .limit(1),
    ]);

    // Contracting staff are not admins and hold no user_roles row — they are
    // granted through role_permissions, so checking roles alone would lock out
    // exactly the people whose job this is.
    const p = (perms ?? [])[0] as Record<string, boolean> | undefined;
    const isStaff = Boolean(
      p && (p.staff_is_admin || p.contracting_manage_licenses ||
            p.contracting_manage_carriers || p.contracting_view_sensitive_docs),
    );

    if (!roleRows?.length && !isStaff) {
      // /licensing, not /dashboard: somebody who lands here almost always
      // wanted their own licences, and that page renders for everyone.
      throw redirect({ to: "/licensing" as any });
    }
  },
  head: () => ({ meta: [{ title: "Contracting Operations | Agent Cloud" }] }),
});

/**
 * The rail that used to sit beside this content now hangs off the sidebar's
 * Contracting entry. One navigation column instead of two, and the page keeps
 * its full width.
 */
function ContractingOpsLayout() {
  return (
    <PageShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Contracting Operations</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Licensing, carrier contracting, writing numbers, compensation and hierarchy — prepared
            here, submitted through whichever system each carrier requires.
          </p>
        </div>
        <Outlet />
      </div>
    </PageShell>
  );
}
