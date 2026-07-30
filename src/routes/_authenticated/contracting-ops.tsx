import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { ContractingNav } from "@/components/contracting/nav";

export const Route = createFileRoute("/_authenticated/contracting-ops")({
  component: ContractingOpsLayout,
  head: () => ({ meta: [{ title: "Contracting Operations | Agent Cloud" }] }),
});

function ContractingOpsLayout() {
  return (
    <PageShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Contracting Operations</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Licensing, carrier contracting, writing numbers, compensation and hierarchy — prepared
            here, submitted through whichever system each carrier requires.
          </p>
        </div>

        {/* The rail is a column on desktop and a select above the content on a
            phone, so the fourteen surfaces never become a horizontal scroll. */}
        <div className="lg:grid lg:grid-cols-[188px_minmax(0,1fr)] lg:gap-6">
          <ContractingNav />
          <div className="mt-4 min-w-0 lg:mt-0">
            <Outlet />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
