import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ContractingSettingsPanel } from "@/components/settings/contracting-settings-panel";
import { ConfigPageGuard } from "@/components/settings/config-guard";
import { SetupChecklist } from "@/components/settings/setup-checklist";
import { getContractingSetupStatus } from "@/lib/settings/setup.functions";

/**
 * Settings ▸ How Contracting Works — the setup checklist, then approval rules,
 * who can request, timing, licensing policy, and the audit log.
 *
 * The checklist leads because it is the thing an owner needs first and the
 * thing nothing told them: the five setup screens all existed and nothing said
 * which order to do them in or whether the result would actually pay a deal.
 */
export const Route = createFileRoute("/_authenticated/settings/contracting")({
  component: ContractingSettingsPage,
  head: () => ({ meta: [{ title: "How Contracting Works | Settings | Agent Cloud" }] }),
});

function ContractingSettingsPage() {
  const { data: setup } = useQuery({
    queryKey: ["settings", "contracting-setup"],
    queryFn: () => getContractingSetupStatus(),
  });

  return (
    <ConfigPageGuard>
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">How Contracting Works</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Who can request, what needs approval, and how fast requests should move.
          </p>
        </div>

        {setup?.available && (
          <SetupChecklist steps={setup.steps} progress={setup.progress} ready={setup.ready} />
        )}

        <ContractingSettingsPanel />
      </div>
    </ConfigPageGuard>
  );
}
