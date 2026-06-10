import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "agency_owner" | "admin" | "manager" | "agent" | "staff";

const ROLE_PRIORITY: AppRole[] = ["super_admin", "agency_owner", "admin", "manager", "agent", "staff"];

let _cachedRole: AppRole | null = null;
let _cachedUserId: string | null = null;

export function useRole() {
  const [role, setRole] = useState<AppRole | null>(_cachedRole);
  const [loading, setLoading] = useState(_cachedRole === null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelled) return;
      if (!data.user) { setLoading(false); return; }
      if (_cachedUserId === data.user.id && _cachedRole !== null) {
        setRole(_cachedRole); setLoading(false); return;
      }
      const { data: rows } = await supabase
        .from("user_roles").select("role").eq("user_id", data.user.id);
      if (cancelled) return;
      const roles = (rows ?? []).map((r: any) => r.role as AppRole);

      let resolved: AppRole | null = null;
      for (const r of ROLE_PRIORITY) {
        if (roles.includes(r)) { resolved = r; break; }
      }
      if (!resolved && roles.length > 0) resolved = "agent";

      _cachedRole = resolved;
      _cachedUserId = data.user.id;
      setRole(resolved);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") { _cachedRole = null; _cachedUserId = null; }
  });

  const isSuperAdmin  = role === "super_admin";
  const isAgencyOwner = role === "agency_owner" || role === "super_admin";
  const isAdmin       = role === "super_admin" || role === "agency_owner" || role === "admin";
  const isManager     = role === "manager" || isAdmin;
  const isStaff       = role === "staff";
  const hasNoRole     = role === null && !loading;

  return {
    role, loading, isSuperAdmin, isAgencyOwner, isManager, isAdmin, isStaff, hasNoRole,
    canInviteAgencyOwner: isSuperAdmin || isAgencyOwner,
    canInviteManager: isManager,
    canInviteAgent: true,
    canInviteStaff: true,
  };
}

export async function requireSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role")
    .eq("user_id", userId).eq("role", "super_admin").maybeSingle();
  if (!data) throw new Error("Forbidden: super admin required");
}

export async function requireAgencyOwnerOrAbove(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role")
    .eq("user_id", userId).in("role", ["super_admin", "agency_owner", "admin"]).maybeSingle();
  if (!data) throw new Error("Forbidden: agency owner or above required");
}

export async function requireManagerOrAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role")
    .eq("user_id", userId).in("role", ["super_admin", "agency_owner", "admin", "manager"]).maybeSingle();
  if (!data) throw new Error("Forbidden: manager or above required");
}

export async function requireAdmin(supabase: any, userId: string) {
  return requireAgencyOwnerOrAbove(supabase, userId);
}
