import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "./login";
import { initSoloWorkspace } from "@/lib/billing.functions";
import { trackFunnel } from "@/lib/self-serve.functions";
import { useServerFn } from "@/hooks/use-server-fn";
import { useBillingCheckout } from "@/components/BillingCheckout";
import { PRICING } from "@/lib/billing/pricing";
import { cn } from "@/lib/utils";

type Plan = "solo" | "agency";

export const Route = createFileRoute("/signup")({
  validateSearch: (s: Record<string, unknown>): { plan?: Plan } => ({
    plan: s.plan === "agency" || s.plan === "solo" ? s.plan : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Get started — Agent Cloud" },
      { name: "description", content: "Create your Agent Cloud account and start running your insurance business today." },
      { property: "og:title", content: "Get started — Agent Cloud" },
      { property: "og:description", content: "Create your Agent Cloud account and start running your insurance business today." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignupPage,
});

const PLANS: Record<Plan, { name: string; price: number; perks: string[] }> = {
  solo: { name: "Solo Agent", price: PRICING.soloAgent, perks: ["Personal CRM & book of business", "Commission tracking", "Your production analytics"] },
  agency: { name: "Agency", price: PRICING.agencyBase, perks: ["Unlimited agents, no seat charges", "Hierarchy, overrides & contracting", "Licensing, Bankdocs, Release Center & your own Academy"] },
};

function SignupPage() {
  const search = Route.useSearch();
  const [plan, setPlan] = useState<Plan>(search.plan ?? "agency");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [withSampleData, setWithSampleData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const initFn = useServerFn(initSoloWorkspace);
  const track = useServerFn(trackFunnel);
  const checkout = useBillingCheckout({
    onPaid: () => {
      track({ data: { event: "paid" } }).catch(() => {});
      window.location.assign("/setup");
    },
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
  }, []);

  async function finish() {
    setBusy(true);
    try {
      await initFn({ data: { withSampleData, plan, agencyName: agencyName || undefined } });
      track({ data: { event: "checkout_opened" } }).catch(() => {});
      checkout.mutate({ product: plan === "agency" ? "agency_plan" : "solo_agent" } as any, {
        onError: () => window.location.assign("/setup"),
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/signup?plan=${plan}`,
        data: { full_name: `${firstName} ${lastName}`.trim(), first_name: firstName, last_name: lastName },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (!data.session) return setNeedsConfirm(true);
    await finish();
  }

  const p = PLANS[plan];

  return (
    <AuthShell title="Get started with Agent Cloud" subtitle="Sign up, pay, and set up your workspace in minutes.">
      {checkout.element}
      <div className="mb-5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Plan">
        {(Object.keys(PLANS) as Plan[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={plan === k}
            onClick={() => setPlan(k)}
            className={cn(
              "rounded-[var(--radius)] border p-3 text-left transition-colors",
              plan === k ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
            )}
          >
            <div className="text-sm font-semibold">{PLANS[k].name}</div>
            <div className="text-xs text-muted-foreground">${PLANS[k].price}/month</div>
          </button>
        ))}
      </div>
      <ul className="mb-5 space-y-1.5 text-sm text-muted-foreground">
        {p.perks.map((x) => (
          <li key={x} className="flex items-start gap-2"><Check className="h-4 w-4 text-success mt-0.5 shrink-0" /> {x}</li>
        ))}
      </ul>

      {needsConfirm ? (
        <p className="text-sm text-muted-foreground">Check your email to confirm your account. The link brings you back here to pay and finish setup.</p>
      ) : authed ? (
        <div className="space-y-3">
          {plan === "agency" && (
            <div className="space-y-2">
              <Label htmlFor="ag">Agency name</Label>
              <Input id="ag" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} />
            </div>
          )}
          <Button variant="ink" className="w-full" onClick={finish} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Continue to payment — $${p.price}/mo`}
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="fn">First name</Label><Input id="fn" required value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="ln">Last name</Label><Input id="ln" required value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
          </div>
          {plan === "agency" && (
            <div className="space-y-2"><Label htmlFor="ag">Agency name</Label><Input id="ag" required value={agencyName} onChange={(e) => setAgencyName(e.target.value)} /></div>
          )}
          <div className="space-y-2"><Label htmlFor="em">Email</Label><Input id="em" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="pw">Password</Label><Input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius)] border border-border p-3">
            <Checkbox checked={withSampleData} onCheckedChange={(v) => setWithSampleData(v === true)} className="mt-0.5" />
            <span className="text-sm">Add sample data so I can look around<span className="block text-xs text-muted-foreground">Labelled "Sample" and removable in one click.</span></span>
          </label>
          <Button type="submit" variant="ink" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Continue to payment — $${p.price}/mo`}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Bigger team (25+ agents)? <Link to="/demo" className="underline">Book a demo</Link> · Have an account? <Link to="/login" className="underline">Sign in</Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
