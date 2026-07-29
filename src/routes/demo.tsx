import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BrandLogo } from "@/components/brand-logo";
import { track } from "@/lib/landing-analytics";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Request a Demo — Agent Cloud" },
      { name: "description", content: "See how Agent Cloud runs recruiting, onboarding, licensing, contracting, clients, policies, retention and commissions for independent insurance agencies." },
    ],
  }),
  component: DemoPage,
});

const display = { fontFamily: "var(--font-display)" } as const;

const AGENT_COUNTS = ["Just me", "2–10", "11–25", "26–50", "51–150", "150+"];

type Form = {
  first_name: string; last_name: string; email: string; phone: string;
  agency_name: string; agent_count: string; current_tools: string;
  primary_challenge: string; preferred_time: string;
};

const EMPTY: Form = {
  first_name: "", last_name: "", email: "", phone: "",
  agency_name: "", agent_count: "", current_tools: "",
  primary_challenge: "", preferred_time: "",
};

function DemoPage() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [hp, setHp] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const set = (k: keyof Form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (!started) { setStarted(true); track("demo_form_started"); }
  };

  // Capture attribution once, before any navigation rewrites the querystring.
  const [utm, setUtm] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const out: Record<string, string> = {};
      for (const [k, v] of p.entries()) if (k.startsWith("utm_")) out[k] = v;
      setUtm(out);
    } catch { /* no-op */ }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/public/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          phone: form.phone || null,
          agency_name: form.agency_name || null,
          agent_count: form.agent_count || null,
          current_tools: form.current_tools || null,
          primary_challenge: form.primary_challenge || null,
          preferred_time: form.preferred_time || null,
          source: "landing_demo",
          utm,
          hp,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Something went wrong.");
      track("demo_form_submitted");
      setDone(true);
    } catch (err: any) {
      // The form state is preserved deliberately — a failed submit must not
      // make someone retype everything.
      setError(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h1 className="mt-6 text-3xl font-bold text-foreground" style={display}>
            Thanks — we'll be in touch.
          </h1>
          <p className="mt-3 text-muted-foreground">
            We've received your request and someone will reach out within one business day
            to schedule a walkthrough of your agency's setup.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <Link to="/"><Button variant="outline">Back to home</Button></Link>
            <Link to="/login"><Button>Sign in</Button></Link>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground" style={display}>
        See Agent Cloud on your agency's terms.
      </h1>
      <p className="mt-3 text-muted-foreground">
        Tell us how your agency runs today and we'll show you the parts that matter to you —
        not a generic tour.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate={false}>
        {/* Honeypot — visually hidden, not display:none, so bots still fill it. */}
        <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="company_website">Company website</label>
          <input
            id="company_website" name="company_website" tabIndex={-1} autoComplete="off"
            value={hp} onChange={(e) => setHp(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="fn" label="First name" required value={form.first_name} onChange={set("first_name")} />
          <Field id="ln" label="Last name" required value={form.last_name} onChange={set("last_name")} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="em" label="Work email" type="email" required value={form.email} onChange={set("email")} />
          <Field id="ph" label="Phone" type="tel" value={form.phone} onChange={set("phone")} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ag" label="Agency name" value={form.agency_name} onChange={set("agency_name")} />
          <div className="space-y-1.5">
            <Label htmlFor="ct">How many agents?</Label>
            <Select value={form.agent_count} onValueChange={set("agent_count")}>
              <SelectTrigger id="ct"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {AGENT_COUNTS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Field
          id="tools" label="What are you using today?"
          placeholder="Spreadsheets, a CRM, carrier portals…"
          value={form.current_tools} onChange={set("current_tools")}
        />

        <div className="space-y-1.5">
          <Label htmlFor="chal">What's the biggest operational headache right now?</Label>
          <Textarea
            id="chal" className="min-h-[90px]"
            value={form.primary_challenge}
            onChange={(e) => set("primary_challenge")(e.target.value)}
          />
        </div>

        <Field
          id="time" label="Best time to reach you"
          placeholder="Weekday mornings, CST"
          value={form.preferred_time} onChange={set("preferred_time")}
        />

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Request a demo"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          We use this only to prepare and schedule your walkthrough.
        </p>
      </form>
    </Shell>
  );
}

function Field({
  id, label, value, onChange, type = "text", required, placeholder,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}{required && <span className="text-destructive"> *</span>}</Label>
      <Input
        id={id} type={type} required={required} placeholder={placeholder}
        value={value} onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen bg-background text-foreground antialiased">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandLogo size={32} />
            <span className="text-lg font-bold tracking-[0.14em]" style={display}>AGENT CLOUD</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12 md:py-16">{children}</main>
    </div>
  );
}
