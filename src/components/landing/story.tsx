import { ArrowRight, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LandingSection, SectionHead, display } from "./primitives";
import { useInView, useCountUp, useReducedMotion } from "./motion";

/**
 * The problem, and the ownership promise.
 *
 * This file used to also hold PlatformMap (twelve module cards) and
 * RoleSection (a five-tab interactive). Both are gone, and the reason is worth
 * keeping: the page inventoried the product three separate times in a row —
 * twelve modules, then fifteen screens, then twenty-five chips — with three
 * different counts of the same thing. Whatever each section added on its own,
 * together they read as a brochure rather than an argument. One inventory
 * survives, the feature bands, and it is the one attached to screenshots.
 */

// ── The problem ─────────────────────────────────────────────────────────────

/**
 * Six, not nine — and each one named by what it costs, not where it lives.
 *
 * "Applicants tracked in a spreadsheet" describes a filing problem. "Recruits
 * sitting in a spreadsheet instead of writing" describes the same fact as
 * money, which is the only way an agency owner reads a list like this. Every
 * line here is one they are living this morning.
 */
const FRAGMENTED = [
  "Recruits sitting in a spreadsheet instead of writing",
  "Licenses in a shared folder nobody opens until one expires",
  "Carrier appointments chased over email for weeks",
  "Commission statements taken on faith",
  "Lapses found on next month's report",
  "Nobody sure whose job it was",
];

/**
 * The scatter each fragmented row starts from.
 *
 * Fixed per index rather than random: a random offset would differ between the
 * server render and the client hydration, and the row would visibly jump on
 * load. These are hand-picked to look unplanned without being unplanned.
 */
const SCATTER = [
  { x: -14, y: -6, r: -2.2 },
  { x: 10, y: 4, r: 1.6 },
  { x: -8, y: 8, r: 2.4 },
  { x: 16, y: -4, r: -1.4 },
  { x: -12, y: 6, r: 1.9 },
  { x: 8, y: -8, r: -2.6 },
];

export function ProblemSection() {
  const { ref, inView } = useInView<HTMLDivElement>(0.25);
  // Read once at render rather than inside the style callback — calling
  // matchMedia per row would be six queries per paint for one boolean. The
  // hook rather than the bare function, because reading matchMedia during
  // render makes the server and the client disagree.
  const still = useReducedMotion();

  return (
    <LandingSection id="problem" className="border-t border-border/60">
      <SectionHead
        eyebrow="The problem"
        title="Every gap between systems is money on the floor."
        copy="A recruit waiting three weeks on an appointment is a recruit not writing. A statement nobody checks is a shortfall nobody finds. Every handoff between tools is somewhere a dollar or a producer goes missing."
      />

      <div ref={ref} className="mt-10 grid gap-6 lg:grid-cols-[1fr_auto_1fr] items-center">
        {/*
          The motion IS the argument here, which is the only reason it earns
          its cost: the left column settles in scattered and slightly rotated,
          the right snaps into one aligned stack. Somebody who scrolls past
          without reading a word still sees the difference.

          Under reduced motion both sides render static and aligned — the
          argument survives without the animation, which is the test any
          flourish has to pass.
        */}
        <div className="rounded-2xl border border-destructive/25 bg-destructive/[0.04] p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-destructive font-semibold">Today</p>
          <ul className="mt-4 space-y-2.5">
            {FRAGMENTED.map((f, i) => {
              const s = SCATTER[i % SCATTER.length];
              return (
                <li
                  key={f}
                  className="flex items-start gap-2.5 text-sm text-muted-foreground transition-all duration-700 ease-out"
                  style={
                    still
                      ? undefined
                      : {
                          opacity: inView ? 1 : 0,
                          transform: inView
                            ? "none"
                            : `translate(${s.x}px, ${s.y}px) rotate(${s.r}deg)`,
                          transitionDelay: `${i * 70}ms`,
                        }
                  }
                >
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive/70" />
                  {f}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="hidden lg:flex items-center justify-center">
          <ArrowRight className="h-7 w-7 text-primary" />
        </div>

        <div
          className="rounded-2xl border border-primary/30 bg-primary/[0.05] p-6 transition-all duration-700 ease-out"
          style={
            still
              ? undefined
              : {
                  opacity: inView ? 1 : 0,
                  transform: inView ? "none" : "translateY(14px)",
                  // After the last scattered row has landed, so the snap reads
                  // as a consequence of the mess rather than a parallel event.
                  transitionDelay: "460ms",
                }
          }
        >
          <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold">With Agent Cloud</p>
          <p className="mt-4 text-2xl font-bold text-foreground leading-snug" style={display}>
            One file. Nothing falls through.
          </p>
          {/* The sentence this replaces read "a person hired in recruiting is
              the same record that produces business, and the same record whose
              retention you protect." Two problems: it called a person a record,
              and it was wrong — retention protects the *client's* policy, not
              the producer's. It collapsed two different people into one row to
              make the rhythm work. */}
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Recruiting, licensing, contracting, the book, commissions and conservation all run off
            the same file. The person you hired is the person writing six months later, and their
            clients are the ones whose policies you keep on the books.
          </p>
          {/* No bullet list under this paragraph. "Nothing re-keyed between
              steps" is the hero subhead verbatim, and the other two are the
              paragraph directly above restated as fragments. The six red lines
              opposite are the argument; this side only has to be the answer. */}
        </div>
      </div>
    </LandingSection>
  );
}

// ── Ownership / trust ───────────────────────────────────────────────────────

/**
 * Four, not six.
 *
 * "We do not own your clients" and "We do not recruit your agents" are the two
 * that land hardest on a buyer used to IMO-provided software, so they stay
 * alongside the override and the data-export promise. The two dropped — not
 * your IMO, not your carrier relationships — are restated in the paragraph
 * above the grid anyway.
 */
const NOTS = [
  "We do not take commission overrides",
  "We do not own your clients",
  "We do not recruit your agents",
  "We do not lock your data in",
];

export function OwnershipSection() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  const zero = useCountUp(0, 900, inView);

  return (
    <LandingSection id="ownership" className="border-t border-border/60">
      <div className="rounded-3xl border border-primary/25 bg-primary/[0.04] p-8 md:p-10">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground" style={display}>
            Your agency. Your relationships. Your data.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground leading-relaxed">
            Agent Cloud is software, not an IMO. Your hierarchy, your carrier contracts and your
            book stay yours — and you can export your data whenever you want it.
          </p>

          {/*
            The figure and the list are the same claim, so they sit side by
            side rather than stacked. Stacked, they were 300px of centred
            column saying one thing twice; beside each other the number reads
            as the headline and the four lines as its footnotes.
          */}
          <div ref={ref} className="mt-8 grid items-center gap-8 text-left md:grid-cols-[auto_1fr]">
            {/*
              The one figure worth keeping from the four-stat band this
              replaces. "Ten tools become one" restated the headline and "one
              record per person" restated the lifecycle section; both were the
              page agreeing with itself. This one is a commercial fact a buyer
              can check.

              useCountUp animates *to* zero, which sounds pointless and is not
              — the number ticking down and stopping is what makes somebody
              read it rather than skim past a percentage.
            */}
            <div className="flex flex-col items-center md:items-start">
              <div className="tnum flex items-baseline text-6xl font-bold text-gold-bright md:text-7xl" style={display}>
                {Math.round(zero)}
                <span className="text-4xl md:text-5xl">%</span>
              </div>
              <div className="mt-1 text-sm font-semibold text-foreground">Of your commission</div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              {NOTS.map((n) => (
                <div key={n} className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  {n}
                </div>
              ))}
            </div>
          </div>

          {/*
            Two paragraphs where there were four. The role sentence is all that
            survives of the five-tab role interactive — somebody evaluating
            this for a team needs to know permissions are real, and a clause
            carries that as well as a tab rail did. The honesty sentence is
            kept verbatim: it builds more trust than any invented statistic
            would, and softening it would cost exactly what it buys.
          */}
          <p className="mx-auto mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Owners, managers, back office and producers each see what their role calls for,
            enforced in the database rather than hidden in the interface. And we are not going to
            quote you an hours-saved number until we have real agencies to measure it on — when we
            do, we will tell you whose agencies they were.
          </p>

          <p className="mt-6 text-lg font-semibold text-gold-bright" style={display}>
            Agent Cloud exists to make agencies more independent, not more dependent.
          </p>
        </div>
      </div>
    </LandingSection>
  );
}
