import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, ArrowRight, Check, FileUp, Loader2, Sparkles, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { initSoloWorkspace } from "@/lib/billing.functions";
import { applyBuilderSetup, trackFunnel } from "@/lib/self-serve.functions";
import { getMyOnboarding, saveOnboarding, completeOnboarding } from "@/lib/onboarding-session.functions";
import { useServerFn } from "@/hooks/use-server-fn";
import { useBillingCheckout } from "@/components/BillingCheckout";
import { PRICING } from "@/lib/billing/pricing";
import { BrandWordmark } from "@/components/brand-logo";
import { cn } from "@/lib/utils";
import { Atmosphere, RevealTitle, Constellation, AgentScene, AgencyScene, CountUp, BuildScene, type Path } from "@/components/start/scenes";

export const Route = createFileRoute("/start")({
  validateSearch: (s: Record<string, unknown>): { plan?: "solo" | "agency" } => ({
    plan: s.plan === "agency" || s.plan === "solo" ? s.plan : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Build your book or agency — Agent Cloud" },
      { name: "description", content: "Choose agent or agency, save your progress and watch Agent Cloud build your workstation." },
      { property: "og:title", content: "Build your book or agency — Agent Cloud" },
      { property: "og:description", content: "Choose agent or agency, save your progress and watch Agent Cloud build your workstation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuilderPage,
});

const COLORS = ["oklch(0.65 0.11 80)", "oklch(0.45 0.12 255)", "oklch(0.5 0.13 155)", "oklch(0.52 0.18 25)", "oklch(0.45 0.15 300)", "oklch(0.25 0.01 85)"];
const CARRIERS = ["Mutual of Omaha", "Americo", "Aetna", "GTL", "Corebridge", "Foresters", "Transamerica", "American Amicable", "Royal Neighbors", "Ethos", "F&G", "SBLI"];
const STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
const SUITE = [
  { name: "Licensing", line: "Partner recruit code" },
  { name: "Bankdocs", line: "Voided check & direct deposit" },
  { name: "Release Center", line: "Carrier release requests" },
  { name: "Academy", line: "Your agent training school" },
];
const STEPS: Record<Path, string[]> = {
  agent: ["you", "states", "carriers", "goal", "documents"],
  agency: ["identity", "team", "carriers", "goal", "documents", "suite"],
};
const BUILD_LINES: Record<Path, string[]> = {
  agent: ["Opening your book of business", "Connecting your carriers", "Starting your commission tracker", "Waking up Nova"],
  agency: ["Raising your agency headquarters", "Wiring hierarchy splits & downline", "Switching on Licensing, Bankdocs, Release Center & Academy", "Waking up Nova for morning carrier runs"],
};

type Answers = {
  firstName: string; lastName: string; agencyName: string; color: string; states: string[];
  carriers: string[]; goal: number; teamSize: number; invites: string; documents: { name: string; path: string }[];
};
const EMPTY: Answers = { firstName: "", lastName: "", agencyName: "", color: COLORS[0]!, states: [], carriers: [], goal: 25000, teamSize: 5, invites: "", documents: [] };
const LOCAL = "ac-journey-v2";

function initials(s: string) {
  return s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "AC";
}

type Phase = "loading" | "path" | "account" | "confirm" | "steps" | "building" | "reveal" | "done";

function BuilderPage() {
  const search = Route.useSearch();
  const [phase, setPhase] = useState<Phase>("loading");
  const [path, setPath] = useState<Path>(search.plan === "solo" ? "agent" : "agency");
  const [a, setA] = useState<Answers>(EMPTY);
  const [stepIdx, setStepIdx] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [partnerCode, setPartnerCode] = useState<string | null>(null);

  const loadFn = useServerFn(getMyOnboarding);
  const saveFn = useServerFn(saveOnboarding);
  const completeFn = useServerFn(completeOnboarding);
  const initFn = useServerFn(initSoloWorkspace);
  const applyFn = useServerFn(applyBuilderSetup);
  const track = useServerFn(trackFunnel);
  const checkout = useBillingCheckout({
    onPaid: () => {
      track({ data: { event: "paid" } }).catch(() => {});
      setPhase("done");
      setTimeout(() => window.location.assign("/dashboard"), 2200);
    },
  });

  const steps = STEPS[path];
  const current = steps[Math.min(stepIdx, steps.length - 1)]!;
  const set = (p: Partial<Answers>) => setA((o) => ({ ...o, ...p }));
  const name = path === "agency" ? a.agencyName || "Your agency" : a.agencyName || `${a.firstName || "Your"}${a.firstName ? "'s" : ""} book`;
  const price = path === "agency" ? PRICING.agencyBase : PRICING.soloAgent;

  // Resume from the account (any device) or show the path picker.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        try {
          const raw = localStorage.getItem(LOCAL);
          if (raw) { const p = JSON.parse(raw); if (p.path) setPath(p.path); if (p.answers) setA({ ...EMPTY, ...p.answers }); }
        } catch {}
        return setPhase("path");
      }
      const row = await loadFn().catch(() => null);
      if (row?.completed_at) { setPath(row.path); setA({ ...EMPTY, ...row.answers }); return setPhase("reveal"); }
      let p: Path = row?.path ?? path;
      let ans: Answers = { ...EMPTY, ...(row?.answers ?? {}) };
      try {
        const raw = localStorage.getItem(LOCAL);
        if (!row && raw) { const l = JSON.parse(raw); p = l.path ?? p; ans = { ...ans, ...l.answers }; }
      } catch {}
      const meta = data.session.user.user_metadata ?? {};
      if (!ans.firstName) ans.firstName = meta.first_name ?? String(meta.full_name ?? "").split(" ")[0] ?? "";
      if (!ans.lastName) ans.lastName = meta.last_name ?? String(meta.full_name ?? "").split(" ").slice(1).join(" ");
      setPath(p); setA(ans);
      const idx = Math.max(0, STEPS[p].indexOf(row?.current_step ?? ""));
      setStepIdx(idx);
      if (!row) saveFn({ data: { path: p, current_step: STEPS[p][0]!, answers: ans } }).catch(() => {});
      setPhase("steps");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { localStorage.setItem(LOCAL, JSON.stringify({ path, answers: a })); }, [path, a]);

  async function persist(nextStep: string) {
    await saveFn({ data: { path, current_step: nextStep, answers: a } }).catch(() => {});
  }

  async function next() {
    if (stepIdx >= steps.length - 1) return build();
    const n = stepIdx + 1;
    setStepIdx(n);
    void persist(steps[n]!);
  }
  const back = () => (stepIdx === 0 ? setPhase("path") : setStepIdx(stepIdx - 1));

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/start`,
        data: { full_name: `${a.firstName} ${a.lastName}`.trim(), first_name: a.firstName, last_name: a.lastName, signup_path: path },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (!data.session) return setPhase("confirm");
    await saveFn({ data: { path, current_step: steps[0]!, answers: a } }).catch(() => {});
    setStepIdx(0);
    setPhase("steps");
  }

  async function google() {
    localStorage.setItem(LOCAL, JSON.stringify({ path, answers: a }));
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/start` });
    if (r.error) toast.error(r.error.message);
  }

  async function build() {
    setPhase("building");
    const started = Date.now();
    try {
      await saveFn({ data: { path, current_step: "build", answers: a } });
      await initFn({ data: { withSampleData: false, plan: path === "agency" ? "agency" : "solo", agencyName: path === "agency" ? a.agencyName || undefined : a.agencyName || `${a.firstName} ${a.lastName}`.trim() || undefined } });
      const res = await applyFn({ data: {
        accent_color: a.color, carriers: a.carriers, teamSize: path === "agency" ? a.teamSize : 1, monthlyGoal: a.goal,
        documentName: a.documents.map((d) => d.name).join(", ").slice(0, 200) || undefined, activateSuite: path === "agency",
      } });
      setPartnerCode(res.suite?.partnerCode ?? null);
      await completeFn().catch(() => {});
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong while building");
      return setPhase("steps");
    }
    setTimeout(() => setPhase("reveal"), Math.max(0, 5000 - (Date.now() - started)));
  }

  function launch() {
    track({ data: { event: "checkout_opened" } }).catch(() => {});
    checkout.mutate({ product: path === "agency" ? "agency_plan" : "solo_agent" } as any);
  }

  const canContinue =
    (current === "identity" && a.agencyName.trim().length >= 2) ||
    (current === "you" && a.firstName.trim().length >= 1) ||
    (current === "states" && a.states.length > 0) ||
    !["identity", "you", "states"].includes(current);

  return (
    <div className="relative min-h-screen text-foreground">
      <Atmosphere />
      {checkout.element}
      {phase !== "building" && (
        <header className="relative z-10 flex items-center justify-between px-5 py-4 md:px-10">
          <Link to="/"><BrandWordmark /></Link>
          {phase === "steps" && <Constellation steps={steps} index={stepIdx} />}
        </header>
      )}

      <AnimatePresence mode="wait">
        {phase === "loading" && (
          <motion.div key="l" exit={{ opacity: 0 }} className="flex min-h-[70vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
          </motion.div>
        )}

        {phase === "path" && (
          <motion.main key="path" exit={{ opacity: 0, y: -30 }} className="mx-auto max-w-6xl px-5 pb-16 pt-6 md:pt-14">
            <div className="text-center">
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs font-medium uppercase tracking-[0.3em] text-gold">Let's build yours</motion.p>
              <RevealTitle text="Who are you building for?" className="mt-3 text-3xl md:text-6xl" />
            </div>
            <div className="mt-6 flex flex-col gap-3 md:mt-14 md:h-[460px] md:flex-row">
              <PathPanel kind="agent" selected={path === "agent"} onHover={() => setPath("agent")}
                onPick={() => { setPath("agent"); setPhase("account"); }}
                title="I'm an agent" sub="My own book, my own carriers, my own comp." price={PRICING.soloAgent} icon={<User className="h-5 w-5" />} />
              <PathPanel kind="agency" selected={path === "agency"} onHover={() => setPath("agency")}
                onPick={() => { setPath("agency"); setPhase("account"); }}
                title="I run an agency" sub="A team, a hierarchy and splits to track." price={PRICING.agencyBase} icon={<Users className="h-5 w-5" />} />
            </div>
            <p className="mt-6 text-center text-sm text-muted-foreground">Already have an account? <Link to="/login" className="underline underline-offset-4">Sign in</Link></p>
          </motion.main>
        )}

        {phase === "account" && (
          <Scene key="account">
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-gold">{path === "agency" ? "Agency" : "Agent"} · save your progress</p>
            <RevealTitle text={path === "agency" ? "First, claim your agency." : "First, claim your book."} className="mt-3 text-3xl md:text-5xl" />
            <p className="mt-3 text-muted-foreground">Your account saves every choice as you go, so you can finish on any device.</p>
            <form onSubmit={createAccount} className="mt-8 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field id="fn" label="First name"><Input id="fn" required value={a.firstName} onChange={(e) => set({ firstName: e.target.value })} className="h-12" /></Field>
                <Field id="ln" label="Last name"><Input id="ln" required value={a.lastName} onChange={(e) => set({ lastName: e.target.value })} className="h-12" /></Field>
              </div>
              <Field id="em" label="Email"><Input id="em" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" /></Field>
              <Field id="pw" label="Password"><Input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" /></Field>
              <Button variant="ink" size="lg" className="w-full" type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Save & start building <ArrowRight className="h-4 w-4" /></>}
              </Button>
              <Button variant="outline" size="lg" className="w-full" type="button" onClick={google}>Continue with Google</Button>
            </form>
            <button type="button" onClick={() => setPhase("path")} className="mt-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Change path</button>
          </Scene>
        )}

        {phase === "confirm" && (
          <Scene key="confirm" center>
            <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring" }}>
              <Sparkles className="mx-auto mb-4 h-10 w-10 text-gold" />
            </motion.div>
            <RevealTitle text="Check your inbox." className="text-4xl" />
            <p className="mt-3 text-muted-foreground">We sent a link to {email}. Open it and we'll pick up right where you left off.</p>
          </Scene>
        )}

        {phase === "steps" && (
          <motion.main key="steps" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="mx-auto grid max-w-6xl gap-6 px-5 pb-28 pt-4 md:grid-cols-[1fr_360px] md:gap-10 md:py-14">
            <section>
              <AnimatePresence mode="wait">
                <motion.div key={current} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
                  <StepBody current={current} a={a} set={set} path={path} />
                </motion.div>
              </AnimatePresence>
              <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between border-t border-border bg-background/90 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:mt-10 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
                <Button variant="ghost" onClick={back}><ArrowLeft className="h-4 w-4" /> Back</Button>
                <Button variant="ink" size="lg" onClick={next} disabled={!canContinue}>
                  {stepIdx === steps.length - 1 ? <>Build {path === "agency" ? "my agency" : "my book"} <Sparkles className="h-4 w-4" /></>
                    : current === "documents" && !a.documents.length ? <>Skip for now <ArrowRight className="h-4 w-4" /></>
                    : <>Continue <ArrowRight className="h-4 w-4" /></>}
                </Button>
              </div>
            </section>
            <LivePreview a={a} path={path} name={name} />
          </motion.main>
        )}

        {phase === "building" && <motion.div key="b" exit={{ opacity: 0 }}><BuildScene name={name} color={a.color} lines={BUILD_LINES[path]} /></motion.div>}

        {(phase === "reveal" || phase === "done") && (
          <Reveal key="r" a={a} path={path} name={name} price={price} partnerCode={partnerCode} done={phase === "done"} onLaunch={launch} busy={checkout.isPending} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Scene({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <motion.main initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -30 }} transition={{ duration: 0.5 }}
      className={cn("mx-auto max-w-md px-5 py-6 md:py-16", center && "text-center")}>{children}</motion.main>
  );
}
function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

function PathPanel({ kind, selected, onHover, onPick, title, sub, price, icon }: {
  kind: Path; selected: boolean; onHover: () => void; onPick: () => void; title: string; sub: string; price: number; icon: React.ReactNode;
}) {
  return (
    <motion.button type="button" onMouseEnter={onHover} onFocus={onHover} onClick={onPick}
      initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0, flexGrow: selected ? 1.5 : 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: kind === "agent" ? 0.2 : 0.35 }}
      className={cn("group relative flex shrink-0 basis-auto md:shrink md:basis-0 flex-col justify-between overflow-hidden rounded-3xl border p-5 text-left transition-colors md:p-9",
        selected ? "border-gold bg-card shadow-2xl" : "border-border bg-card/60 backdrop-blur")}>
      <div>
        <div className={cn("inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors", selected ? "bg-gold text-gold-foreground" : "bg-muted")}>{icon}</div>
        <h2 className="mt-3 font-display text-2xl font-semibold md:mt-5 md:text-4xl">{title}</h2>
        <p className="mt-2 text-muted-foreground">{sub}</p>
      </div>
      <div className="my-3 origin-center scale-75 md:my-6 md:scale-100 -my-2">{kind === "agent" ? <AgentScene active={selected} /> : <AgencyScene active={selected} />}</div>
      <div className="flex items-end justify-between">
        <div className="text-sm text-muted-foreground"><span className="text-2xl font-semibold text-foreground">${price}</span>/month</div>
        <span className={cn("inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all", selected ? "bg-ink text-ink-foreground" : "bg-muted")}>
          Start <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </motion.button>
  );
}

function Title({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div className="mb-6 md:mb-8">
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-gold">{eyebrow}</p>
      <RevealTitle text={title} className="mt-2 text-[1.75rem] leading-tight md:mt-3 md:text-5xl" />
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-3 text-muted-foreground">{sub}</motion.p>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.94 }} onClick={onClick}
      className={cn("flex items-center justify-between gap-2 rounded-xl border px-3 py-3 text-left text-sm transition-colors", on ? "border-gold bg-gold/10 font-medium" : "border-border bg-card/70 hover:border-gold/50")}>
      {children}{on && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}><Check className="h-4 w-4 text-gold" /></motion.span>}
    </motion.button>
  );
}

function StepBody({ current, a, set, path }: { current: string; a: Answers; set: (p: Partial<Answers>) => void; path: Path }) {
  const toggle = (k: "states" | "carriers", v: string) => set({ [k]: a[k].includes(v) ? a[k].filter((x) => x !== v) : [...a[k], v] } as any);
  switch (current) {
    case "you":
      return (
        <>
          <Title eyebrow="Your book" title={`Nice to meet you${a.firstName ? `, ${a.firstName}` : ""}.`} sub="How should clients see your business?" />
          <div className="space-y-4">
            <Field id="fn2" label="First name"><Input id="fn2" className="h-12" value={a.firstName} onChange={(e) => set({ firstName: e.target.value })} /></Field>
            <Field id="biz" label="Business name (optional)"><Input id="biz" className="h-12" placeholder="e.g. Jordan Reed Insurance" value={a.agencyName} onChange={(e) => set({ agencyName: e.target.value })} /></Field>
            <ColorPick a={a} set={set} />
          </div>
        </>
      );
    case "identity":
      return (
        <>
          <Title eyebrow="Your agency" title="Name your agency." sub="This is what your agents, recruits and clients will see." />
          <Input autoFocus className="h-16 text-2xl" placeholder="e.g. Vantage Financial" value={a.agencyName} onChange={(e) => set({ agencyName: e.target.value })} />
          <div className="mt-6"><ColorPick a={a} set={set} /></div>
        </>
      );
    case "states":
      return (
        <>
          <Title eyebrow="Licensing" title="Where are you licensed?" sub="Tap every state you can write in." />
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
            {STATES.map((s) => (
              <motion.button key={s} type="button" whileTap={{ scale: 0.9 }} onClick={() => toggle("states", s)}
                className={cn("rounded-lg border py-2.5 text-xs font-medium transition-colors", a.states.includes(s) ? "border-gold bg-gold text-gold-foreground" : "border-border bg-card/70 hover:border-gold/50")}>{s}</motion.button>
            ))}
          </div>
        </>
      );
    case "team":
      return (
        <>
          <Title eyebrow="Your team" title="How big is your team?" sub="We'll shape hierarchy and splits around it." />
          <div className="rounded-2xl border border-border bg-card/70 p-6">
            <div className="font-display text-5xl font-semibold"><CountUp to={a.teamSize} duration={0.3} />{a.teamSize >= 100 ? "+" : ""} <span className="text-lg font-normal text-muted-foreground">agents</span></div>
            <Slider className="mt-5" min={1} max={100} value={[a.teamSize]} onValueChange={([v]) => set({ teamSize: v! })} />
          </div>
          <div className="mt-6"><Field id="inv" label="Agents to invite after launch (optional, one email per line)">
            <textarea id="inv" rows={3} value={a.invites} onChange={(e) => set({ invites: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="agent@example.com" />
          </Field></div>
        </>
      );
    case "carriers":
      return (
        <>
          <Title eyebrow="Carriers" title={path === "agency" ? "Which carriers does your agency write?" : "Which carriers do you write?"} sub="Tap every one that applies. Add more later." />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CARRIERS.map((c) => <Chip key={c} on={a.carriers.includes(c)} onClick={() => toggle("carriers", c)}>{c}</Chip>)}
          </div>
        </>
      );
    case "goal":
      return (
        <>
          <Title eyebrow="Ambition" title={path === "agency" ? "What should your agency write each month?" : "What do you want to write each month?"} sub="We'll track you against it from day one." />
          <div className="rounded-2xl border border-border bg-card/70 p-6">
            <div className="font-display text-5xl font-semibold text-gold"><CountUp to={a.goal} prefix="$" duration={0.4} /></div>
            <Slider className="mt-5" min={5000} max={path === "agency" ? 1000000 : 200000} step={5000} value={[a.goal]} onValueChange={([v]) => set({ goal: v! })} />
          </div>
        </>
      );
    case "documents":
      return <DocStep a={a} set={set} path={path} />;
    case "suite":
      return <SuiteStep />;
  }
  return null;
}

function ColorPick({ a, set }: { a: Answers; set: (p: Partial<Answers>) => void }) {
  return (
    <div>
      <Label className="text-sm">Brand color</Label>
      <div className="mt-2 flex gap-3">
        {COLORS.map((c) => (
          <motion.button key={c} type="button" aria-label="Pick color" whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }} onClick={() => set({ color: c })}
            className={cn("h-10 w-10 rounded-full border-2", a.color === c ? "border-foreground" : "border-transparent")} style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

function DocStep({ a, set, path }: { a: Answers; set: (p: Partial<Answers>) => void; path: Path }) {
  const [scanning, setScanning] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  async function upload(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return toast.error("Please sign in again");
    setScanning(f.name);
    const key = `${u.user.id}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
    const [{ error }] = await Promise.all([
      supabase.storage.from("onboarding-uploads").upload(key, f),
      new Promise((r) => setTimeout(r, 1800)),
    ]);
    setScanning(null);
    if (error) return toast.error(error.message);
    set({ documents: [...a.documents, { name: f.name, path: key }] });
  }
  return (
    <>
      <Title eyebrow="Documents" title="Drop in your paperwork." sub={path === "agency" ? "Comp grids, contracting packets, your agency license." : "Your license, E&O certificate, a comp grid."} />
      <motion.button type="button" whileHover={{ scale: 1.01 }} onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files); }}
        className="relative flex h-52 w-full flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-border bg-card/70 hover:border-gold/60">
        <input ref={input} type="file" accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg" className="sr-only" onChange={(e) => void upload(e.target.files)} />
        {scanning ? (
          <>
            <motion.div className="absolute inset-x-0 h-0.5 bg-gold shadow-[0_0_24px_var(--gold)]" animate={{ top: ["0%", "100%", "0%"] }} transition={{ duration: 1.4, repeat: Infinity }} />
            <p className="text-sm font-medium">Reading {scanning}…</p>
          </>
        ) : (
          <>
            <FileUp className="h-8 w-8 text-gold" />
            <p className="mt-3 text-sm font-medium">Drop a file or tap to choose</p>
            <p className="text-xs text-muted-foreground">PDF, Excel, CSV or image · stored privately</p>
          </>
        )}
      </motion.button>
      <ul className="mt-4 space-y-2">
        <AnimatePresence>
          {a.documents.map((d) => (
            <motion.li key={d.path} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
              <Check className="h-4 w-4 text-gold" /> {d.name}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </>
  );
}

function SuiteStep() {
  return (
    <>
      <Title eyebrow="Included" title="Your Agency Suite switches on." sub="Four tools built in for your agency — no extra cost." />
      <div className="space-y-3">
        {SUITE.map((t, i) => (
          <motion.div key={t.name} initial={{ opacity: 0.3, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.6 }}
            className="flex items-center gap-4 rounded-2xl border border-gold/40 bg-card p-4">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.8 + i * 0.6, type: "spring" }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gold text-gold-foreground"><Check className="h-4 w-4" /></motion.div>
            <div><div className="font-semibold">{t.name}</div><div className="text-xs text-muted-foreground">{t.line}</div></div>
          </motion.div>
        ))}
      </div>
    </>
  );
}

function LivePreview({ a, path, name }: { a: Answers; path: Path; name: string }) {
  const tiles = useMemo(() => [
    { k: "Monthly goal", v: `$${a.goal.toLocaleString()}` },
    path === "agency" ? { k: "Team", v: `${a.teamSize} agents` } : { k: "States", v: String(a.states.length) },
    { k: "Carriers", v: String(a.carriers.length) },
    { k: "Documents", v: String(a.documents.length) },
  ], [a, path]);
  return (
    <aside className="order-first md:order-none">
      <motion.div layout className="overflow-hidden rounded-2xl border md:sticky md:top-8 md:rounded-3xl border-border bg-card shadow-2xl">
        <motion.div className="h-2" animate={{ background: a.color }} />
        <div className="p-3 md:p-5">
          <div className="flex items-center gap-3">
            <motion.div layout className="flex h-10 w-10 shrink-0 md:h-12 md:w-12 items-center justify-center rounded-2xl font-semibold text-primary-foreground" animate={{ background: a.color }}>
              {initials(path === "agency" ? a.agencyName : `${a.firstName} ${a.lastName}`)}
            </motion.div>
            <div className="min-w-0">
              <div className="truncate font-semibold">{name}</div>
              <div className="truncate text-xs text-muted-foreground">{path === "agency" ? "Agency workspace" : "Agent workspace"}</div>
            </div>
            <div className="ml-auto shrink-0 text-right text-[11px] text-muted-foreground md:hidden">{a.carriers.length} carriers<br />${a.goal.toLocaleString()}/mo</div>
          </div>
          <div className="mt-5 hidden grid-cols-2 gap-2 text-xs md:grid">
            {tiles.map((t) => (
              <div key={t.k} className="rounded-xl bg-muted p-3">
                <div className="text-muted-foreground">{t.k}</div>
                <motion.div key={t.v} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="font-semibold">{t.v}</motion.div>
              </div>
            ))}
          </div>
          <div className="mt-3 hidden flex-wrap gap-1.5 md:flex">
            <AnimatePresence>
              {[...a.carriers, ...a.states].slice(0, 18).map((c) => (
                <motion.span key={c} layout initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                  className="rounded-full border border-border px-2 py-0.5 text-[11px]">{c}</motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </aside>
  );
}

function Reveal({ a, path, name, price, partnerCode, done, onLaunch, busy }: {
  a: Answers; path: Path; name: string; price: number; partnerCode: string | null; done: boolean; onLaunch: () => void; busy: boolean;
}) {
  const tiles = [
    { k: "Written this week", v: 0, p: "$" },
    { k: "Monthly goal", v: a.goal, p: "$" },
    { k: path === "agency" ? "Agents" : "States", v: path === "agency" ? a.teamSize : a.states.length, p: "" },
    { k: "Carriers", v: a.carriers.length, p: "" },
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto grid max-w-6xl gap-8 px-5 py-8 md:grid-cols-[1fr_400px] md:py-14">
      <motion.div initial={{ opacity: 0, scale: 0.95, rotateX: 12 }} animate={{ opacity: 1, scale: 1, rotateX: 0 }} transition={{ duration: 0.9 }}
        className="rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <motion.div initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", delay: 0.3 }}
            className="flex h-11 w-11 items-center justify-center rounded-xl font-semibold text-primary-foreground" style={{ background: a.color }}>
            {initials(path === "agency" ? a.agencyName : `${a.firstName} ${a.lastName}`)}
          </motion.div>
          <div className="text-lg font-semibold">{name}</div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((t, i) => (
            <motion.div key={t.k} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.15 }} className="rounded-xl bg-muted p-4">
              <div className="text-xs text-muted-foreground">{t.k}</div>
              <div className="text-xl font-semibold"><CountUp to={t.v} prefix={t.p} /></div>
            </motion.div>
          ))}
        </div>
        <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 1.1, duration: 0.7 }} style={{ transformOrigin: "bottom" }}
          className="mt-6 flex h-36 items-end gap-2 rounded-xl bg-muted p-4">
          {[30, 45, 38, 60, 52, 75, 90].map((h, i) => (
            <motion.div key={i} initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: 1.3 + i * 0.08 }} className="flex-1 rounded-t bg-gold/70" />
          ))}
        </motion.div>
        <div className="mt-4 flex flex-wrap gap-2">{a.carriers.map((c) => <span key={c} className="rounded-full border border-border px-2 py-0.5 text-xs">{c}</span>)}</div>
      </motion.div>

      <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 }}
        className="order-first self-center rounded-3xl border border-gold/50 bg-card p-6 md:order-none md:p-7 text-center shadow-2xl">
        {done ? (
          <>
            <Sparkles className="mx-auto h-10 w-10 text-gold" />
            <h2 className="mt-4 font-display text-2xl font-semibold">Welcome to {name}.</h2>
            <p className="mt-2 text-sm text-muted-foreground">Opening your workstation…</p>
          </>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-gold">{path === "agency" ? "Your agency is ready" : "Your book is ready"}</p>
            <h2 className="mt-3 font-display text-3xl font-semibold">{name} is ready to launch.</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              {path === "agency"
                ? "CRM, hierarchy, commission engine, Academy, Bankdocs, Release Center, Licensing partner access and Nova — all set up."
                : "CRM, book of business, commission tracking and Nova — all set up."}
            </p>
            {partnerCode && <p className="mt-3 text-xs">Partner code: <b className="text-gold">{partnerCode}</b></p>}
            <div className="my-6 rounded-2xl bg-muted p-4">
              <div className="text-3xl font-semibold md:text-4xl">${price}<span className="text-base font-normal text-muted-foreground">/month</span></div>
              <div className="text-xs text-muted-foreground">{path === "agency" ? "Agency · unlimited agents" : "Agent"} · keep 100% of your comp</div>
            </div>
            <Button variant="ink" size="lg" className="w-full" onClick={onLaunch} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Launch ${name}`}
            </Button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
