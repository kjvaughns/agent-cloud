import { useRouterState } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { useMyAccess, canSeeNavItem } from "@/hooks/use-my-access";
import { AgencyNav, isAgencyHubPath } from "@/components/agency/nav";

/**
 * Keeps the Agency rail on screen while you move around the hub.
 *
 * Contracting Operations gets this for free: every page it lists is a child of
 * its layout route, so the rail is part of the frame. The Agency hub's pages
 * are top-level — /team, /leaderboard, /retention — because agents reach the
 * leaderboard and challenges from their own sidebar, and staff reach
 * retention. Re-parenting them under /agency would drag all of those people
 * into a frame that is not theirs.
 *
 * So the frame is applied by path instead of by nesting, and only for people
 * who actually have the hub. An agent opening the leaderboard from their own
 * sidebar sees the page; an owner opening it from the Agency rail sees it with
 * the rail still there, and can carry on cycling through.
 *
 * The heading belongs to the overview alone. Every other page in the hub has
 * its own, and stacking "Agency Admin" above "Team Command Center" on each one
 * would be a label repeated rather than a place explained.
 */
export function AgencyFrame({ children }: { children: React.ReactNode }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { access } = useMyAccess();

  const inHub = isAgencyHubPath(path);
  // The same gate the sidebar uses, so the rail appears exactly for the people
  // whose sidebar offers them the hub in the first place.
  const hasHub = canSeeNavItem("/agency", access);

  if (!inHub || !hasHub) return <>{children}</>;

  const isOverview = path === "/agency" || path === "/agency/";

  return (
    <PageShell>
      <div className="space-y-4">
        {isOverview && (
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Agency Admin</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Your people — who is here, who is joining, how they are doing, and who is at risk of
              leaving. Configuration lives in Settings, contracting in Contracting Operations.
            </p>
          </div>
        )}

        <div className="lg:grid lg:grid-cols-[188px_minmax(0,1fr)] lg:gap-6">
          <AgencyNav />
          {/* PageShell is nesting-aware, so each page's own shell collapses in
              here instead of doubling the padding. */}
          <div className="mt-4 min-w-0 lg:mt-0">{children}</div>
        </div>
      </div>
    </PageShell>
  );
}
