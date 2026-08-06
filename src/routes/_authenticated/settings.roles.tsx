import { createFileRoute, Link } from "@tanstack/react-router";
import { AgencyTeamPage } from "@/components/agency-team-page";
import { PageShell, Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyAccess } from "@/hooks/use-my-access";

export const Route = createFileRoute("/_authenticated/settings/roles")({
  head: () => ({ meta: [{ title: "Team & Permissions — Agent Cloud" }] }),
  component: RolesRoute,
});

/**
 * May this person change who can do what?
 *
 * This route rendered AgencyTeamPage directly, with no check of any kind — so
 * anybody signed in reached the page for changing everyone's role. The data
 * behind it is guarded (`assertCanManagePermissions` on every mutating server
 * function, and `assertMayTargetMember` on top of that), so nothing could
 * actually be changed. But being shown the machinery for administering an
 * agency, with your colleagues listed and Configure buttons beside them, reads
 * as an oversight even when every button would refuse.
 *
 * `canManageRoles` is the same signal `getMyAccess` computes for the sidebar,
 * so the entry that offers this page and the page itself now agree — and it is
 * the same signal the server functions enforce, so the refusal here and the
 * refusal there cannot drift apart.
 */
function RolesRoute() {
  const { access, loading } = useMyAccess();

  if (loading) {
    return (
      <PageShell>
        <Skeleton className="h-64 rounded-xl" />
      </PageShell>
    );
  }

  if (!access?.canManageRoles) {
    return (
      <PageShell>
        <div className="mx-auto max-w-xl">
          <Panel title="Roles and permissions are limited to administrators">
            <p className="text-sm text-muted-foreground">
              Your account can't change what other people in this agency are allowed to see or do.
              The agency owner, or an admin they've granted access to, can.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to="/settings">Back to settings</Link>
            </Button>
          </Panel>
        </div>
      </PageShell>
    );
  }

  return <AgencyTeamPage />;
}
