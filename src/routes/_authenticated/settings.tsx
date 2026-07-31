import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { SettingsNav } from "@/components/settings/nav";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
  head: () => ({ meta: [{ title: "Settings — Agent Cloud" }] }),
});

/**
 * Settings, laid out like Contracting Operations and Agency.
 *
 * A real layout route rather than the path-matched frame the Agency hub needs,
 * because every page in this hub genuinely lives under /settings — so the rail
 * comes for free and can never fall off.
 */
function SettingsLayout() {
  return (
    <PageShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Your account, your subscription, and how the workspace is set up.
          </p>
        </div>

        <div className="lg:grid lg:grid-cols-[188px_minmax(0,1fr)] lg:gap-6">
          <SettingsNav />
          <div className="mt-4 min-w-0 lg:mt-0">
            <Outlet />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
