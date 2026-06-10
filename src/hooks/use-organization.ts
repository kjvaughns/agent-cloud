import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Organization {
  id: string; name: string; slug: string;
  logo_url: string | null; accent_color: string;
  tagline: string | null; custom_domain: string | null; owner_id: string | null;
}

export function useOrganization() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadOrg() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: profile } = await supabase
      .from("profiles").select("organization_id").eq("id", user.id).maybeSingle() as any;

    if (!(profile as any)?.organization_id) { setLoading(false); setOrg(null); return; }

    const { data: orgData } = await (supabase as any)
      .from("organizations")
      .select("id,name,slug,logo_url,accent_color,tagline,custom_domain,owner_id")
      .eq("id", (profile as any).organization_id)
      .maybeSingle();

    setOrg((orgData as Organization) ?? null);
    setLoading(false);
  }

  useEffect(() => {
    loadOrg();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") loadOrg();
      if (event === "SIGNED_OUT") { setOrg(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  return { org, loading };
}
