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
 * Three bands, alternating, each with a real screenshot. Licensing and
 * contracting are merged because they are one job to the buyer — the person
 * chasing a state licence is the person chasing the carrier appointment, on
 * the same Tuesday, for the same agent.
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
    title: "One queue for the paperwork that blocks production.",
    copy: "A new agent needs state licences and carrier appointments before they can write anything, and both stall on documents somebody has to chase. They sit in the same queue here, against the same agent record, with an owner and an age on every item.",
    points: [
      "Carrier requests and required documents in one workspace",
      "Licence renewals and gaps surfaced before they block an appointment",
      "Writing numbers recorded against the agent, not in a spreadsheet",
    ],
  },
  {
    // Rewritten against what actually shipped in the reconciliation work —
    // the old copy predated it and described a reconcile that only matched on
    // policy number and never looked at the comp grid.
    screen: "commissions",
    eyebrow: "Commissions",
    title: "Reconcile the statement the carrier actually sent.",
    // CSV and Excel, not PDF. The statement uploader accepts
    // `.csv,.xlsx,.xls` and nothing else (finances_.reconciliation.tsx), and
    // the general importer's PDF support is a different pipeline. Naming a
    // format the upload dialog rejects is the kind of claim a prospect
    // disproves in the first ten minutes of a trial.
    copy: "Carrier statements arrive as CSV and Excel, with title rows, subtotals and a policy column that is blank on exactly the lines worth checking. Leave all of it in — they are read as they came, including accounting negatives, so a chargeback reads as a chargeback rather than a payment of the same size.",
    points: [
      "Lines match on policy number first, then on name, amount and date",
      "Every matched line compared against what the comp grid says was owed",
      "Unmatched lines listed, not hidden",
      "Nova answers from these same records, bounded by what the person asking may see",
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
    title: "Rank the book before the draft fails, not after.",
    copy: "A policy in grace is already a rescue. The scan scores every in-force policy on how likely it is to lapse — months in force, premium against the death benefit, how long since anyone spoke to the client — and every point of the score traces to a sentence you can disagree with.",
    points: [
      "In-force policies ranked by lapse risk, with the reason for each",
      "Follow-up tasks created from the ranking, one per client",
      "Payment failures still open a case with an owner and a clock",
      "Save rate and premium at risk measured over time",
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
          title="Three jobs, on one record."
          copy="The screens your team works in every day — not a mood board."
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
