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
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return; }
      if (_cachedUserId === data.user.id && _cachedRole) {
        setRole(_cachedRole);
        setLoading(false);
        return;
      }
      const { data: rows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id);
      const roles = (rows ?? []).map((r: any) => r.role as AppRole);

      let resolved: AppRole = "agent";
      for (const r of ROLE_PRIORITY) {
        if (roles.includes(r)) { resolved = r; break; }
      }

      _cachedRole = resolved;
      _cachedUserId = data.user.id;
      setRole(resolved);
      setLoading(false);
    });
  }, []);

  const isSuperAdmin  = role === "super_admin";
  const isAgencyOwner = role === "agency_owner" || role === "super_admin" || role === "admin";
  const isManager     = role === "manager" || role === "agency_owner" || role === "super_admin" || role === "admin";
  const isStaff       = role === "staff";
  // backward compat — legacy 'admin' enum value is treated as agency-owner-level admin
  const isAdmin       = role === "super_admin" || role === "agency_owner" || role === "admin";

  return {
    role,
    isSuperAdmin,
    isAgencyOwner,
    isManager,
    isAdmin,
    isStaff,
    loading,
    canInviteAgencyOwner: isSuperAdmin || isAgencyOwner,
    canInviteManager:     isManager,
    canInviteAgent:       true,
    canInviteStaff:       true,
  };
}

export async function requireSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Forbidden: super admin required");
}

export async function requireAgencyOwnerOrAbove(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles").select("role").eq("user_id", userId)
    .in("role", ["admin"]).maybeSingle();
  if (!data) throw new Error("Forbidden: agency owner or above required");
}

export async function requireManagerOrAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles").select("role").eq("user_id", userId)
    .in("role", ["admin", "manager"]).maybeSingle();
  if (!data) throw new Error("Forbidden: manager or above required");
}

// backward compat
export async function requireAdmin(supabase: any, userId: string) {
  return requireAgencyOwnerOrAbove(supabase, userId);
}

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    _cachedRole = null;
    _cachedUserId = null;
  }
});
