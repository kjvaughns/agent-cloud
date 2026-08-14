import { createFileRoute } from "@tanstack/react-router";
import { TemplatesPanel } from "@/components/settings/templates-panel";
import { ConfigPageGuard } from "@/components/settings/config-guard";

/** Settings ▸ Submission Templates — email and spreadsheet templates per carrier. */
export const Route = createFileRoute("/_authenticated/settings/templates")({
  component: TemplatesSettingsPage,
  head: () => ({ meta: [{ title: "Submission Templates | Settings | Agent Cloud" }] }),
});

function TemplatesSettingsPage() {
  return (
    <ConfigPageGuard>
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Submission Templates</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The email bodies and spreadsheet layouts submission packets are generated from.
          </p>
        </div>
        <TemplatesPanel />
      </div>
    </ConfigPageGuard>
  );
}
