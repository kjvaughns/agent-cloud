import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "agent" | "manager" | "admin";

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
      const resolved: AppRole = roles.includes("admin")
        ? "admin"
        : roles.includes("manager")
        ? "manager"
        : "agent";
      _cachedRole = resolved;
      _cachedUserId = data.user.id;
      setRole(resolved);
      setLoading(false);
    });
  }, []);

  return { role, isAdmin: role === "admin", isManager: role === "manager" || role === "admin", loading };
}

export async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin role required");
}

export async function requireManagerOrAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "manager"])
    .maybeSingle();
  if (!data) throw new Error("Forbidden: manager or admin role required");
}
