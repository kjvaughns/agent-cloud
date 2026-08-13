import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { BrandLogo } from "@/components/brand-logo";
import { useDomainBranding } from "@/hooks/use-domain-branding";

export const Route = createFileRoute("/login")({
  validateSearch: (search): { redirect?: string } => ({
    redirect:
      typeof search.redirect === "string" && search.redirect.startsWith("/") && !search.redirect.startsWith("//")
        ? search.redirect
        : "/dashboard",
  }),
  head: () => ({ meta: [{ title: "Sign in — Agent Cloud" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect = "/dashboard" } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // The markup arrives before the JavaScript that submits it. A click in that
  // window used to do nothing at all — no request, no error, no feedback —
  // which reads exactly like "it won't let me log in". Hold the buttons until
  // the handlers are actually attached.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }
    toast.success("Welcome back");
    await navigate({ to: redirect });
    setLoading(false);
  }

  async function onGoogle() {
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) toast.error(result.error.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google sign-in failed");
    }
  }

  return <AuthShell title="Welcome back" subtitle="Sign in to your Agent Cloud workspace">
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@agency.com" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot?</Link>
        </div>
        <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading || !ready}>
        {loading || !ready ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
      </Button>
    </form>
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
      <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
    </div>
    <Button variant="outline" className="w-full" onClick={onGoogle} disabled={!ready}>Continue with Google</Button>
    <p className="mt-6 text-center text-sm text-muted-foreground">
      Need an account? Ask your upline for an invite link.
    </p>
    {/* A demo nothing links to is a demo nobody sees. This is the one place
        somebody who cannot sign in reliably ends up. */}
    <p className="mt-2 text-center text-sm text-muted-foreground">
      Just looking?{" "}
      <Link to="/demo-login" className="text-primary hover:underline">
        Explore a sample agency
      </Link>
    </p>
  </AuthShell>;
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  // White-label agencies on a custom domain get their own mark here; every
  // other host falls through to Agent Cloud branding.
  const brand = useDomainBranding();

  return (
    // Auth always renders in the premium dark look regardless of stored theme.
    <div className="dark min-h-screen grid lg:grid-cols-2 bg-background text-foreground">
      <div className="hidden lg:flex flex-col justify-between bg-card border-r border-border p-12 relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full"
          style={{ background: "radial-gradient(circle, var(--gold-glow) 0%, transparent 70%)" }}
        />
        <div className="flex items-center gap-2.5">
          {brand?.logo_url
            ? <img src={brand.logo_url} alt={brand.name ?? ""} className="h-9 w-9 rounded-lg object-contain border border-border" />
            : <BrandLogo size={36} />}
          <span className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            {brand?.name ?? "Agent Cloud"}
          </span>
        </div>
        <div className="space-y-4 max-w-md">
          <h2 className="text-4xl font-bold leading-tight" style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>
            Your entire agency, <span className="text-gold-bright">in one cloud.</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            {brand?.tagline
              ?? "Pipeline, contracting, calls, SMS, analytics, and a downline command center — built for life insurance teams."}
          </p>
        </div>
        <p className="text-sm text-text-dim">© {brand?.name ?? "Agent Cloud"} 2026</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[var(--radius)] border border-border bg-card p-8" style={{ boxShadow: "var(--shadow-pop)" }}>
          <div className="mb-6 lg:hidden flex items-center gap-2">
            {brand?.logo_url
              ? <img src={brand.logo_url} alt={brand.name ?? ""} className="h-8 w-8 rounded-lg object-contain border border-border" />
              : <BrandLogo size={32} />}
            <span className="font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              {brand?.name ?? "Agent Cloud"}
            </span>
          </div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.02em" }}>{title}</h1>
          <p className="text-sm text-muted-foreground mt-1 mb-6">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
