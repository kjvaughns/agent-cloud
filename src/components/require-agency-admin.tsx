import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { PageShell, Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton } from "@/components/page-skeleton";
import { useMyAccess } from "@/hooks/use-my-access";

/**
 * "You administer this agency" — asked once, in one place.
 *
 * settings.agency.tsx and settings.roles.tsx each grew their own copy of this
 * check, which is fine for two and starts to rot at five: the sentence drifts,
 * one of them forgets the loading state, and a route added later copies
 * whichever it happened to open first.
 *
 * `canSeeAgency` is what `getMyAccess` computes for the sidebar, so a page
 * wrapped in this refuses on the same signal that decided whether to offer it.
 *
 * This is a rendering guard, not the boundary. The server functions behind
 * each page do their own checks and are what actually stops anything — this
 * stops a person being shown administration they cannot perform.
 */
export function RequireAgencyAdmin({
  children,
  title = "This page is limited to administrators",
  what,
  backTo = "/dashboard",
  backLabel = "Back to dashboard",
  /** Extra permission that also grants access, for pages a manager may hold. */
  alsoAllow,
}: {
  children: ReactNode;
  title?: string;
  /** Names what the person cannot reach, in their words. */
  what: string;
  backTo?: string;
  backLabel?: string;
  alsoAllow?: (perms: Record<string, any>) => boolean;
}) {
  const { access, loading } = useMyAccess();

  if (loading) {
    return (
      <PageShell>
        <PageSkeleton metrics={0} panels={1} />
      </PageShell>
    );
  }

  const perms = (access?.permissions ?? {}) as Record<string, any>;
  const allowed = Boolean(access?.canSeeAgency) || Boolean(alsoAllow?.(perms));

  if (!allowed) {
    return (
      <PageShell>
        <div className="mx-auto max-w-xl">
          <Panel title={title}>
            <p className="text-sm text-muted-foreground">{what}</p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to={backTo}>{backLabel}</Link>
            </Button>
          </Panel>
        </div>
      </PageShell>
    );
  }

  return <>{children}</>;
}
