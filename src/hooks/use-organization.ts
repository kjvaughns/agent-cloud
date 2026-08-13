import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Organization {
  id: string; name: string; slug: string;
  logo_url: string | null; accent_color: string;
  tagline: string | null; custom_domain: string | null; owner_id: string | null;
  plan_type: string | null;
}

/**
 * The signed-in user's agency.
 *
 * On React Query under the `["organization"]` key deliberately: saving on
 * Agency settings invalidates exactly that key, and while this hook kept the
 * org in local `useState` nothing was listening — a new logo or accent colour
 * only appeared after a full page reload, which read as the save not having
 * worked.
 */
async function fetchOrganization(): Promise<Organization | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles").select("organization_id").eq("id", user.id).maybeSingle() as any;

  const orgId = (profile as any)?.organization_id;
  if (!orgId) return null;

  const { data: orgData } = await (supabase as any)
    .from("organizations")
    .select("id,name,slug,logo_url,accent_color,tagline,custom_domain,owner_id,plan_type")
    .eq("id", orgId)
    .maybeSingle();

  return (orgData as Organization) ?? null;
}

export function useOrganization() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["organization"],
    queryFn: fetchOrganization,
    staleTime: 60_000,
  });

  // Identity transitions only. `TOKEN_REFRESHED` fires roughly hourly and on
  // tab focus, and refetching the agency for it buys nothing.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") qc.invalidateQueries({ queryKey: ["organization"] });
      if (event === "SIGNED_OUT") qc.setQueryData(["organization"], null);
    });
    return () => subscription.unsubscribe();
  }, [qc]);

  return { org: data ?? null, loading: isLoading };
}
