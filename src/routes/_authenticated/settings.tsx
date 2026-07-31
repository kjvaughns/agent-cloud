import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
  head: () => ({ meta: [{ title: "Settings — Agent Cloud" }] }),
});

/** Sections hang off the sidebar's Settings entry rather than a second rail. */
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
        <Outlet />
      </div>
    </PageShell>
  );
}
