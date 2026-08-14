import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CarrierDirectoryPage } from "@/components/contracting/carrier-setup";
import { ConfigPageGuard } from "@/components/settings/config-guard";

/**
 * Settings ▸ Carriers — which carriers the agency works with and how each
 * takes submissions. Configuration lives in Settings; the daily contracting
 * work (requests, licensing, documents) stays in Contracting Ops.
 */
export const Route = createFileRoute("/_authenticated/settings/carriers")({
  component: CarriersSettingsPage,
  head: () => ({ meta: [{ title: "Carriers | Settings | Agent Cloud" }] }),
});

function CarriersSettingsPage() {
  const navigate = useNavigate();
  return (
    <ConfigPageGuard>
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Carriers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The carriers your agency works with. Set each one up here, then its{" "}
            <Link to="/settings/levels" data-tour="carrier-comp" className="text-primary hover:underline">levels</Link>
            {" "}and{" "}
            <Link to="/settings/comp-grids" className="text-primary hover:underline">commission grid</Link>.
          </p>
        </div>
        <CarrierDirectoryPage onConfigureLevels={() => navigate({ to: "/settings/levels" })} />
      </div>
    </ConfigPageGuard>
  );
}
