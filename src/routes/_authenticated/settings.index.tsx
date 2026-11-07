import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMyAccess } from "@/hooks/use-my-access";
import { PageShell } from "@/components/page-shell";
import { PageSkeleton } from "@/components/page-skeleton";

/** /settings opens Agency settings for people who run the agency, Billing for solo agents, Notifications otherwise. */
export const Route = createFileRoute("/_authenticated/settings/")({
  ssr: false,
  component: SettingsLanding,
});

function SettingsLanding() {
  const { access, loading } = useMyAccess();
  if (loading) return <PageShell><PageSkeleton metrics={0} panels={1} /></PageShell>;
  if (access?.canEditAgencySettings && access?.inAgency) return <Navigate to="/settings/agency" replace />;
  if (access?.isOwner) return <Navigate to="/settings/billing" replace />;
  return <Navigate to="/settings/notifications" replace />;
}
