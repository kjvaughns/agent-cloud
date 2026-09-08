/**
 * One sale, seven clicks: the only demo on the page.
 *
 * The page used to carry three separate demos — pipeline, commission math,
 * retention — and one of them still showed hot/warm/cold lead tags that the
 * product removed weeks ago. Three demos also split the visitor's attention
 * across three small points instead of making the one large point: you enter a
 * deal once, and every screen updates.
 *
 * So this walks a single policy from a prospect card through posting, the book,
 * the leaderboard, commissions, Nova and the agency owner's view. Sample data,
 * no account, one obvious button per step, back and replay available, single
 * column on a phone.
 *
 * ── The numbers ──
 *
 * The commission figures are the real model, not decoration:
 *   $100/mo  ->  $1,200 ALP
 *   9-month advance  ->  $1,200 x 9/12  =  $900 advanceable
 *   writer at 80%    ->  $900 x 80%     =  $720
 *   upline at 100%   ->  $900 x 20%     =  $180
 *   upline at 125%   ->  $900 x 25%     =  $225
 * Trail months 10-12 pay the as-earned balance ($80, $20, $25 a month), which
 * is exactly how src/lib/commission-calculator.ts schedules them. If that
 * model changes, this has to change with it.
 */

import { useState } from "react";
import {
  ArrowRight, ArrowLeft, RotateCcw, Check, CircleDot, TrendingUp,
  BookOpen, Trophy, DollarSign, Sparkles, Building2, ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing-analytics";
import { LandingSection, SectionHead, display } from "./primitives";

type StepKey = "pipeline" | "post" | "book" | "leaderboard" | "finances" | "nova" | "agency";

const STEPS: { key: StepKey; tab: string; icon: typeof CircleDot; action: string; caption: string }[] = [
  { key: "pipeline",    tab: "Pipeline",         icon: CircleDot,     action: "Mark as sold",          caption: "A prospect you've already met with. One button when the application is signed." },
  { key: "post",        tab: "Post the deal",    icon: ClipboardList, action: "Submit the deal",       caption: "The client is already filled in. Carrier, product and advance come from your own contract." },
  { key: "book",        tab: "Book of business", icon: BookOpen,      action: "See the leaderboard",   caption: "The policy is in your book the moment you submit it, with the dates that decide whether it sticks." },
  { key: "leaderboard", tab: "Leaderboard",      icon: Trophy,        action: "See the commission",    caption: "Agency-wide production updates for everyone, including you." },
  { key: "finances",    tab: "Finances",         icon: DollarSign,    action: "See what Nova did",     caption: "Your advance and both uplines' overrides, off the same sale." },
  { key: "nova",        tab: "Nova AI",          icon: Sparkles,      action: "Switch to agency view", caption: "Nova picks the sale up and handles the follow-up nobody remembers." },
  { key: "agency",      tab: "Agency view",      icon: Building2,     action: "Start over",            caption: "The owner sees the same sale in team production, finances and the board." },
];

export function DealJourney() {
  const [i, setI] = useState(0);
  const step = STEPS[i];

  const go = (next: number) => {
    const n = (next + STEPS.length) % STEPS.length;
    setI(n);
    track("tour_screen_viewed", { step: STEPS[n].key });
  };

  return (
    <LandingSection id="demo" event="tour_viewed" className="border-t border-border">
      <SectionHead
        eyebrow="Try it"
        title="Post one deal. Watch everything else update."
        copy="Seven clicks on sample data. No account, no card, nothing to install."
      />

      <div className="mx-auto mt-10 max-w-5xl">
        {/* Progress. Tabs are reachable directly on a wide screen; on a phone
            they collapse to the count and the caption, because seven tabs at
            360px is a row of unreadable stubs. */}
        <div className="hidden md:flex items-center gap-1.5">
          {STEPS.map((s, idx) => (
            <button
              key={s.key}
              onClick={() => go(idx)}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold transition-colors",
                idx === i
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : idx < i
                    ? "border-border bg-surface-2 text-muted-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
              )}
              aria-current={idx === i ? "step" : undefined}
            >
              {idx < i ? <Check className="h-3.5 w-3.5 shrink-0 text-success" /> : <s.icon className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">{s.tab}</span>
            </button>
          ))}
        </div>

        <div className="md:hidden flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
            <step.icon className="h-4 w-4 text-primary" /> {step.tab}
          </span>
          <span className="tnum text-xs text-muted-foreground">Step {i + 1} of {STEPS.length}</span>
        </div>
        <div className="md:hidden mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${((i + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{step.caption}</p>

        {/* The product panel keeps the app's own dark palette so it reads as
            the product rather than an illustration of it. */}
        <div className="dark mt-4 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2.5">
            <span className="flex gap-1.5">
              {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
                <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c, opacity: 0.55 }} />
              ))}
            </span>
            <span className="ml-2 truncate text-[11px] text-muted-foreground">
              {step.tab} — Agent Cloud
            </span>
          </div>
          <div className="p-4 md:p-6">
            <Panel step={step.key} />
          </div>
        </div>

        <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-11" onClick={() => go(i - 1)} disabled={i === 0}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
            <Button variant="ghost" size="sm" className="h-11 text-muted-foreground" onClick={() => go(0)}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Replay
            </Button>
          </div>
          <Button className="h-12 w-full text-base sm:w-auto" onClick={() => go(i + 1)}>
            {step.action} <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
    </LandingSection>
  );
}

// ── Panels ──────────────────────────────────────────────────────────────────

const CLIENT = "Marcus Whitfield";

function Panel({ step }: { step: StepKey }) {
  switch (step) {
    case "pipeline": return <PipelinePanel />;
    case "post": return <PostPanel />;
    case "book": return <BookPanel />;
    case "leaderboard": return <LeaderboardPanel />;
    case "finances": return <FinancesPanel />;
    case "nova": return <NovaPanel />;
    case "agency": return <AgencyPanel />;
  }
}

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="mt-1 truncate rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground">
        {value}
      </div>
      {hint && <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0", className)}>{children}</div>;
}

function PipelinePanel() {
  const stages = ["New lead", "Contacted", "Appointment", "Presented", "Sold"];
  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto pb-2">
        {stages.map((s, i) => (
          <span
            key={s}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              i === 3 ? "border-primary/50 bg-primary/10 text-foreground" : "border-border text-muted-foreground",
            )}
          >
            {s}
          </span>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-primary/40 bg-surface-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-bold text-foreground" style={display}>{CLIENT}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Age 41 · Texas · (512) 555-0148</div>
          </div>
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            Presented
          </span>
        </div>
        <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
          <div>Quoted $100/mo · Final expense · 20-year term</div>
          <div>Last note: wants coverage in place before the 1st. Bank draft on the 2nd Wednesday.</div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        A stage you actually move someone through, and a note that says what happened last.
      </p>
    </div>
  );
}

function PostPanel() {
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Client" value={CLIENT} hint="Carried over from the pipeline card" />
        <Field label="Carrier" value="Mutual of Omaha" hint="Only carriers you're appointed with" />
        <Field label="Product" value="Living Promise — Level" hint="Products configured on that carrier" />
        <Field label="Monthly premium" value="$100.00" hint="Annualised to $1,200 ALP" />
        <Field label="Effective date" value="03 / 01 / 2026" />
        <Field label="Policy number" value="LP-4429183" />
        <Field label="Your comp level" value="80%" hint="From your own carrier contract" />
        <Field label="Advance" value="9 months" hint="Your contract's advance term, not a default" />
      </div>
      <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
        This is the only form in the journey. Everything after this is calculated.
      </div>
    </div>
  );
}

function BookPanel() {
  return (
    <div>
      <div className="rounded-xl border border-border bg-surface-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-bold text-foreground" style={display}>{CLIENT}</div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">Mutual of Omaha · LP-4429183</div>
          </div>
          <span className="shrink-0 rounded-full border border-success/30 bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
            Submitted
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 text-xs sm:grid-cols-4">
          {[
            ["Monthly", "$100.00"],
            ["Annual (ALP)", "$1,200.00"],
            ["Effective", "03/01/2026"],
            ["Draft day", "2nd Wednesday"],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0 py-1">
              <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{k}</div>
              <div className="tnum mt-0.5 truncate font-semibold text-foreground">{v}</div>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Status moves submitted → issued → paid → active as the carrier reports it. The anniversary
        and draft day are kept from day one, because that is what first-year persistency turns on.
      </p>
    </div>
  );
}

function LeaderboardPanel() {
  const rows = [
    { name: "Jordan Ellis", alp: "$18,420", me: false },
    { name: "You", alp: "$14,760", me: true },
    { name: "Priya Raman", alp: "$13,980", me: false },
    { name: "Dev Okonkwo", alp: "$11,240", me: false },
  ];
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
        Agency leaderboard — month to date
      </div>
      <div className="mt-2">
        {rows.map((r, i) => (
          <Row key={r.name}>
            <span className="flex min-w-0 items-center gap-3">
              <span className="tnum w-5 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
              <span className={cn("truncate text-sm", r.me ? "font-bold text-foreground" : "text-muted-foreground")}>
                {r.name}
              </span>
              {r.me && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                  <TrendingUp className="h-3 w-3" /> +$1,200
                </span>
              )}
            </span>
            <span className="tnum shrink-0 text-sm font-semibold text-foreground">{r.alp}</span>
          </Row>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        One definition of production, on every screen. Nobody has to ask how the month is going.
      </p>
    </div>
  );
}

function FinancesPanel() {
  return (
    <div>
      <div className="rounded-xl border border-border bg-surface-1 p-4">
        <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Advanceable premium</div>
        <div className="tnum mt-1 text-2xl font-bold text-gold-bright" style={display}>$900.00</div>
        <div className="mt-1 text-xs text-muted-foreground">$1,200 ALP × 9 of 12 months advanced</div>
      </div>

      <div className="mt-3">
        <Row>
          <span className="min-w-0 text-sm text-foreground">You — advance at 80%</span>
          <span className="tnum shrink-0 text-sm font-semibold text-foreground">$720.00</span>
        </Row>
        <Row>
          <span className="min-w-0 text-sm text-muted-foreground">Upline at 100% — 20% override</span>
          <span className="tnum shrink-0 text-sm font-semibold text-foreground">$180.00</span>
        </Row>
        <Row>
          <span className="min-w-0 text-sm text-muted-foreground">Upline at 125% — 25% override</span>
          <span className="tnum shrink-0 text-sm font-semibold text-foreground">$225.00</span>
        </Row>
      </div>

      <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3 text-xs leading-relaxed text-muted-foreground">
        Then, while the client keeps paying: <span className="text-foreground">trail</span> in months 10, 11
        and 12 — $80 to you, $20 and $25 to the uplines — and a{" "}
        <span className="text-foreground">renewal</span> at the carrier's renewal percentage from month 13.
        If the policy lapses, everything scheduled after the lapse date stops.
      </div>
    </div>
  );
}

function NovaPanel() {
  const items = [
    { text: "Welcome message drafted for the client", state: "Available" },
    { text: "Draft-day reminder set for the 2nd Wednesday", state: "Available" },
    { text: "Policy anniversary follow-up scheduled", state: "Available" },
    { text: "Retention watch on the first 12 months", state: "Available" },
  ];
  return (
    <div>
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.text} className="flex items-start gap-3 rounded-lg border border-border bg-surface-1 p-3">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span className="min-w-0 flex-1 text-sm leading-snug text-foreground">{it.text}</span>
            <span className="shrink-0 rounded-full border border-success/30 bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
              {it.state}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Nova is an add-on and requires an active Solo or Agency licence. Anything not yet running is
        marked "Coming soon" in the Nova section below — never here.
      </p>
    </div>
  );
}

function AgencyPanel() {
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Team production MTD", "$58,400", "+$1,200 from this sale"],
          ["Override due to you", "$180.00", "9-month advance window"],
          ["Policies in force", "312", "+1"],
        ].map(([k, v, s]) => (
          <div key={k} className="min-w-0 rounded-xl border border-border bg-surface-1 p-4">
            <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{k}</div>
            <div className="tnum mt-1 text-xl font-bold text-foreground" style={display}>{v}</div>
            <div className="mt-0.5 text-[11px] text-success">{s}</div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        That is the whole point: the agent entered the deal once. The book, the board, the team
        production, the commission schedule and the follow-up all came from that one entry.
      </p>
    </div>
  );
}
