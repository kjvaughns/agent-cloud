import { createFileRoute } from "@tanstack/react-router";
import { ContractingSettingsPanel } from "@/components/settings/contracting-settings-panel";
import { ConfigPageGuard } from "@/components/settings/config-guard";

/**
 * Settings ▸ How Contracting Works — approval rules, who can request, timing,
 * licensing policy, and the audit log.
 */
export const Route = createFileRoute("/_authenticated/settings/contracting")({
  component: ContractingSettingsPage,
  head: () => ({ meta: [{ title: "How Contracting Works | Settings | Agent Cloud" }] }),
});

function ContractingSettingsPage() {
  return (
    <ConfigPageGuard>
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">How Contracting Works</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Who can request, what needs approval, and how fast requests should move.
          </p>
        </div>
        <ContractingSettingsPanel />
      </div>
    </ConfigPageGuard>
  );
}
