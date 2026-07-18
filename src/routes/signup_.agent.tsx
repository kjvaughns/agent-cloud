import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "./login";
import { initSoloWorkspace, createCheckoutSession } from "@/lib/billing.functions";
import { useServerFn } from "@/hooks/use-server-fn";

export const Route = createFileRoute("/signup_/agent")({
  head: () => ({ meta: [{ title: "Solo Agent Signup — Agent Cloud" }] }),
  component: SoloSignupPage,
});

const PERKS = [
  "Full Nova AI Pro — number, automations, retention alerts",
  "Personal CRM & book of business",
  "Commission tracker & policy management",
  "Your own production analytics",
];

function SoloSignupPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const initFn = useServerFn(initSoloWorkspace);
  const checkoutFn = useServerFn(createCheckoutSession);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
  }, []);

  async function completeSetup() {
    setBusy(true);
    try {
      await initFn();
      const r: any = await checkoutFn({ data: { product: "solo_agent" } });
      if (r?.url) {
        window.location.assign(r.url);
        return;
      }
      window.location.assign("/dashboard");
    } catch (e: any) {
      if (String(e?.message ?? "").includes("not configured")) {
        toast.info("Workspace created — billing activates once Stripe is connected.");
        window.location.assign("/dashboard");
      } else {
        toast.error(e?.message ?? "Setup failed");
        setBusy(false);
      }
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: `${firstName} ${lastName}`.trim(), first_name: firstName, last_name: lastName } },
    });
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    if (!data.session) {
      setBusy(false);
      setNeedsConfirm(true);
      return;
    }
    await completeSetup();
  }

  return (
    <AuthShell title="Start as a Solo Agent" subtitle="$79/month — the full platform plus Nova AI Pro, no invite needed">
      <ul className="mb-5 space-y-1.5 text-sm text-muted-foreground">
        {PERKS.map((p) => (
          <li key={p} className="flex items-start gap-2">
            <Check className="h-4 w-4 text-success mt-0.5 shrink-0" /> {p}
          </li>
        ))}
      </ul>

      {needsConfirm ? (
        <div className="text-sm text-muted-foreground space-y-3">
          <p>Check your email to confirm your account, then sign in — we'll finish your workspace setup and payment.</p>
          <Button className="w-full" onClick={() => window.location.assign("/login?redirect=/signup/agent")}>Go to sign in</Button>
        </div>
      ) : authed ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">You're signed in — finish setting up your solo workspace and start your subscription.</p>
          <Button className="w-full" onClick={completeSetup} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Complete Setup — $79/mo"}
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fn">First name</Label>
              <Input id="fn" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ln">Last name</Label>
              <Input id="ln" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="em">Email</Label>
            <Input id="em" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@agency.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw">Password</Label>
            <Input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue to Payment — $79/mo"}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Building a team later? Upgrade to the Agency Plan anytime — your clients and policies come with you.
          </p>
        </form>
      )}
    </AuthShell>
  );
}
