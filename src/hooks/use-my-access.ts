import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { getMyAccess, type MyAccess } from "@/lib/permissions.functions";
import { audienceFor, type NavContext } from "@/lib/navigation";
import { useScopeCapabilities } from "@/hooks/use-scope";

/** Role + configurable permissions for the signed-in user (drives nav + billing UI). */
export function useMyAccess(): { access: MyAccess | undefined; loading: boolean } {
  const fn = useServerFn(getMyAccess);
  const { data, isLoading } = useQuery({
    queryKey: ["my-access"],
    queryFn: () => fn(),
    staleTime: 30_000, // permission changes take effect on next page load
  });
  return { access: data, loading: isLoading };
}

/**
 * Everything the navigation registry needs, in one object.
 *
 * There used to be a second gate here — a URL-to-boolean rules table that the
 * sidebar consulted *after* the registry had already decided. Two overlapping
 * systems had to be kept in step by hand, and they drifted: a group whose only
 * item the rules table removed still rendered its heading, because the
 * registry had dropped empty groups before the rules ran. One gate now, in
 * navigation.ts, so that cannot happen again.
 *
 * Worth being clear about what this is: it decides what to *show*. It was
 * never a security boundary and is not one now — the database decides what
 * anybody may read.
 */
export function useNavContext(): NavContext {
  const { access } = useMyAccess();
  // Already cached for the session by the scope toggle, so asking here costs
  // nothing. It is what decides whether My Agents is worth a row.
  const { caps } = useScopeCapabilities();
  const perms = (access?.permissions ?? {}) as Record<string, unknown>;
  return {
    audience: audienceFor({ role: access?.role ?? null }),
    inAgency: Boolean(access?.inAgency),
    canSeeAgency: Boolean(access?.canSeeAgency),
    downlineCount: caps.downlineCount,
    isPending: Boolean(access?.isPending),
    // The same four keys can_work_tickets() checks in the database, plus the
    // administrator path it folds in via is_org_admin().
    canWorkTickets:
      Boolean(access?.canSeeAgency) ||
      Boolean(perms.mgr_respond_tickets) ||
      Boolean(perms.staff_view_all_tickets) ||
      Boolean(perms.staff_respond_tickets) ||
      Boolean(perms.admin_view_agency_tickets),
    perms,
  };
}
