import { useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing-analytics";
import { LandingSection, SectionHead, FadeUp, display } from "./primitives";

// ── The problem ─────────────────────────────────────────────────────────────

const FRAGMENTED = [
  "Applicants tracked in a spreadsheet",
  "Agents onboarded over text messages",
  "Licensing stored in a shared folder",
  "Contracting handled through email",
  "Clients in a generic CRM",
  "Policies tracked by hand",
  "Commissions reconciled in Excel",
  "Lapses discovered after the fact",
  "Staff work scattered across chats",
];

export function ProblemSection() {
  return (
    <LandingSection id="problem" className="border-t border-border/60">
      <SectionHead
        eyebrow="The problem"
        title="Your agency should not require ten disconnected systems to operate."
        copy="Every handoff between tools is a place where information is re-keyed, delayed, or lost entirely."
      />

      <div className="mt-14 grid gap-6 lg:grid-cols-[1fr_auto_1fr] items-center">
        <FadeUp>
          <div className="rounded-2xl border border-destructive/25 bg-destructive/[0.04] p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-destructive font-semibold">Today</p>
            <ul className="mt-4 space-y-2.5">
              {FRAGMENTED.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive/70" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </FadeUp>

        <div className="hidden lg:flex items-center justify-center">
          <ArrowRight className="h-7 w-7 text-primary" />
        </div>

        <FadeUp delay={120}>
          <div className="rounded-2xl border border-primary/30 bg-primary/[0.05] p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">With Agent Cloud</p>
            <p className="mt-4 text-2xl font-bold text-foreground leading-snug" style={display}>
              One connected operation.
            </p>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Recruiting, onboarding, licensing, contracting, clients, policies, retention,
              commissions, tasks and reporting share the same records. A person hired in
              recruiting is the same record that produces business, and the same record whose
              retention you protect.
            </p>
            <ul className="mt-5 space-y-2.5">
              {["Nothing re-keyed between steps", "One source of truth per agent and client", "Work visible to the people responsible for it"].map((x) => (
                <li key={x} className="flex items-start gap-2.5 text-sm text-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </FadeUp>
      </div>
    </LandingSection>
  );
}

// ── Platform map ────────────────────────────────────────────────────────────

const MODULES: { name: string; copy: string }[] = [
  { name: "Recruiting", copy: "Track every applicant from first contact to activated agent." },
  { name: "Onboarding", copy: "Give every new agent a structured checklist and visible progress." },
  { name: "Licensing", copy: "Keep state licenses, renewals, and gaps in one view." },
  { name: "Contracting", copy: "Carrier requests, required documents, and outstanding issues in one workspace." },
  { name: "Agents", copy: "One profile per producer — hierarchy, status, production, documents." },
  { name: "Clients", copy: "Insurance-specific records, not a generic contact list." },
  { name: "Policies", copy: "Organize the book without depending on spreadsheets." },
  { name: "Retention", copy: "Identify at-risk policies early and assign follow-up before business lapses." },
  { name: "Commissions", copy: "Estimate, import, reconcile, and track commission activity across the agency." },
  { name: "Tasks", copy: "Assign work, set due dates, and see what is actually getting done." },
  { name: "Reporting", copy: "Understand production, placement, retention, and operational health." },
  { name: "Nova AI", copy: "An assistant that works inside your agency's data — and only what each user may see." },
];

export function PlatformMap() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <LandingSection id="platform" className="border-t border-border/60">
      <SectionHead
        eyebrow="The platform"
        title="Twelve modules. One system of record."
        copy="Each one is useful alone. Together they are what makes the agency run."
      />

      <div className="mt-12 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {MODULES.map((m, i) => {
          const on = active === m.name;
          return (
            <FadeUp key={m.name} delay={i * 35}>
              <button
                onMouseEnter={() => setActive(m.name)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(m.name)}
                onBlur={() => setActive(null)}
                onClick={() => { setActive(on ? null : m.name); track("screenshot_viewed", { module: m.name }); }}
                aria-expanded={on}
                className={cn(
                  "h-full w-full rounded-xl border p-4 text-left transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                  on ? "border-primary/60 bg-primary/[0.06]" : "border-border bg-card hover:border-primary/40",
                )}
              >
                <h3 className="text-base font-bold text-foreground" style={display}>{m.name}</h3>
                <p
                  className={cn(
                    "text-xs text-muted-foreground leading-relaxed transition-all duration-300 overflow-hidden",
                    on ? "mt-2 max-h-24 opacity-100" : "mt-0 max-h-0 opacity-0 md:opacity-0",
                  )}
                >
                  {m.copy}
                </p>
                {/* Mobile has no hover, so the copy is always visible there. */}
                <p className="md:hidden mt-2 text-xs text-muted-foreground leading-relaxed">{m.copy}</p>
              </button>
            </FadeUp>
          );
        })}
      </div>
    </LandingSection>
  );
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

const LIFECYCLE = [
  "Applicant", "Recruit", "License", "Onboard", "Contract",
  "Activate", "Sell", "Track Policy", "Monitor Commission", "Protect Retention",
];

export function LifecycleSection() {
  return (
    <LandingSection id="lifecycle" event="lifecycle_viewed" className="border-t border-border/60 bg-surface-2/30">
      <SectionHead
        eyebrow="The differentiator"
        title="One record, from applicant to producing agent."
        copy="When you hire someone, they should not disappear into a different system. A recruiting profile becomes an agent profile — carrying onboarding, licensing, contracting, production and retention with it. Nothing is re-keyed. Nothing is lost between steps."
      />

      <div className="mt-14">
        {/* Desktop: horizontal chain. Mobile: vertical, which reads far better
            than a squeezed row of ten nodes. */}
        <ol className="flex flex-col md:flex-row md:flex-wrap md:justify-center gap-2 md:gap-0">
          {LIFECYCLE.map((step, i) => (
            <FadeUp key={step} delay={i * 60} className="md:contents">
              <li className="flex md:flex-col items-center gap-3 md:gap-2 md:px-1">
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full border text-xs font-bold tnum",
                    i === 0 ? "border-primary/60 bg-primary/15 text-primary" : "border-border bg-card text-muted-foreground",
                  )}
                  style={display}
                >
                  {i + 1}
                </span>
                <span className="text-sm md:text-[11px] md:text-center font-medium text-foreground md:max-w-[84px] leading-tight">
                  {step}
                </span>
                {i < LIFECYCLE.length - 1 && (
                  <span aria-hidden className="hidden md:block absolute" />
                )}
              </li>
            </FadeUp>
          ))}
        </ol>
        <div aria-hidden className="hidden md:block mt-6 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      </div>
    </LandingSection>
  );
}

// ── Roles ───────────────────────────────────────────────────────────────────

const ROLES = [
  {
    key: "owner", label: "Agency Owner",
    points: ["Full agency oversight", "Billing and seats", "Team hierarchy", "Reports", "Permissions", "Commission structures"],
  },
  {
    key: "manager", label: "Manager",
    points: ["Team performance", "Recruiting", "Onboarding", "Tasks", "Retention", "Coaching visibility"],
  },
  {
    key: "staff", label: "Staff",
    points: ["Operational queues", "Document processing", "Licensing", "Contracting", "Imports", "Support coordination"],
  },
  {
    key: "agent", label: "Agent",
    points: ["Personal clients", "Policies", "Production", "Commissions", "Retention", "Tasks and resources"],
  },
  {
    key: "solo", label: "Solo Agent",
    points: ["Personal CRM", "Book of business", "Commission tracking", "Retention", "Tasks", "Personal analytics"],
  },
];

export function RoleSection() {
  const [active, setActive] = useState(ROLES[0].key);
  const current = ROLES.find((r) => r.key === active)!;

  return (
    <LandingSection id="roles" className="border-t border-border/60">
      <SectionHead
        eyebrow="Built for every seat"
        title="One platform. A workspace designed for every role."
        copy="People see the tools and records their role calls for — enforced on the server and in the database, not just hidden in the interface."
      />

      {/* Desktop tabs */}
      <div className="mt-12 hidden md:block">
        <div className="flex flex-wrap justify-center gap-2" role="tablist">
          {ROLES.map((r) => (
            <button
              key={r.key}
              role="tab"
              aria-selected={active === r.key}
              onClick={() => { setActive(r.key); track("role_tab_viewed", { role: r.key }); }}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                active === r.key
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-border bg-card p-8">
          <h3 className="text-2xl font-bold text-foreground" style={display}>{current.label}</h3>
          <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3">
            {current.points.map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Mobile: accordion beats a row of five tabs on a phone. */}
      <div className="mt-10 md:hidden space-y-2">
        {ROLES.map((r) => {
          const on = active === r.key;
          return (
            <div key={r.key} className="rounded-xl border border-border bg-card overflow-hidden">
              <button
                onClick={() => { setActive(on ? "" : r.key); track("role_tab_viewed", { role: r.key }); }}
                aria-expanded={on}
                className="flex w-full items-center justify-between px-4 py-3.5 text-left"
              >
                <span className="font-semibold text-foreground">{r.label}</span>
                <span className={cn("text-primary transition-transform", on && "rotate-45")}>+</span>
              </button>
              {on && (
                <ul className="space-y-2.5 border-t border-border-soft px-4 py-3.5">
                  {r.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </LandingSection>
  );
}

// ── Ownership / trust ───────────────────────────────────────────────────────

export function OwnershipSection() {
  const NOTS = [
    "We are not your IMO or FMO",
    "We do not take commission overrides",
    "We do not own your carrier relationships",
    "We do not own your clients",
    "We do not recruit your agents",
    "We do not lock your data in",
  ];

  return (
    <LandingSection id="ownership" className="border-t border-border/60">
      <div className="rounded-3xl border border-primary/25 bg-primary/[0.04] p-8 md:p-14">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground" style={display}>
            Your agency. Your relationships. Your data.
          </h2>
          <p className="mt-5 text-muted-foreground leading-relaxed">
            Agent Cloud is software, not an IMO. Your hierarchy, your carrier contracts and your
            book stay yours — and you can export your data whenever you want it.
          </p>

          <div className="mt-8 grid gap-2.5 sm:grid-cols-2 text-left">
            {NOTS.map((n) => (
              <div key={n} className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                {n}
              </div>
            ))}
          </div>

          <p className="mt-8 text-lg font-semibold text-gold-bright" style={display}>
            Agent Cloud exists to make agencies more independent, not more dependent.
          </p>
        </div>
      </div>
    </LandingSection>
  );
}
