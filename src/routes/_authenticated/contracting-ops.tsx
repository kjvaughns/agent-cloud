import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { PageShell, Panel } from "@/components/page-shell";
import { supabase } from "@/integrations/supabase/client";
import { requireSession } from "@/lib/require-session";

export const Route = createFileRoute("/_authenticated/contracting-ops")({
  component: ContractingOpsLayout,
  notFoundComponent: ContractingOpsDirectory,
  /**
   * Staff only.
   *
   * Every page under this layout was reachable by typing the URL. The
   * navigation registry hides the entry behind `unlock: "agency-admin"`, and
   * `/licensing` picks between the staff view and the agent view with a
   * client-side branch — but neither is a guard. A hidden link is not a closed
   * door, and a bookmark, a shared URL or a deep link from the work inbox all
   * bypassed both.
   *
   * Same shape as `settings.agency.tsx`: `limit(1)` rather than
   * `maybeSingle()`, because an owner legitimately holds several of these roles
   * at once and `maybeSingle()` errors on more than one row.
   *
   * This is the outer layer. The server functions underneath do their own
   * checks and are the real boundary — this only stops the page rendering at
   * all, which is what makes a stale bookmark land somewhere sensible instead
   * of on a staff console.
   */
  beforeLoad: async () => {
    const session = await requireSession();
    const [{ data: roleRows }, { data: perms }] = await Promise.all([
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .in("role", ["super_admin", "agency_owner", "admin", "manager"] as any)
        .limit(1),
      supabase
        .from("role_permissions")
        .select("staff_is_admin, staff_view_contracts, contracting_manage_licenses, contracting_manage_carriers, contracting_view_sensitive_docs")
        .eq("profile_id", session.user.id)
        .limit(1),
    ]);

    // Contracting staff are not admins and hold no user_roles row — they are
    // granted through role_permissions, so checking roles alone would lock out
    // exactly the people whose job this is.
    //
    // `staff_view_contracts` belongs in this list. The four `contracting_*`
    // flags are set by a SQL backfill, while the contracting_specialist preset
    // in STAFF_PRESETS grants `staff_view_contracts` and none of them — so a
    // specialist configured through the UI was bounced from the workspace the
    // sidebar had just offered them. Same gap, in the guard rather than the nav.
    const p = (perms ?? [])[0] as Record<string, boolean> | undefined;
    const isStaff = Boolean(
      p && (p.staff_is_admin || p.staff_view_contracts || p.contracting_manage_licenses ||
            p.contracting_manage_carriers || p.contracting_view_sensitive_docs),
    );

    if (!roleRows?.length && !isStaff) {
      // /licensing, not /dashboard: somebody who lands here almost always
      // wanted their own licences, and that page renders for everyone.
      throw redirect({ to: "/licensing" as any });
    }
  },
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
  { to: "/settings/carriers", label: "Carriers & Comp", blurb: "Carrier setup, submission methods, comp levels and grids — under Settings." },
  { to: "/contracting-ops/import", label: "Import records", blurb: "Bring contracting records in from a spreadsheet or carrier report." },
  { to: "/settings/templates", label: "Submission templates", blurb: "Email and spreadsheet formats each carrier expects — under Settings." },
  { to: "/settings/contracting", label: "How contracting works", blurb: "Agency defaults: PDB refresh cadence, priorities, due dates — under Settings." },
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
