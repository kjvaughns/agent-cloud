import { createFileRoute, Navigate } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyAccess } from "@/hooks/use-my-access";
import { MyLicensesView } from "@/components/licensing/my-licenses";

/**
 * Licensing — one entry point, two jobs.
 *
 * "Where are my licences?" and "whose licences are expiring?" are different
 * screens, but they were also different *names* filed in unrelated places:
 * Resources → State Licenses for one, Contracting → Licensing for the other.
 * That is the part that made it hard. Now everybody clicks Licensing and
 * lands on the one that matches their job.
 *
 * People who run licensing for the agency go to the roster, inside the
 * contracting workspace where the rest of their queue lives. Everybody else
 * gets their own licences.
 */
export const Route = createFileRoute("/_authenticated/licensing")({
  head: () => ({ meta: [{ title: "Licensing — Agent Cloud" }] }),
  component: LicensingPage,
});

function LicensingPage() {
  const { access, loading } = useMyAccess();

  if (loading) {
    return (
      <PageShell>
        <Skeleton className="h-64 rounded-xl" />
      </PageShell>
    );
  }

  const a = access as any;
  const p = a?.permissions ?? {};
  const managesLicensing =
    Boolean(a?.canManageRoles) || Boolean(a?.isOwner) ||
    (a?.role === "staff" && Boolean(p.contracting_manage_licenses));

  if (managesLicensing) {
    return <Navigate to="/contracting-ops/licensing" replace />;
  }

  return <MyLicensesView />;
}
