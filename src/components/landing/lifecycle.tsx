import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { LandingSection, SectionHead, display } from "./primitives";
import { useInView, useReducedMotion } from "./motion";

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

/**
 * Eight stages, not ten — and these are the states an agency actually names.
 *
 * The old ten were verbs from our side of the table (Applicant, Recruit,
 * License, Onboard, Contract, Activate, Sell, Policy, Commission, Retention).
 * These are the words an owner uses when somebody asks where a new agent is
 * at. "RTS" and "Placed" are not explained anywhere on this page on purpose:
 * explaining ready-to-sell to an agency owner tells them the page was not
 * written for them.
 */
const STEPS: { label: string; module: string; copy: string }[] = [
  { label: "Applicant", module: "Recruiting", copy: "Somebody applies. Where they came from, who spoke to them, what stage they are at — one card, not an inbox." },
  { label: "Licensed", module: "Licensing", copy: "Pre-licensing progress, then the resident and non-resident lines, with the renewal dates that bite you eighteen months out." },
  { label: "Contracted", module: "Contracting", copy: "Carrier requests submitted, packets tracked, and the appointment recorded when it comes back." },
  { label: "RTS", module: "Contracting", copy: "Writing number issued, E&O current, AML done. Same file — now they can actually sell something." },
  { label: "Writing", module: "Clients", copy: "Apps submitted against their own book, with the pipeline showing what is still out at the carrier." },
  { label: "Placed", module: "Policies", copy: "Issued and paid, by carrier and product. Submitted is a number; this is the one that pays." },
  { label: "Persisting", module: "Retention", copy: "Ranked for lapse risk before the draft fails, and 4, 7 and 13-month persistency measured the way the carriers measure it." },
  { label: "Renewing", module: "Commissions", copy: "The advance, the trail months and any chargeback, calculated the moment the statement posts." },
];

const DWELL = 1600;

export function LifecycleSection() {
  const { ref, inView } = useInView<HTMLDivElement>(0.25);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();

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
        eyebrow="How it works"
        title="One record. Recruit to renewal."
        copy="The person you recruit is the same record that gets contracted, gets a writing number, writes business, and shows up in your override. Nobody retypes anything into a second system, so nothing falls between them."
      />

      <div
        ref={ref}
        className="mt-10"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* ── Desktop: horizontal chain ── */}
        <div className="hidden md:block">
          <div className="relative">
            {/* Track, and the fill that chases the marker. Inset to the first
                and last node centres: with N equal cells those sit at
                100/(2N)% from each end, so the inset has to be derived rather
                than hardcoded — it was `left-[5%]` for the old ten stages and
                would overshoot both ends now that there are eight. */}
            <div
              aria-hidden
              className="absolute top-[18px]"
              style={{ left: `${50 / STEPS.length}%`, right: `${50 / STEPS.length}%` }}
            >
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
          <div className="mx-auto mt-8 min-h-[132px] max-w-2xl rounded-2xl border border-primary/25 bg-primary/[0.04] p-6 text-center">
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
