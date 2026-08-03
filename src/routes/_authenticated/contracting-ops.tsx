import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { PageShell, Panel } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/contracting-ops")({
  component: ContractingOpsLayout,
  notFoundComponent: ContractingOpsDirectory,
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

/**
 * Every section, for anybody who arrived at a URL that has no page.
 *
 * A staff audit reported six contracting-ops subroutes as broken. None of them
 * were linked from anywhere — they were reasonable guesses at names
 * (`/hierarchy`, `/pipeline`, `/compliance`) for pages that exist under other
 * ones. The common guesses are redirects now; this catches the rest and answers
 * the question the guess was asking, instead of showing a blank Not Found in a
 * shell that promises a workspace.
 */
const SECTIONS: { to: string; label: string; blurb: string }[] = [
  { to: "/contracting-ops", label: "Overview", blurb: "Where every agent stands, and what needs attention today." },
  { to: "/contracting-ops/queue", label: "Today's Work", blurb: "The staff queue: what is overdue, unassigned or ready to submit." },
  { to: "/contracting-ops/requests", label: "Contract Requests", blurb: "Every request, plus writing numbers, hierarchy and change requests." },
  { to: "/contracting-ops/licensing", label: "Licensing & PDB", blurb: "State licences, expirations, PDB reports and regulatory review." },
  { to: "/contracting-ops/documents", label: "Documents", blurb: "What each producer has on file, and what is missing or expired." },
  { to: "/contracting-ops/carriers", label: "Carriers & Comp", blurb: "Carrier setup, submission methods, comp levels and grids." },
  { to: "/contracting-ops/import", label: "Import records", blurb: "Bring contracting records in from a spreadsheet or carrier report." },
  { to: "/contracting-ops/templates", label: "Submission templates", blurb: "Email and spreadsheet formats each carrier expects." },
  { to: "/contracting-ops/settings", label: "Contracting settings", blurb: "Agency defaults: PDB refresh cadence, priorities, due dates." },
];

function ContractingOpsDirectory() {
  return (
    <PageShell>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Contracting Operations</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Compass className="h-4 w-4 shrink-0 text-primary" />
            That page doesn't exist here. These do.
          </p>
        </div>
        <Panel pad={false}>
          <ul className="divide-y divide-border-soft">
            {SECTIONS.map((s) => (
              <li key={s.to}>
                <Link to={s.to} className="block px-4 py-3 transition-colors hover:bg-surface-2/40">
                  <span className="block text-sm font-medium text-foreground">{s.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{s.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <p className="text-[11px] text-text-dim">
          Some sections depend on your permissions — your agency owner can grant more.
        </p>
      </div>
    </PageShell>
  );
}
