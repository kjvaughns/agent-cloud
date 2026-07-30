import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { LandingSection, SectionHead, display } from "./primitives";
import { useInView, prefersReducedMotion } from "./motion";

/**
 * The agency lifecycle, animated.
 *
 * Ten static circles ask the visitor to read ten labels and infer that they
 * connect. Moving through them says the same thing in about three seconds:
 * this is one continuous record, and each stage hands to the next without a
 * gap. The line filling behind the marker is the actual claim — it is the
 * handoff, drawn.
 *
 * The animation starts when the section is on screen, pauses under the cursor
 * or keyboard focus so a visitor can read a stage, and does not run at all
 * under reduced motion — where every stage is simply shown complete, with the
 * first one selected.
 */

const STEPS: { label: string; module: string; copy: string }[] = [
  { label: "Applicant", module: "Recruiting", copy: "Someone applies. Source, contact details and stage land on one card — not in an inbox." },
  { label: "Recruit", module: "Recruiting", copy: "Screening calls, interviews and follow-up all attach to that same card." },
  { label: "License", module: "Licensing", copy: "Pre-licensing progress, then state licenses with the renewal dates that matter later." },
  { label: "Onboard", module: "Onboarding", copy: "A structured checklist: background check, E&O, carrier training, direct deposit." },
  { label: "Contract", module: "Contracting", copy: "Carrier requests submitted and required documents chased until they are done." },
  { label: "Activate", module: "Agents", copy: "The applicant becomes an agent. Same record, now producing — nothing retyped." },
  { label: "Sell", module: "Clients", copy: "Leads worked through the pipeline and deals posted against the agent's own book." },
  { label: "Policy", module: "Policies", copy: "Placed business organized by carrier, product and status — without a spreadsheet." },
  { label: "Commission", module: "Commissions", copy: "The advance, the trail months and any chargeback, calculated the moment it posts." },
  { label: "Retention", module: "Retention", copy: "A payment failure opens a case with an owner and a clock, before the policy lapses." },
];

const DWELL = 1600;

export function LifecycleSection() {
  const { ref, inView } = useInView<HTMLDivElement>(0.25);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => { setReduced(prefersReducedMotion()); }, []);

  useEffect(() => {
    if (!inView || paused || reduced) return;
    const id = setInterval(() => setActive((i) => (i + 1) % STEPS.length), DWELL);
    return () => clearInterval(id);
  }, [inView, paused, reduced]);

  const current = STEPS[active];
  // Under reduced motion the chain reads as a finished path rather than a
  // progress bar frozen at 0%.
  const fill = reduced ? 100 : (active / (STEPS.length - 1)) * 100;

  return (
    <LandingSection
      id="lifecycle"
      event="lifecycle_viewed"
      className="border-t border-border/60 bg-surface-2/30"
    >
      <SectionHead
        eyebrow="The differentiator"
        title="One record, from applicant to producing agent."
        copy="When you hire someone they should not disappear into a different system. A recruiting profile becomes an agent profile — carrying onboarding, licensing, contracting, production and retention with it."
      />

      <div
        ref={ref}
        className="mt-14"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* ── Desktop: horizontal chain ── */}
        <div className="hidden md:block">
          <div className="relative">
            {/* Track, and the fill that chases the marker. Inset to the first
                and last node centres — ten equal cells put those at 5% and
                95%, and a line running the full width reads as a bar that
                overshoots the chain at both ends. */}
            <div aria-hidden className="absolute left-[5%] right-[5%] top-[18px]">
              <div className="h-px w-full bg-border" />
              <div
                className="absolute left-0 top-0 h-px bg-primary"
                style={{
                  width: `${fill}%`,
                  transition: reduced ? "none" : "width .6s cubic-bezier(.22,.61,.36,1)",
                  boxShadow: "0 0 12px var(--gold)",
                }}
              />
            </div>

            <ol className="relative flex justify-between">
              {STEPS.map((s, i) => {
                const done = i < active;
                const on = i === active;
                return (
                  <li key={s.label} className="flex flex-1 flex-col items-center px-1">
                    <button
                      onClick={() => setActive(i)}
                      onFocus={() => { setActive(i); setPaused(true); }}
                      onBlur={() => setPaused(false)}
                      aria-current={on ? "step" : undefined}
                      className={cn(
                        "tnum grid h-9 w-9 place-items-center rounded-full border text-xs font-bold transition-all duration-500",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                        on
                          ? "scale-110 border-primary bg-primary text-gold-foreground shadow-[0_0_0_6px_var(--gold-glow)]"
                          : done || reduced
                            ? "border-primary/60 bg-primary/15 text-primary"
                            : "border-border bg-card text-muted-foreground",
                      )}
                      style={display}
                    >
                      {i + 1}
                    </button>
                    <span
                      className={cn(
                        "mt-2 max-w-[86px] text-center text-[11px] font-medium leading-tight transition-colors duration-500",
                        on ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {s.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* The detail panel. Fixed height so the page does not jump as the
              copy changes length under it. */}
          <div className="mx-auto mt-10 min-h-[132px] max-w-2xl rounded-2xl border border-primary/25 bg-primary/[0.04] p-6 text-center">
            <div key={active} className="ac-screen-in">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                {current.module}
              </p>
              <h3 className="mt-2 text-2xl font-bold text-foreground" style={display}>
                {current.label}
              </h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {current.copy}
              </p>
            </div>
          </div>

          {!reduced && (
            <p className="mt-4 text-center text-[11px] text-text-dim">
              {paused ? "Paused — move away to resume" : "Hover to pause · click a stage to hold it"}
            </p>
          )}
        </div>

        {/* ── Mobile: vertical chain, same state ── */}
        <ol className="relative space-y-1 md:hidden">
          <div aria-hidden className="absolute bottom-3 left-[17px] top-3 w-px">
            <div className="h-full w-px bg-border" />
            <div
              className="absolute left-0 top-0 w-px bg-primary"
              style={{
                height: `${fill}%`,
                transition: reduced ? "none" : "height .6s cubic-bezier(.22,.61,.36,1)",
              }}
            />
          </div>
          {STEPS.map((s, i) => {
            const on = i === active;
            const done = i < active;
            return (
              <li key={s.label} className="relative">
                <button
                  onClick={() => setActive(on ? -1 : i)}
                  aria-expanded={on}
                  className="flex w-full items-start gap-3 rounded-lg py-1.5 text-left"
                >
                  <span
                    className={cn(
                      "tnum z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border text-xs font-bold transition-all",
                      on
                        ? "border-primary bg-primary text-gold-foreground"
                        : done || reduced
                          ? "border-primary/60 bg-primary/15 text-primary"
                          : "border-border bg-card text-muted-foreground",
                    )}
                    style={display}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 pt-1">
                    <span className={cn("block text-sm font-semibold", on ? "text-foreground" : "text-muted-foreground")}>
                      {s.label}
                    </span>
                    {on && (
                      <>
                        <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                          {s.module}
                        </span>
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                          {s.copy}
                        </span>
                      </>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </LandingSection>
  );
}
