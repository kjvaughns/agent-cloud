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
    eyebrow: "Getting them ready to sell",
    title: "Green agent to ready-to-sell, without the email thread.",
    copy: "Every carrier request sits in one queue with a name on it and a clock running. You can see who's waiting on you, who's waiting on the carrier, and who's been sitting eleven days because somebody forgot to send the packet.",
    points: [
      "Carrier requests routed to whoever actually submits them",
      "Writing numbers where the whole team can find them",
      // The deck said "License, E&O and AML expirations". Licences carry an
      // expiry and E&O carries one (`team-roster.ts` raises `eo_expiring` off
      // it); AML is tracked as present-or-missing with no date, so promising
      // an AML expiry alert would be promising a column that does not exist.
      "License and E&O expirations before they expire, and AML flagged when it's missing",
      "Every request timestamped, so you learn which carriers are slow",
    ],
  },
  {
    screen: "commissions",
    eyebrow: "What you actually got paid",
    title: "The carrier shorted you. Would you know?",
    copy: "Upload the statement. Every line matches to a policy and gets checked against what your grid says should have been paid. Chargebacks read as chargebacks. The lines that don't match get listed, not hidden.",
    points: [
      // Not PDF. The statement uploader accepts `.csv,.xlsx,.xls` and nothing
      // else (finances_.reconciliation.tsx) — the general importer's PDF
      // support is a different pipeline, and naming a format the upload dialog
      // rejects is a claim a prospect disproves inside ten minutes of a trial.
      "Statements in as CSV or XLSX",
      "Matched on policy number first, then name, amount and date",
      "Compared line by line against your comp grid",
      "Variance reported in dollars",
    ],
  },
  {
    screen: "retention",
    eyebrow: "Keeping what you wrote",
    // Beta, and the pill is the honest label rather than a hedge. The scan
    // scores what the schema holds — months in force, premium against face,
    // days since contact — and `lapse-risk.ts` names two signals it cannot
    // read yet (payment mode, prior NSF history) because the columns do not
    // exist. A ranking missing two of its inputs is a beta.
    status: "beta",
    title: "Find the lapse before the draft fails.",
    copy: "Policies ranked by lapse risk before the payment fails — not a queue that opens after the carrier already told you. Every case has an owner and a clock, and your save rate becomes a number you manage instead of a surprise you eat.",
    points: [
      "Ranked by risk, not by whoever complained loudest",
      "Premium at risk, in dollars",
      "Save rate measured over time",
      // "Nova drafts the outreach" without the qualifier reads as included.
      // Nova Pro is a paid add-on and the compliance screen sits behind it.
      "Nova Pro drafts the outreach — you make the call",
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
