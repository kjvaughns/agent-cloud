import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/contracting-ops")({
  component: ContractingOpsLayout,
  head: () => ({ meta: [{ title: "Contracting Operations | Agent Cloud" }] }),
});

/**
 * The rail that used to sit beside this content now hangs off the sidebar's
 * Contracting entry. One navigation column instead of two, and the page keeps
 * its full width.
 */
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
        <Outlet />
      </div>
    </PageShell>
  );
}
