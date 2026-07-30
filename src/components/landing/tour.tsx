import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing-analytics";
import { LandingSection, SectionHead, display } from "./primitives";
import { SCREENS, Screen, type ScreenKey } from "./screens";
import { useInView } from "./motion";

/**
 * The product tour.
 *
 * People buy software because they see software. Two shapes do that work here:
 *
 *   ProductTour  — every screen in the platform behind a tab rail, so a
 *                  visitor who wants to see all of it can, in one place,
 *                  without a fifteen-screen scroll.
 *   FeatureBands — the screens that carry the most weight, shown full size and
 *                  alternating, so someone who only scrolls still passes real
 *                  UI every few hundred pixels.
 *
 * Only the active tab renders. Fifteen mounted screens is a lot of DOM for a
 * page whose first job is to load fast.
 */

export function ProductTour() {
  const [active, setActive] = useState<ScreenKey>("dashboard");
  const railRef = useRef<HTMLDivElement>(null);
  const current = SCREENS.find((s) => s.key === active)!;

  // Keep the selected tab in view when it is chosen with the keyboard, and
  // when the rail is scrolled horizontally on a phone.
  useEffect(() => {
    const el = railRef.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [active]);

  return (
    <LandingSection id="tour" event="tour_viewed" className="border-t border-border/60">
      <SectionHead
        eyebrow="The product"
        title="Fifteen screens. One system."
        copy="Not a mood board — these are the screens your team works in every day."
      />

      {/* The rail scrolls past the fold on every screen size. The mask is the
          only thing telling a visitor there is more to the right — without it
          the last tab just looks clipped. */}
      <div
        ref={railRef}
        role="tablist"
        aria-label="Product screens"
        className={cn(
          "mt-10 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "[mask-image:linear-gradient(to_right,black_calc(100%-64px),transparent)]",
        )}
      >
        {SCREENS.map((s) => (
          <button
            key={s.key}
            data-tab={s.key}
            role="tab"
            aria-selected={active === s.key}
            onClick={() => { setActive(s.key); track("tour_screen_viewed", { screen: s.key }); }}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
              active === s.key
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{current.caption}</p>

      {/* Keyed on the active screen so each one animates in rather than
          swapping instantly, which read as a broken image. */}
      <div key={active} className="mt-4 ac-screen-in">
        <Screen screen={active} />
      </div>
    </LandingSection>
  );
}

// ── Alternating feature bands ───────────────────────────────────────────────

type Band = {
  screen: ScreenKey;
  eyebrow: string;
  title: string;
  copy: string;
  points: string[];
};

const BANDS: Band[] = [
  {
    screen: "recruiting",
    eyebrow: "Recruiting",
    title: "Hire without a spreadsheet in the middle.",
    copy: "Every applicant sits on one board from first contact to first sale. When someone activates, the record does not get retyped into another system — it becomes the agent.",
    points: ["Stages you can actually see", "Source and age on every applicant", "Activation creates the agent profile"],
  },
  {
    screen: "commissions",
    eyebrow: "Commissions",
    title: "Advances, trails and chargebacks, already calculated.",
    copy: "Post a deal and the schedule is there — the advance, the months the balance lands in, and the carrier exceptions that change it. Import a statement and it reconciles against what the platform expected.",
    points: ["Carrier-specific advance rules", "Statement import and matching", "Chargebacks tracked, not discovered"],
  },
  {
    screen: "retention",
    eyebrow: "Retention",
    title: "Find the lapse before the carrier tells you.",
    copy: "Payment failures and lapse notices open a case with an owner and a clock. The queue shows premium at risk and save rate, so retention is a number you manage instead of a surprise you absorb.",
    points: ["Cases open automatically", "Owner and age on every case", "Save rate measured over time"],
  },
  {
    screen: "nova",
    eyebrow: "Nova AI",
    title: "An assistant that can only see what you can see.",
    copy: "Nova answers from your agency's live records and cites what it read. Permissions are enforced underneath it, so an agent asking about the book gets their book — not somebody else's.",
    points: ["Answers from live agency data", "Bounded by the asker's permissions", "Turns an answer into assigned work"],
  },
];

export function FeatureBands() {
  return (
    <div id="features" className="border-t border-border/60">
      {BANDS.map((b, i) => (
        <FeatureBand key={b.screen} band={b} flip={i % 2 === 1} />
      ))}
    </div>
  );
}

function FeatureBand({ band, flip }: { band: Band; flip: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.12);

  return (
    <section className={cn("py-16 md:py-20", flip && "bg-surface-2/30")}>
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
            style={{ opacity: inView ? 1 : 0, transform: inView ? "none" : "translateY(16px)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">{band.eyebrow}</p>
            <h3 className="mt-3 text-2xl font-bold tracking-tight text-foreground md:text-4xl" style={display}>
              {band.title}
            </h3>
            <p className="mt-4 leading-relaxed text-muted-foreground">{band.copy}</p>
            <ul className="mt-6 space-y-2.5">
              {band.points.map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-sm text-foreground">
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          <div
            className="min-w-0 transition-all duration-700 ease-out"
            style={{
              opacity: inView ? 1 : 0,
              transform: inView ? "none" : `translateX(${flip ? -20 : 20}px)`,
              transitionDelay: "120ms",
            }}
          >
            <Screen screen={band.screen} />
          </div>
        </div>
      </div>
    </section>
  );
}
