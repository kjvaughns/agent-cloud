import { createFileRoute } from "@tanstack/react-router";
import { ManageGridsPage } from "@/components/contracting/manage-grids";
import { ConfigPageGuard } from "@/components/settings/config-guard";

/** Settings ▸ Comp Grids — what each carrier pays, by level, by product. */
export const Route = createFileRoute("/_authenticated/settings/comp-grids")({
  component: CompGridsSettingsPage,
  head: () => ({ meta: [{ title: "Comp Grids | Settings | Agent Cloud" }] }),
});

function CompGridsSettingsPage() {
  return (
    <ConfigPageGuard>
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Comp Grids</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            What each carrier pays, by level and product. Every payout forecast reads these numbers.
          </p>
        </div>
        <ManageGridsPage embedded />
      </div>
    </ConfigPageGuard>
  );
}
