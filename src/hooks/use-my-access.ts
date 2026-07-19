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
  const isStaff = role === "staff" && !isOwner;
  const isManager = role === "manager" && !isOwner;

  const rules: Record<string, boolean> = {
    "/team": !isSolo && !isStaff,
    "/leaderboard": !isSolo && !isStaff,
    "/challenges": !isSolo && !isStaff,
    "/contracting/invite": isOwner || (isManager && !!p.mgr_manage_onboarding) || (!isManager && !isStaff && !isSolo),
    "/analytics": isStaff ? !!p.staff_view_analytics : isManager ? !!p.mgr_view_team_analytics : true,
    "/pipeline": isStaff ? !!p.staff_view_clients : true,
    "/book-of-business": isStaff ? !!p.staff_view_policies : true,
    "/post-deal": isStaff ? !!p.staff_post_policies : true,
    "/finances": isStaff ? !!p.staff_view_commissions : true,
    "/contracting/commission-grids": isStaff ? !!p.staff_view_commissions : true,
    "/contracting": isStaff ? !!p.staff_view_contracts : true,
    "/contracting/transfers": isStaff ? !!p.staff_view_contracts : true,
    "/contracting/carriers": isStaff ? !!p.staff_view_contracts : true,
    "/contracting/annuity-training": !isStaff,
    "/back-office/recruiting-funnels": isStaff ? !!p.staff_view_recruiting : isManager ? !!p.mgr_access_recruiting : !isSolo,
    "/back-office/case-design": !isStaff,
    "/ai-assistant": isStaff ? !!p.staff_nova_pro_enabled : true,
    "/settings/nova-pro": isStaff ? !!p.staff_nova_pro_enabled : true,
    "/agency/team": isOwner || (isStaff && !!p.staff_is_admin && !!p.admin_manage_staff_configs),
    "/phone": isStaff ? false : true,
  };
  return url in rules ? rules[url] : true;
}
