import { useMyAccess } from "@/hooks/use-my-access";
import { Panel } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Who may open the agency-configuration pages under Settings.
 *
 * The same audience the Contracting Operations layout admits, kept as one
 * list so the five moved pages cannot drift apart: the owner and role-holders
 * (canEditAgencySettings covers owner + canManageRoles), the admin/manager
 * roles, and staff granted any contracting permission. What each person may
 * *change* is a separate question the pages answer themselves — every server
 * function re-checks, and the panels render read-only without edit rights.
 *
 * This is a visibility courtesy, not a security boundary — the pattern the
 * agency-settings page documents: guard in the component with an explanation,
 * enforce on the server.
 */
export function useCanViewAgencyConfig(): { allowed: boolean; loading: boolean } {
  const { access, loading } = useMyAccess();
  const perms = (access?.permissions ?? {}) as Record<string, unknown>;
  const allowed =
    Boolean(access?.canEditAgencySettings) ||
    ["super_admin", "agency_owner", "admin", "manager"].includes(access?.role ?? "") ||
    Boolean(perms.staff_is_admin) ||
    Boolean(perms.staff_view_contracts) ||
    Boolean(perms.contracting_manage_carriers) ||
    Boolean(perms.contracting_manage_licenses) ||
    Boolean(perms.contracting_view_sensitive_docs);
  return { allowed, loading };
}

export function ConfigPageGuard({ children }: { children: React.ReactNode }) {
  const { allowed, loading } = useCanViewAgencyConfig();

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </div>
    );
  }
  if (!allowed) {
    return (
      <Panel title="Agency configuration">
        <p className="text-sm text-muted-foreground">
          This page configures how your agency runs, and your account doesn't have access to it.
          The agency owner — or staff granted a contracting permission under Roles &amp;
          permissions — can open it.
        </p>
      </Panel>
    );
  }
  return <>{children}</>;
}
