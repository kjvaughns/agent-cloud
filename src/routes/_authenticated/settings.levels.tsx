import { createFileRoute } from "@tanstack/react-router";
import { LevelsPanel } from "@/components/contracting/levels-panel";
import { ConfigPageGuard } from "@/components/settings/config-guard";

/** Settings ▸ Levels & Positions — the agency's promotion ladder. */
export const Route = createFileRoute("/_authenticated/settings/levels")({
  component: LevelsSettingsPage,
  head: () => ({ meta: [{ title: "Levels & Positions | Settings | Agent Cloud" }] }),
});

function LevelsSettingsPage() {
  return (
    <ConfigPageGuard>
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Levels &amp; Positions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your ladder — one simple list used for invites, promotions, and permissions.
          </p>
        </div>
        <LevelsPanel />
      </div>
    </ConfigPageGuard>
  );
}
