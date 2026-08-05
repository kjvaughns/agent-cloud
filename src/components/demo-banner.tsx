/**
 * "You are looking at a sample agency."
 *
 * On every page, for as long as the session lasts, and not dismissible. That
 * is deliberate: a banner you can close is a banner that is gone by the third
 * screen, and by then the visitor has been reading Marcus Webb's book of
 * business for ten minutes without being told it is invented. In insurance,
 * data mistaken for real is a compliance problem rather than an awkward
 * moment — and being honest about it is also the thing that makes the demo
 * trustworthy enough to be worth showing.
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type DemoOrg = { name: string } | null;

/**
 * Its own narrow query rather than a field on useOrganization.
 *
 * Adding `is_demo` to that hook's select list would fail the whole query with
 * 42703 in the window before the migration is applied, taking the org name and
 * white-label branding down with it on every authenticated page. Here, the
 * same error means one thing — no demo — and costs nothing.
 */
function useDemoOrg(): DemoOrg {
  const [demo, setDemo] = useState<DemoOrg>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await (supabase as any)
        .from("profiles").select("organization_id").eq("id", user.id).maybeSingle();
      const orgId = profile?.organization_id;
      if (!orgId) return;

      const { data, error } = await (supabase as any)
        .from("organizations")
        .select("name, is_demo")
        .eq("id", orgId)
        .maybeSingle();

      if (cancelled || error || !data?.is_demo) return;
      setDemo({ name: data.name ?? "a sample agency" });
    })();

    return () => { cancelled = true; };
  }, []);

  return demo;
}

export function DemoBanner() {
  const demo = useDemoOrg();
  if (!demo) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-primary/30 bg-primary/10 px-4 py-2 text-center text-sm">
      <span className="inline-flex items-center gap-1.5 font-medium">
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        You're exploring a sample agency — {demo.name}.
      </span>
      <span className="text-muted-foreground">
        Everything here is made-up data, and it resets nightly.
      </span>
      <Link to="/demo" className="font-medium text-primary underline-offset-2 hover:underline">
        Set your own agency up →
      </Link>
    </div>
  );
}
