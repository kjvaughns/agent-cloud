import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, FileUp, Loader2, ScanLine, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { initSoloWorkspace } from "@/lib/billing.functions";
import { applyBuilderSetup, trackFunnel } from "@/lib/self-serve.functions";
import { useServerFn } from "@/hooks/use-server-fn";
import { useBillingCheckout } from "@/components/BillingCheckout";
import { PRICING } from "@/lib/billing/pricing";
import { BrandWordmark } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

type Plan = "solo" | "agency";

export const Route = createFileRoute("/start")({
  validateSearch: (s: Record<string, unknown>): { plan?: Plan } => ({
    plan: s.plan === "agency" || s.plan === "solo" ? s.plan : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Build your agency — Agent Cloud" },
      { name: "description", content: "Name your agency, pick your carriers and watch Agent Cloud build your workstation in minutes." },
      { property: "og:title", content: "Build your agency — Agent Cloud" },
      { property: "og:description", content: "Name your agency, pick your carriers and watch Agent Cloud build your workstation in minutes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuilderPage,
});

const COLORS = [
  "oklch(0.65 0.11 80)", "oklch(0.45 0.12 255)", "oklch(0.5 0.13 155)",
  "oklch(0.52 0.18 25)", "oklch(0.45 0.15 300)", "oklch(0.25 0.01 85)",
];
const CARRIERS = [
  "Mutual of Omaha", "Americo", "Aetna", "GTL", "Corebridge", "Foresters",
  "Transamerica", "American Amicable", "Royal Neighbors", "Ethos", "F&G", "SBLI",
];
const SUITE = [
  { name: "Licensing", line: "Partner recruit code" },
  { name: "Bankdocs", line: "Voided check & direct deposit" },
  { name: "Release Center", line: "Carrier release requests" },
  { name: "Academy", line: "Your agent training school" },
];
const BUILD_LINES = [
  "Starting your commission engine",
  "Setting up hierarchy splits & downline tracking",
  "Branding your Academy & partner portals",
  "Getting Nova ready for morning carrier runs",
];

type State = {
  step: number; plan: Plan; agencyName: string; color: string; teamSize: number; goal: number;
  carriers: string[]; documentName?: string; firstName: string; lastName: string; email: string;
};
const KEY = "ac-builder-v1";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "your-agency";
}
function initials(s: string) {
  return s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "AC";
}

function BuilderPage() {
  const search = Route.useSearch();
  const [s, setS] = useState<State>({
    step: 0, plan: search.plan ?? "agency", agencyName: "", color: COLORS[0]!, teamSize: 5, goal: 50000,
    carriers: [], firstName: "", lastName: "", email: "",
  });
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"steps" | "confirm" | "building" | "reveal" | "done">("steps");
  const [partnerCode, setPartnerCode] = useState<string | null>(null);

  const initFn = useServerFn(initSoloWorkspace);
  const applyFn = useServerFn(applyBuilderSetup);
  const track = useServerFn(trackFunnel);
  const checkout = useBillingCheckout({
    onPaid: () => {
      track({ data: { event: "paid" } }).catch(() => {});
      setPhase("done");
      sessionStorage.removeItem(KEY);
      setTimeout(() => window.location.assign("/dashboard"), 2200);
    },
  });

  // Restore progress after refresh / email confirmation.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY);
      if (raw) setS((p) => ({ ...p, ...JSON.parse(raw), plan: search.plan ?? JSON.parse(raw).plan }));
    } catch {}
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && localStorage.getItem(KEY + ":pending")) {
        localStorage.removeItem(KEY + ":pending");
        void build();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { sessionStorage.setItem(KEY, JSON.stringify(s)); }, [s]);

  const steps = useMemo(() => {
    const all = ["identity", "team", "carriers", "documents", "suite", "account"];
    return s.plan === "agency" ? all : all.filter((x) => x !== "suite");
  }, [s.plan]);
  const current = steps[Math.min(s.step, steps.length - 1)]!;
  const set = (p: Partial<State>) => setS((o) => ({ ...o, ...p }));
  const next = () => set({ step: Math.min(s.step + 1, steps.length - 1) });
  const back = () => set({ step: Math.max(s.step - 1, 0) });
  const price = s.plan === "agency" ? PRICING.agencyBase : PRICING.soloAgent;
  const name = s.agencyName || (s.plan === "solo" ? "Your business" : "Your agency");

  async function build() {
    setPhase("building");
    const started = Date.now();
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY) ?? "null") ?? s;
      await initFn({ data: { withSampleData: false, plan: saved.plan, agencyName: saved.agencyName || undefined } });
      const res = await applyFn({ data: {
        accent_color: saved.color, carriers: saved.carriers, teamSize: saved.teamSize, monthlyGoal: saved.goal,
        documentName: saved.documentName, activateSuite: saved.plan === "agency",
      } });
      setPartnerCode(res.suite?.code ?? null);
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong building your agency");
      setPhase("steps");
      return;
    }
    const wait = Math.max(0, 5200 - (Date.now() - started));
    setTimeout(() => setPhase("reveal"), wait);
  }

  async function saveAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data: existing } = await supabase.auth.getSession();
    if (existing.session) { setBusy(false); return build(); }
    localStorage.setItem(KEY, JSON.stringify(s));
    const { data, error } = await supabase.auth.signUp({
      email: s.email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/start?plan=${s.plan}`,
        data: { full_name: `${s.firstName} ${s.lastName}`.trim(), first_name: s.firstName, last_name: s.lastName },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (!data.session) { localStorage.setItem(KEY + ":pending", "1"); return setPhase("confirm"); }
    void build();
  }

  function launch() {
    track({ data: { event: "checkout_opened" } }).catch(() => {});
    checkout.mutate({ product: s.plan === "agency" ? "agency_plan" : "solo_agent" } as any);
  }

  if (phase === "building") return <BuildScreen color={s.color} name={name} />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {checkout.element}
      <header className="flex items-center justify-between px-5 py-4 md:px-10">
        <Link to="/"><BrandWordmark /></Link>
        {phase === "steps" && <span className="text-xs text-muted-foreground">Step {s.step + 1} of {steps.length}</span>}
      </header>
      {phase === "steps" && (
        <div className="mx-auto h-1 max-w-5xl overflow-hidden rounded-full bg-muted mx-5 md:mx-auto">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${((s.step + 1) / steps.length) * 100}%` }} />
        </div>
      )}

      {phase === "reveal" || phase === "done" ? (
        <Reveal s={s} name={name} price={price} partnerCode={partnerCode} done={phase === "done"} onLaunch={launch} busy={checkout.isPending} />
      ) : phase === "confirm" ? (
        <div className="mx-auto max-w-md px-6 py-24 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Sparkles className="mx-auto mb-4 h-8 w-8 text-primary" />
          <h1 className="font-display text-3xl font-semibold">Confirm your email</h1>
          <p className="mt-3 text-muted-foreground">We sent a link to {s.email}. Open it on this device and we'll pick up right where you left off and build {name}.</p>
        </div>
      ) : (
        <main className="mx-auto grid max-w-5xl gap-10 px-5 py-10 md:grid-cols-[1fr_340px] md:py-16">
          <section key={current} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {current === "identity" && (
              <Step title="Name your agency." sub="This is the name your agents, recruits and clients will see.">
                <Input autoFocus className="h-14 text-xl" placeholder="e.g. Vantage Financial" value={s.agencyName} onChange={(e) => set({ agencyName: e.target.value })} />
                <div className="mt-6">
                  <Label className="text-sm">Brand color</Label>
                  <div className="mt-2 flex gap-3">
                    {COLORS.map((c) => (
                      <button key={c} type="button" aria-label="Pick color" onClick={() => set({ color: c })}
                        className={cn("h-9 w-9 rounded-full border-2 transition-transform", s.color === c ? "scale-110 border-foreground" : "border-transparent")}
                        style={{ background: c }} />
                    ))}
                  </div>
                </div>
                {s.agencyName.length > 2 && <p className="mt-5 text-sm text-primary animate-in fade-in">Looking sharp. {slugify(s.agencyName)} is reserved for you.</p>}
              </Step>
            )}
            {current === "team" && (
              <Step title="Tell us about your team." sub="We'll shape your workspace around how you work.">
                <div className="grid grid-cols-2 gap-3">
                  {(["solo", "agency"] as Plan[]).map((p) => (
                    <button key={p} type="button" onClick={() => set({ plan: p })}
                      className={cn("rounded-[var(--radius)] border p-4 text-left transition-colors", s.plan === p ? "border-primary bg-primary/10" : "border-border hover:border-primary/50")}>
                      <div className="font-semibold">{p === "solo" ? "Just me" : "I run a team"}</div>
                      <div className="text-xs text-muted-foreground">{p === "solo" ? "Solo Agent" : "Agency"}</div>
                    </button>
                  ))}
                </div>
                {s.plan === "agency" && (
                  <div className="mt-8">
                    <Label>Team size: <b>{s.teamSize}{s.teamSize >= 100 ? "+" : ""} agents</b></Label>
                    <Slider className="mt-3" min={1} max={100} value={[s.teamSize]} onValueChange={([v]) => set({ teamSize: v! })} />
                  </div>
                )}
                <div className="mt-8">
                  <Label>Monthly production goal: <b>${s.goal.toLocaleString()}</b></Label>
                  <Slider className="mt-3" min={5000} max={500000} step={5000} value={[s.goal]} onValueChange={([v]) => set({ goal: v! })} />
                </div>
              </Step>
            )}
            {current === "carriers" && (
              <Step title="Which carriers do you write?" sub="Tap every one that applies. You can add more later.">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {CARRIERS.map((c) => {
                    const on = s.carriers.includes(c);
                    return (
                      <button key={c} type="button" onClick={() => set({ carriers: on ? s.carriers.filter((x) => x !== c) : [...s.carriers, c] })}
                        className={cn("flex items-center justify-between rounded-[var(--radius)] border px-3 py-3 text-left text-sm transition-all", on ? "border-primary bg-primary/10 font-medium" : "border-border hover:border-primary/50")}>
                        {c}{on && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </Step>
            )}
            {current === "documents" && <DocStep name={s.documentName} onDone={(n) => set({ documentName: n })} />}
            {current === "suite" && <SuiteStep />}
            {current === "account" && (
              <Step title="Save what you built." sub={`Create your login so ${name} is yours.`}>
                <form id="acct" onSubmit={saveAccount} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label htmlFor="fn">First name</Label><Input id="fn" required value={s.firstName} onChange={(e) => set({ firstName: e.target.value })} /></div>
                    <div className="space-y-2"><Label htmlFor="ln">Last name</Label><Input id="ln" required value={s.lastName} onChange={(e) => set({ lastName: e.target.value })} /></div>
                  </div>
                  <div className="space-y-2"><Label htmlFor="em">Email</Label><Input id="em" type="email" required value={s.email} onChange={(e) => set({ email: e.target.value })} /></div>
                  <div className="space-y-2"><Label htmlFor="pw">Password</Label><Input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                  <p className="text-xs text-muted-foreground">Have an account? <Link to="/login" className="underline">Sign in</Link></p>
                </form>
              </Step>
            )}

            <div className="mt-10 flex items-center justify-between">
              {s.step > 0 ? <Button variant="ghost" onClick={back}><ArrowLeft className="h-4 w-4" /> Back</Button> : <span />}
              {current === "account" ? (
                <Button variant="ink" size="lg" type="submit" form="acct" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Build my agency <Sparkles className="h-4 w-4" /></>}
                </Button>
              ) : (
                <Button variant="ink" size="lg" onClick={next} disabled={current === "identity" && s.agencyName.trim().length < 2}>
                  {current === "documents" && !s.documentName ? "Skip for now" : "Continue"} <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </section>
          <PreviewCard s={s} name={name} />
        </main>
      )}
    </div>
  );
}

function Step({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
      <p className="mt-2 mb-8 text-muted-foreground">{sub}</p>
      {children}
    </div>
  );
}

function PreviewCard({ s, name }: { s: State; name: string }) {
  return (
    <aside className="order-first md:order-none">
      <div className="sticky top-8 overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        <div className="h-2 transition-colors duration-500" style={{ background: s.color }} />
        <div className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl font-semibold text-primary-foreground transition-colors duration-500" style={{ background: s.color }}>
              {initials(s.agencyName)}
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold">{name}</div>
              <div className="truncate text-xs text-muted-foreground">app.useagentcloud.com/{slugify(s.agencyName)}</div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-muted p-3"><div className="text-muted-foreground">Monthly goal</div><div className="font-semibold">${s.goal.toLocaleString()}</div></div>
            <div className="rounded-lg bg-muted p-3"><div className="text-muted-foreground">{s.plan === "agency" ? "Team" : "Plan"}</div><div className="font-semibold">{s.plan === "agency" ? `${s.teamSize} agents` : "Solo"}</div></div>
          </div>
          {s.carriers.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {s.carriers.map((c) => <span key={c} className="rounded-full border border-border px-2 py-0.5 text-[11px] animate-in zoom-in-95">{c}</span>)}
            </div>
          )}
          {s.documentName && <div className="mt-3 text-[11px] text-muted-foreground">📄 {s.documentName}</div>}
        </div>
      </div>
    </aside>
  );
}

function DocStep({ name, onDone }: { name?: string; onDone: (n: string) => void }) {
  const [scanning, setScanning] = useState(false);
  function pick(f?: File) {
    if (!f) return;
    setScanning(true);
    setTimeout(() => { setScanning(false); onDone(f.name); }, 2200);
  }
  return (
    <Step title="Drop in your documents." sub="A comp grid or contracting packet helps us set things up for you. Optional.">
      <label className={cn("relative flex h-48 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-card transition-colors hover:border-primary/60")}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}>
        <input type="file" accept=".pdf,.xlsx,.xls,.csv,.png,.jpg" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        {scanning ? (
          <>
            <div className="absolute inset-x-0 h-0.5 animate-[scan_1.1s_ease-in-out_infinite] bg-primary shadow-[0_0_20px_var(--primary)]" />
            <ScanLine className="h-8 w-8 text-primary" />
            <p className="mt-3 text-sm font-medium">Reading your document…</p>
          </>
        ) : name ? (
          <>
            <Check className="h-8 w-8 text-success" />
            <p className="mt-3 text-sm font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">Saved — we'll help you set this up inside.</p>
          </>
        ) : (
          <>
            <FileUp className="h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Drop a file or tap to choose</p>
            <p className="text-xs text-muted-foreground">PDF, Excel or CSV</p>
          </>
        )}
      </label>
      <style>{`@keyframes scan{0%{top:0}50%{top:100%}100%{top:0}}`}</style>
    </Step>
  );
}

function SuiteStep() {
  const [on, setOn] = useState(0);
  useEffect(() => {
    if (on >= SUITE.length) return;
    const t = setTimeout(() => setOn((n) => n + 1), 700);
    return () => clearTimeout(t);
  }, [on]);
  return (
    <Step title="Your Agency Suite is included." sub="Four tools switch on for your agency — no extra cost.">
      <div className="space-y-3">
        {SUITE.map((t, i) => (
          <div key={t.name} className={cn("flex items-center gap-4 rounded-xl border p-4 transition-all duration-500", i < on ? "border-primary/50 bg-primary/5" : "border-border opacity-50")}>
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-full transition-colors", i < on ? "bg-primary text-primary-foreground" : "bg-muted")}>
              {i < on ? <Check className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
            <div><div className="font-semibold">{t.name}</div><div className="text-xs text-muted-foreground">{t.line}</div></div>
          </div>
        ))}
      </div>
    </Step>
  );
}

function BuildScreen({ color, name }: { color: string; name: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, BUILD_LINES.length)), 1200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="relative mb-10 h-24 w-24">
        <div className="absolute inset-0 animate-ping rounded-full opacity-20" style={{ background: color }} />
        <div className="absolute inset-3 animate-pulse rounded-full" style={{ background: color }} />
      </div>
      <h1 className="mb-8 text-center font-display text-2xl font-semibold md:text-3xl">Building {name}</h1>
      <ul className="w-full max-w-sm space-y-3">
        {BUILD_LINES.map((l, n) => (
          <li key={l} className={cn("flex items-center gap-3 text-sm transition-all duration-500", n <= i ? "opacity-100" : "translate-y-1 opacity-0")}>
            {n < i ? <Check className="h-4 w-4 text-primary" /> : <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            {l}…
          </li>
        ))}
      </ul>
      {i >= BUILD_LINES.length && <p className="mt-8 font-medium text-primary animate-in fade-in">Your agency is ready.</p>}
    </div>
  );
}

function Reveal({ s, name, price, partnerCode, done, onLaunch, busy }: {
  s: State; name: string; price: number; partnerCode: string | null; done: boolean; onLaunch: () => void; busy: boolean;
}) {
  return (
    <div className="relative mx-auto max-w-5xl px-5 py-10">
      <div aria-hidden className="pointer-events-none select-none blur-[3px] opacity-60">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl" style={{ background: s.color }} />
            <div className="text-lg font-semibold">{name}</div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {["Written this week", "Monthly goal", "Agents", "Carriers"].map((k, n) => (
              <div key={k} className="rounded-xl bg-muted p-4">
                <div className="text-xs text-muted-foreground">{k}</div>
                <div className="text-xl font-semibold">{[`$0`, `$${s.goal.toLocaleString()}`, s.plan === "agency" ? s.teamSize : 1, s.carriers.length][n]}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 h-40 rounded-xl bg-muted" />
          <div className="mt-4 flex flex-wrap gap-2">{s.carriers.map((c) => <span key={c} className="rounded-full border border-border px-2 py-0.5 text-xs">{c}</span>)}</div>
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center px-5">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-700">
          {done ? (
            <>
              <Sparkles className="mx-auto h-10 w-10 text-primary animate-bounce" />
              <h2 className="mt-4 font-display text-2xl font-semibold">Welcome to {name}.</h2>
              <p className="mt-2 text-sm text-muted-foreground">Opening your workstation…</p>
            </>
          ) : (
            <>
              <div className="mx-auto mb-4 h-1.5 w-16 rounded-full" style={{ background: s.color }} />
              <h2 className="font-display text-2xl font-semibold md:text-3xl">{name} is ready to launch.</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                {s.plan === "agency"
                  ? "Your CRM, Academy, Bankdocs, Release Center, Licensing partner access and Nova are set up and waiting."
                  : "Your CRM, book of business and commission tracking are set up and waiting."}
              </p>
              {partnerCode && <p className="mt-3 text-xs">Your partner code: <b className="text-primary">{partnerCode}</b></p>}
              <div className="my-6 rounded-xl bg-muted p-4">
                <div className="text-3xl font-semibold">${price}<span className="text-base font-normal text-muted-foreground">/month</span></div>
                <div className="text-xs text-muted-foreground">{s.plan === "agency" ? "Agency plan · unlimited agents" : "Solo Agent"} · keep 100% of your comp</div>
              </div>
              <Button variant="ink" size="lg" className="w-full" onClick={onLaunch} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Launch ${name}`}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
