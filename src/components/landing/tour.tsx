import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { LandingSection, SectionHead, StatusPill, display } from "./primitives";
import { Screen, type ScreenKey } from "./screens";
import { useInView, useReducedMotion } from "./motion";

/**
 * The one place the product is inventoried.
 *
 * This file used to also export ProductTour — a fifteen-tab gallery of every
 * screen in the platform. It went, along with the twelve-card platform map and
 * the twenty-five-chip breadth grid, because the three of them ran back to
 * back and gave three different counts of the same product. Anybody who wants
 * to see all fifteen screens can book the demo; anybody who does not was being
 * asked to scroll past four complete pitches before reaching a price.
 *
 * The first three bands carry the copy from before the copy deck. The deck's
 * versions — "Getting them ready to sell" / "Green agent to ready-to-sell",
 * "What you actually got paid" / "The carrier shorted you", "Keeping what you
 * wrote" / "Find the lapse before the draft fails" — turned the eyebrows from
 * module names into sales lines, and read harder than the page wants to. The
 * eyebrow's job here is to tell somebody scanning on a phone which part of the
 * product they are looking at.
 *
 * Four bands, alternating, each with a real screenshot. Licensing and
 * contracting are merged because they are one job to the buyer — the person
 * chasing a state licence is the person chasing the carrier appointment, on
 * the same Tuesday, for the same agent.
 *
 * The fourth, "your agents", is the one no competitor in this category runs.
 * The loudest grievance in the industry is comp opacity — agents who have
 * never been shown the grid they are paid off. An owner who can hand an agent
 * their own numbers has a recruiting advantage over every upline who cannot,
 * and selling that advantage flatters the honest owner without ever attacking
 * IMOs, which matters because the buyer here *is* an upline.
 */

type Band = {
  screen: ScreenKey;
  eyebrow: string;
  title: string;
  copy: string;
  points: string[];
  /** Only when a band describes something not fully shipped. */
  status?: "beta" | "soon";
};

const BANDS: Band[] = [
  {
    screen: "contracting",
    eyebrow: "Contracting & licensing",
    title: "Nobody writes a case until they are appointed.",
    copy: "A new producer needs state licenses and carrier appointments before they can submit a single app, and both stall on documents somebody has to chase. They sit in one queue here, against the same producer file, with an owner and an age on every item — so you can see who has been waiting three weeks and on what.",
    points: [
      "Carrier appointments and required documents in one workspace",
      "License renewals and gaps surfaced before they cost you an appointment",
      "Writing numbers recorded against the producer, not in a spreadsheet",
    ],
  },
  {
    // Rewritten against what actually shipped in the reconciliation work —
    // the old copy predated it and described a reconcile that only matched on
    // policy number and never looked at the comp grid.
    screen: "commissions",
    eyebrow: "Commissions",
    title: "Check the carrier's math.",
    // CSV and Excel, not PDF. The statement uploader accepts
    // `.csv,.xlsx,.xls` and nothing else (finances_.reconciliation.tsx), and
    // the general importer's PDF support is a different pipeline. Naming a
    // format the upload dialog rejects is the kind of claim a prospect
    // disproves in the first ten minutes of a trial.
    copy: "Carrier statements come in as CSV and Excel, with title rows, subtotals and a policy number that is blank on exactly the lines worth checking. Leave all of it in — they are read as they came, including accounting negatives, so a chargeback reads as a chargeback rather than a payment the same size.",
    points: [
      "Lines match on policy number first, then on name, amount and date",
      "Every matched line checked against what your comp grid says you were owed",
      "Unmatched lines listed, not buried",
      "Nova answers off these same records, bounded by what the person asking may see",
    ],
  },
  {
    // Also rewritten. The old copy described cases opening from payment
    // failures, which is a rescue after the fact; the scan added in the
    // retention work scores the book before the draft fails.
    screen: "retention",
    eyebrow: "Retention",
    // Beta, and the pill is the honest label rather than a hedge. The scan
    // scores what the schema holds — months in force, premium against face,
    // days since contact — and `lapse-risk.ts` names two signals it cannot
    // read yet (payment mode, prior NSF history) because the columns do not
    // exist. A ranking missing two of its inputs is a beta.
    status: "beta",
    title: "Work the case before it lapses, not after.",
    copy: "A policy in grace is already a conservation case. The scan scores every in-force policy on how likely it is to lapse — months in force, premium against the death benefit, how long since anyone spoke to the client — and every point of the score traces back to a sentence you can argue with.",
    points: [
      "In-force policies ranked by lapse risk, with the reason for each",
      "Follow-up tasks created off the ranking, one per client",
      "Failed payments still open a case with an owner and a clock",
      "Save rate and premium at risk measured over time",
    ],
  },
  {
    // The band no competitor in the category runs, and the one that answers
    // "help my people make more money" directly. Every claim below is a screen
    // that already exists: /contracting/commission-grids reads the agent's own
    // levels, and placement + 4/7/13-month persistency come back scoped by RLS
    // to whatever the caller is allowed to see.
    screen: "grid",
    eyebrow: "Your agents",
    title: "Show them their grid. It's the best recruiting tool you've got.",
    copy: "Every agent sees their own contract level, their own placement rate and their own renewals. You decide what's visible. An agent who can see their own numbers doesn't call you asking where their money went — and doesn't leave because they think something's being hidden from them.",
    points: [
      "Their level and their grid, visible to them",
      // The deck said "placement rate and persistency, by carrier". Placement
      // and 4/7/13-month persistency are real and scoped per agent by RLS;
      // the per-carrier breakdown is not built, so it is not claimed.
      "Their placement rate, and 4, 7 and 13-month persistency",
      // The deck said "chargeback exposure before it lands". There is no
      // forward-looking exposure figure — `team-roster.ts` says outright that
      // chargebacks are inferred from negative rows after they post. So this
      // claims the thing that is true and still useful: they see it when you
      // do, rather than at year-end.
      "Chargebacks on their own schedule, the day they post",
      "What you show is your call — set per role",
    ],
  },
];

export function FeatureBands() {
  return (
    <div id="features" className="border-t border-border/60">
      {/* `md:pb-0`, not `pb-0`. LandingSection's own padding is `md:py-16`,
          which lives inside a media query and therefore lands later in the
          stylesheet than an unprefixed `pb-0` — so the override silently did
          nothing above 768px and the head kept a full section's worth of
          bottom padding above the first band. */}
      <LandingSection className="pb-0 md:pb-0">
        <SectionHead
          eyebrow="The product"
          title="Four jobs, one record per agent."
          copy="The screens your back office actually lives in, on sample data — not a mood board."
        />
      </LandingSection>

      {BANDS.map((b, i) => (
        <FeatureBand key={b.screen} band={b} flip={i % 2 === 1} />
      ))}
    </div>
  );
}

function FeatureBand({ band, flip }: { band: Band; flip: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.12);
  const still = useReducedMotion();

  return (
    // `overflow-x-clip` because the reveal below animates from
    // translateX(±20px). On a phone the content box already fills the viewport
    // minus its 16px gutters, so those 20px hang 4px past the right edge until
    // the band scrolls into view — enough to make the whole landing page shift
    // sideways under your thumb as you scroll past each section.
    //
    // Clip rather than hidden: `overflow: hidden` would make this a scroll
    // container and break `position: sticky` for anything inside it later.
    <section className={cn("overflow-x-clip py-10 md:py-14", flip && "bg-surface-2/30")}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div
          ref={ref}
          className={cn(
            "grid items-center gap-8 lg:grid-cols-2 lg:gap-14",
            flip && "lg:[&>*:first-child]:order-2",
          )}
        >
          <div
            className="transition-all duration-700 ease-out"
            style={still ? undefined : { opacity: inView ? 1 : 0, transform: inView ? "none" : "translateY(16px)" }}
          >
            <div className="flex items-center gap-2.5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">{band.eyebrow}</p>
              {/* A partial state gets a pill. Shipping a "Beta" label costs
                  nothing; a false "available" costs the deal on the demo call
                  where the prospect finds out. */}
              {band.status && <StatusPill status={band.status} />}
            </div>
            <h3 className="mt-3 text-2xl font-bold tracking-tight text-foreground md:text-4xl" style={display}>
              {band.title}
            </h3>
            <p className="mt-4 leading-relaxed text-muted-foreground">{band.copy}</p>
            <ul className="mt-6 space-y-2.5">
              {band.points.map((p, i) => (
                <li
                  key={p}
                  className="flex items-start gap-2.5 text-sm text-foreground transition-all duration-500 ease-out"
                  style={
                    still
                      ? undefined
                      : {
                          opacity: inView ? 1 : 0,
                          transform: inView ? "none" : "translateY(10px)",
                          transitionDelay: `${240 + i * 90}ms`,
                        }
                  }
                >
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <div
            className="min-w-0 transition-all duration-700 ease-out"
            style={
              still
                ? undefined
                : {
                    opacity: inView ? 1 : 0,
                    transform: inView ? "none" : `translateX(${flip ? -20 : 20}px)`,
                    transitionDelay: "120ms",
                  }
            }
          >
            <Screen screen={band.screen} />
          </div>
        </div>
      </div>
    </section>
  );
}
