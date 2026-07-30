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
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Contracting Operations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Licensing, carrier contracting, writing numbers, compensation and hierarchy — prepared here,
            submitted through whichever system each carrier requires.
          </p>
        </div>
        <ContractingNav />
        <Outlet />
      </div>
    </PageShell>
  );
}
