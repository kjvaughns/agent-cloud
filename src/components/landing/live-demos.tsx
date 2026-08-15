import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Flame, Snowflake, Thermometer, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { track } from "@/lib/landing-analytics";
import { LandingSection, SectionHead, display } from "./primitives";
import { useInView, useCountUp } from "./motion";

/**
 * Live demos.
 *
 * These are real, interactive versions of screens that exist in the product,
 * running on sample data. They are deliberately not videos or screenshots —
 * the point is that a visitor can move a card, change a premium, or work a
 * retention case and watch the platform respond the way it actually does.
 *
 * Every calculation here mirrors shipped behaviour. The commission demo in
 * particular uses the same 75/25 advance split as commission-calculator.ts,
 * because a demo that computes a different number than the product is worse
 * than no demo at all.
 */

type Tab = "pipeline" | "commissions" | "retention";

const TABS: { key: Tab; label: string; caption: string }[] = [
  { key: "pipeline", label: "Pipeline", caption: "Move a lead through the stages." },
  { key: "commissions", label: "Commissions", caption: "Change the premium and watch the schedule." },
  { key: "retention", label: "Retention", caption: "Work an at-risk policy to an outcome." },
];

export function LiveDemos() {
  const [tab, setTab] = useState<Tab>("pipeline");

  return (
    <LandingSection id="demo" className="border-t border-border/60">
      <SectionHead
        eyebrow="Try it"
        title="This isn't a marketing mockup."
        copy="Click around. This is the actual application on sample data — move a case down the pipeline, change a premium and watch the comp recalculate, work a conservation case. It responds the way it will for your team."
      />

      <div className="mt-10 flex flex-wrap justify-center gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => { setTab(t.key); track("screenshot_viewed", { demo: t.key }); }}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-semibold transition-all",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
              tab === t.key
                ? "border-primary/50 bg-primary/10 text-primary scale-[1.03]"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        {TABS.find((t) => t.key === tab)!.caption}
      </p>

      <div className="mt-6 rounded-2xl border border-border bg-card p-4 sm:p-6 overflow-hidden">
        {tab === "pipeline" && <PipelineDemo />}
        {tab === "commissions" && <CommissionDemo />}
        {tab === "retention" && <RetentionDemo />}
      </div>
    </LandingSection>
  );
}

// ── Pipeline ────────────────────────────────────────────────────────────────

type Lead = { id: string; name: string; premium: number; temp: "hot" | "warm" | "cold"; stage: number };

const STAGES = ["New Lead", "Contacted", "Quoted", "Application", "Placed"];

const SEED: Lead[] = [
  { id: "1", name: "Marcus Bell", premium: 1840, temp: "hot", stage: 0 },
  { id: "2", name: "Dana Whitfield", premium: 960, temp: "warm", stage: 1 },
  { id: "3", name: "Rosa Iglesias", premium: 2400, temp: "hot", stage: 2 },
  { id: "4", name: "Tom Okafor", premium: 640, temp: "cold", stage: 1 },
  { id: "5", name: "Priya Raman", premium: 3100, temp: "warm", stage: 3 },
];

const TEMP_ICON = { hot: Flame, warm: Thermometer, cold: Snowflake } as const;
const TEMP_CLS = {
  hot: "text-destructive",
  warm: "text-warning",
  cold: "text-info",
} as const;

function PipelineDemo() {
  const [leads, setLeads] = useState<Lead[]>(SEED);
  const [moved, setMoved] = useState<string | null>(null);

  const advance = (id: string) => {
    setLeads((ls) =>
      ls.map((l) => (l.id === id ? { ...l, stage: Math.min(STAGES.length - 1, l.stage + 1) } : l)),
    );
    setMoved(id);
    track("screenshot_viewed", { demo: "pipeline", action: "advance" });
  };

  const placedAlp = leads.filter((l) => l.stage === STAGES.length - 1).reduce((a, l) => a + l.premium, 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Click a card to move it forward. Placed ALP updates as you go.
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Placed ALP</span>
          <span
            key={placedAlp}
            className="tnum rounded-md px-2 py-0.5 text-sm font-bold text-gold-bright ac-pulse"
            style={display}
          >
            {money(placedAlp)}
          </span>
          <button
            onClick={() => { setLeads(SEED); setMoved(null); }}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5 md:gap-3">
        {STAGES.map((stage, si) => {
          const inStage = leads.filter((l) => l.stage === si);
          return (
            <div key={stage} className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-1">
                <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {stage}
                </span>
                <span className="tnum text-[10px] text-text-dim">{inStage.length}</span>
              </div>

              <div className="min-h-[92px] space-y-2 rounded-lg border border-border-soft bg-surface-2/50 p-1.5">
                {inStage.map((l) => {
                  const Icon = TEMP_ICON[l.temp];
                  const last = si === STAGES.length - 1;
                  return (
                    <button
                      key={l.id}
                      onClick={() => !last && advance(l.id)}
                      disabled={last}
                      className={cn(
                        "ac-lift w-full rounded-lg border bg-card p-2 text-left",
                        moved === l.id && "ac-drop-in",
                        last
                          ? "border-success/40 cursor-default"
                          : "border-border hover:border-primary/50 cursor-pointer",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon className={cn("h-3 w-3 shrink-0", TEMP_CLS[l.temp])} />
                        <span className="truncate text-[11px] font-medium text-foreground">{l.name}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="tnum text-[10px] text-muted-foreground">{money(l.premium)}</span>
                        {last
                          ? <Check className="h-3 w-3 text-success" />
                          : <ArrowRight className="h-3 w-3 text-text-dim" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Commissions ─────────────────────────────────────────────────────────────

/**
 * Mirrors commission-calculator.ts exactly:
 *   standard — 75% advance on the effective date, the remaining 25% split
 *              evenly across months 9, 10 and 11
 *   GTL      — min(50% of year one, $600), balance spread over months 7–12
 */
function CommissionDemo() {
  const [premium, setPremium] = useState(1800);
  const [level, setLevel] = useState(90);
  const [gtl, setGtl] = useState(false);

  const yr1 = premium * (level / 100);
  const advance = gtl ? Math.min(yr1 * 0.5, 600) : yr1 * 0.75;
  const balance = yr1 - advance;
  const trailMonths = gtl ? [7, 8, 9, 10, 11, 12] : [9, 10, 11];
  const perTrail = balance / trailMonths.length;

  const { ref, inView } = useInView<HTMLDivElement>();
  const shown = useCountUp(advance, 700, inView);

  return (
    <div ref={ref} className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="space-y-5">
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="d-prem" className="text-xs font-semibold text-foreground">Annual premium</label>
            <span className="tnum text-sm text-gold-bright">{money(premium)}</span>
          </div>
          <input
            id="d-prem" type="range" min={300} max={6000} step={20}
            value={premium}
            onChange={(e) => setPremium(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--gold)]"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="d-lvl" className="text-xs font-semibold text-foreground">Your commission level</label>
            <span className="tnum text-sm text-gold-bright">{level}%</span>
          </div>
          <input
            id="d-lvl" type="range" min={40} max={140} step={5}
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--gold)]"
          />
        </div>

        <button
          onClick={() => setGtl((g) => !g)}
          className={cn(
            "w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors",
            gtl ? "border-primary/50 bg-primary/10 text-foreground" : "border-border bg-surface-2 text-muted-foreground",
          )}
        >
          <span className="font-semibold">GTL advance rules</span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {gtl ? "50% advance, capped at $600, balance over months 7–12" : "Standard: 75% advance, balance over months 9–11"}
          </span>
        </button>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          These are the same rules the platform applies when you post a deal — carrier exceptions
          included.
        </p>
      </div>

      <div className="min-w-0">
        <div className="rounded-xl border border-primary/30 bg-primary/[0.05] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
            Advance on effective date
          </p>
          <p className="tnum mt-1 text-4xl font-bold text-gold-bright" style={display}>
            {money(shown)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground tnum">
            Year one total {money(yr1)} · {level}% of {money(premium)}
          </p>
        </div>

        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          Remaining {money(balance)} schedule
        </p>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {trailMonths.map((m, i) => (
            <div
              key={m}
              className="min-w-[74px] flex-1 rounded-lg border border-border bg-surface-2 p-2.5 text-center"
              style={{ animation: `ac-drop-in .3s cubic-bezier(.22,.61,.36,1) ${i * 45}ms both` }}
            >
              <div className="text-[10px] text-muted-foreground">Mo {m}</div>
              <div className="tnum mt-0.5 text-sm font-semibold text-foreground">{money(perTrail)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Retention ───────────────────────────────────────────────────────────────

type Case = {
  id: string; client: string; policy: string; reason: string;
  premium: number; days: number;
  status: "open" | "working" | "saved" | "lost";
};

const CASES: Case[] = [
  { id: "a", client: "Angela Ruiz", policy: "MO-448120", reason: "Lapse pending", premium: 148, days: 6, status: "open" },
  { id: "b", client: "Derrick Combs", policy: "TA-991044", reason: "NSF", premium: 92, days: 12, status: "open" },
  { id: "c", client: "Nia Thompson", policy: "FOR-220718", reason: "Lapse pending", premium: 210, days: 3, status: "open" },
];

function RetentionDemo() {
  const [cases, setCases] = useState<Case[]>(CASES);

  const set = (id: string, status: Case["status"]) => {
    setCases((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)));
    track("screenshot_viewed", { demo: "retention", action: status });
  };

  const live = cases.filter((c) => c.status === "open" || c.status === "working");
  const atRisk = live.reduce((a, c) => a + c.premium, 0);
  const saved = cases.filter((c) => c.status === "saved").length;
  const lost = cases.filter((c) => c.status === "lost").length;
  const decided = saved + lost;

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {[
          { l: "Working", v: String(live.length) },
          { l: "Premium at risk", v: money(atRisk) },
          { l: "Save rate", v: decided ? `${Math.round((saved / decided) * 100)}%` : "—" },
        ].map((s) => (
          <div key={s.l} className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{s.l}</div>
            <div key={s.v} className="tnum mt-0.5 rounded text-lg font-bold text-foreground ac-pulse" style={display}>
              {s.v}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {cases.map((c) => {
          const done = c.status === "saved" || c.status === "lost";
          return (
            <div
              key={c.id}
              className={cn(
                "ac-lift flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3",
                c.status === "saved" && "border-success/40 bg-success/[0.04]",
                c.status === "lost" && "border-destructive/30 bg-destructive/[0.03] opacity-70",
                !done && "border-border",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{c.client}</span>
                  <span className="tnum text-[11px] text-muted-foreground">{c.policy}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{c.reason}</span>
                  <span className={cn(c.days > 10 && !done && "text-destructive font-medium")}>{c.days}d open</span>
                  <span className="tnum">{money(c.premium)}/mo</span>
                </div>
              </div>

              {done ? (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
                    c.status === "saved" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
                  )}
                >
                  {c.status}
                </span>
              ) : (
                <div className="flex gap-1.5">
                  {c.status === "open" && (
                    <button
                      onClick={() => set(c.id, "working")}
                      className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      Start working
                    </button>
                  )}
                  <button
                    onClick={() => set(c.id, "saved")}
                    className="rounded-md bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success hover:bg-success/25"
                  >
                    Saved
                  </button>
                  <button
                    onClick={() => set(c.id, "lost")}
                    className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-destructive"
                  >
                    Lost
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setCases(CASES)}
        className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <RotateCcw className="h-3 w-3" /> Reset
      </button>
    </div>
  );
}

// ── Animated hero dashboard ─────────────────────────────────────────────────

const TREND = [12, 16, 14, 19, 22, 20, 26, 31, 28, 36, 41, 39, 46, 52, 49, 58, 63, 67];

/**
 * Mirrors the real dashboard hero: four KPI tiles beside a large
 * month-to-date figure and a trend line. Numbers count up and the line draws
 * itself on first view.
 */
export function LiveDashboard() {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);

  const mtd = useCountUp(184320, 1500, inView);
  const today = useCountUp(6480, 1100, inView);
  const week = useCountUp(41200, 1300, inView);
  const active = useCountUp(312, 1200, inView);
  const team = useCountUp(742900, 1600, inView);

  const path = useMemo(() => {
    const w = 560, h = 120, max = Math.max(...TREND);
    const step = w / (TREND.length - 1);
    return TREND.map((v, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - (v / max) * h}`).join(" ");
  }, []);

  const [drawn, setDrawn] = useState(false);
  useEffect(() => { if (inView) setDrawn(true); }, [inView]);

  const kpis = [
    { label: "Today ALP", value: money(today), delta: "+$1,240", up: true },
    { label: "Week ALP", value: money(week), delta: "+18%", up: true },
    { label: "Active Policies", value: Math.round(active).toLocaleString(), delta: "+4 today", up: true },
    { label: "Team ALP", value: money(team), delta: "+11% MoM", up: true },
  ];

  return (
    <div ref={ref} className="mx-auto mt-14 max-w-5xl">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/40">
        {/* Window chrome, so it reads as the app rather than a graphic. */}
        <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
          <span className="flex gap-1.5">
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c, opacity: 0.55 }} />
            ))}
          </span>
          <span className="ml-2 text-[11px] text-muted-foreground">Dashboard — Agent Cloud</span>
        </div>

        <div className="grid md:grid-cols-[1fr_260px]">
          <div className="min-w-0 p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
              Month-to-date ALP
            </div>
            <div className="mt-1.5 flex items-baseline gap-3 flex-wrap">
              <span className="tnum text-4xl font-bold leading-none text-gold-bright" style={display}>
                {money(mtd)}
              </span>
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                +23%
              </span>
            </div>

            <svg viewBox="0 0 560 130" className="mt-5 w-full" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id="ac-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${path} L 560 130 L 0 130 Z`} fill="url(#ac-fill)" opacity={drawn ? 1 : 0} style={{ transition: "opacity .9s ease .5s" }} />
              <path
                d={path}
                fill="none"
                stroke="var(--gold)"
                strokeWidth="2.5"
                strokeLinecap="round"
                style={{
                  strokeDasharray: 1400,
                  strokeDashoffset: drawn ? 0 : 1400,
                  transition: "stroke-dashoffset 1.6s cubic-bezier(.22,.61,.36,1)",
                }}
              />
            </svg>
          </div>

          <div className="grid grid-cols-2 border-t border-border md:grid-cols-1 md:border-l md:border-t-0">
            {kpis.map((k, i) => (
              <div
                key={k.label}
                className={cn(
                  "p-4",
                  i < kpis.length - 1 && "md:border-b md:border-border",
                  i % 2 === 0 && "border-r border-border md:border-r-0",
                  i < 2 && "border-b border-border md:border-b",
                )}
              >
                <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{k.label}</div>
                <div className="tnum mt-1 text-lg font-bold text-foreground" style={display}>{k.value}</div>
                <div className="text-[10px] font-medium text-success">{k.delta}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
