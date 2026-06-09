import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Organization {
  id:            string;
  name:          string;
  slug:          string;
  logo_url:      string | null;
  accent_color:  string;
  tagline:       string | null;
  custom_domain: string | null;
  owner_id:      string | null;
}

let _cachedOrg: Organization | null = null;
let _cachedUserId: string | null = null;

export function useOrganization() {
  const [org, setOrg] = useState<Organization | null>(_cachedOrg);
  const [loading, setLoading] = useState(_cachedOrg === null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return; }
      if (_cachedUserId === data.user.id && _cachedOrg) {
        setOrg(_cachedOrg);
        setLoading(false);
        return;
      }

      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("organization_id")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!profile?.organization_id) { setLoading(false); return; }

      const { data: orgData } = await (supabase as any)
        .from("organizations")
        .select("id, name, slug, logo_url, accent_color, tagline, custom_domain, owner_id")
        .eq("id", profile.organization_id)
        .maybeSingle();

      if (orgData) {
        _cachedOrg = orgData as Organization;
        _cachedUserId = data.user.id;
        setOrg(_cachedOrg);
      }
      setLoading(false);
    });
  }, []);

  return { org, loading };
}

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    _cachedOrg = null;
    _cachedUserId = null;
  }
});
