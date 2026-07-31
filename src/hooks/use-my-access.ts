import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { getMyAccess, type MyAccess } from "@/lib/permissions.functions";

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
 * Nav visibility rules per role/permission. Items not listed are visible to all.
 * Hidden means hidden — no locked placeholders.
 */
export function canSeeNavItem(url: string, access: MyAccess | undefined): boolean {
  if (!access) return true; // until loaded, render default nav (agents are the common case)
  const { role, isSolo, isOwner, permissions: p } = access;
  // Server-computed: true for the org owner, agency_owner/admin in their own
  // org, and admin staff. isOwner alone is only organizations.owner_id, which
  // many real owners are not.
  const canManage = Boolean((access as any).canManageRoles) || isOwner;
  const isStaff = role === "staff" && !isOwner;
  const isManager = role === "manager" && !isOwner;

  const rules: Record<string, boolean> = {
    "/team": !isSolo && !isStaff,
    "/leaderboard": !isSolo && !isStaff,
    "/challenges": !isSolo && !isStaff,
    "/contracting/invite": isOwner || (isManager && !!p.mgr_manage_onboarding) || (!isManager && !isStaff && !isSolo),
    // Analytics merged into Reports; both paths carry the same gate while the
    // old one still redirects.
    "/reports": isStaff ? !!p.staff_view_analytics : isManager ? !!p.mgr_view_team_analytics : true,
    "/analytics": isStaff ? !!p.staff_view_analytics : isManager ? !!p.mgr_view_team_analytics : true,
    // The hub row follows the same gate as the pipeline it opens onto —
    // otherwise the hub is a way past the rule.
    "/clients": isStaff ? !!p.staff_view_clients : true,
    "/pipeline": isStaff ? !!p.staff_view_clients : true,
    "/book-of-business": isStaff ? !!p.staff_view_policies : true,
    "/post-deal": isStaff ? !!p.staff_post_policies : true,
    "/finances": isStaff ? !!p.staff_view_commissions : true,
    "/contracting/commission-grids": isStaff ? !!p.staff_view_commissions : true,
    "/contracting": isStaff ? !!p.staff_view_contracts : true,
    // The operations workspace is agency machinery, not an agent surface.
    // Agents reach their own requests through Contracts; this is for the
    // people who process them.
    "/contracting-ops": canManage
      || (isStaff && (!!p.staff_view_contracts || !!(p as any).contracting_manage_carriers
                      || !!(p as any).contracting_submit || !!(p as any).contracting_approve
                      || !!(p as any).contracting_assign_staff || !!(p as any).contracting_manage_licenses))
      || (isManager && !!p.mgr_submit_carrier_requests),
    "/contracting/transfers": isStaff ? !!p.staff_view_contracts : true,
    "/contracting/carriers": isStaff ? !!p.staff_view_contracts : true,
    "/contracting/annuity-training": !isStaff,
    "/back-office/recruiting-funnels": isStaff ? !!p.staff_view_recruiting : isManager ? !!p.mgr_access_recruiting : !isSolo,
    "/back-office/case-design": !isStaff,
    "/ai-assistant": isStaff ? !!p.staff_nova_pro_enabled : true,
    "/settings": true,
    "/settings/nova-pro": isStaff ? !!p.staff_nova_pro_enabled : true,
    "/settings/roles": canManage,
    // Both write agency-wide configuration, so they follow the owner gate.
    "/intake": canManage || (isStaff && !!p.staff_is_admin),
    "/contracting-ops/comp-grids": canManage,
    // The hub is for people who administer the agency; an agent has
    // nothing to do on it.
    "/agency": canManage || (isStaff && !!p.staff_is_admin),
    "/settings/usage": canManage,
    "/settings/agency": canManage,
    "/settings/automations": canManage,
    "/settings/emails": canManage,
    "/settings/white-label": canManage,
    "/white-label": canManage,
    "/settings/support": canManage,
    "/settings/integrations": canManage,
    "/phone": isStaff ? false : true,
  };
  return url in rules ? rules[url] : true;
}
