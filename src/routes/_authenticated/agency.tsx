import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { AgencyNav } from "@/components/agency/nav";

export const Route = createFileRoute("/_authenticated/agency")({
  component: AgencyLayout,
  head: () => ({ meta: [{ title: "Agency Admin | Agent Cloud" }] }),
});

/**
 * Agency Admin, laid out like Contracting Operations: an overview, and a
 * grouped rail for everything you configure.
 *
 * The heading lives here rather than on each page so it stays put while the
 * content beside it changes — the rail and the title are the frame, not part
 * of any one page.
 */
function AgencyLayout() {
  return (
    <PageShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Agency Admin</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Everything you run the agency with. The surfaces people work in every day stay in the
            sidebar; what you set up once lives here.
          </p>
        </div>

        <div className="lg:grid lg:grid-cols-[188px_minmax(0,1fr)] lg:gap-6">
          <AgencyNav />
          <div className="mt-4 min-w-0 lg:mt-0">
            <Outlet />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
