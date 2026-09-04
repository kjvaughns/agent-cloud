/**
 * Four product stories, not twelve equal cards.
 *
 * A grid of feature tiles gives every capability the same weight, which is the
 * same as giving none of them any. These are the four things an agent or an
 * owner opens the product to do, each with the screen that does it beside the
 * words — so the claim and the evidence are on the same row.
 *
 * The screens are rendered from the application's own components and tokens
 * rather than photographed, which is why they are sharp on any display, reflow
 * on a phone, and cannot go stale the way a folder of PNGs does. They are
 * shipped screens on sample data. Nothing in them is a number we invented to
 * look impressive: no customer names, no testimonials, no fabricated totals.
 */

import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing-analytics";
import { LandingSection, SectionHead, FadeUp, display } from "./primitives";
import { Screen, type ScreenKey } from "./screens";
import { LiveDashboard } from "./live-demos";

type Story = {
  id: string;
  eyebrow: string;
  title: string;
  copy: string;
  points: string[];
  /** A rendered product screen, or the animated dashboard. */
  visual: ScreenKey | "dashboard";
};

const STORIES: Story[] = [
  {
    id: "pipeline",
    eyebrow: "Pipeline and deal posting",
    title: "Know exactly who needs your attention.",
    copy:
      "Every lead, client, note, appointment and next action in one list. Move people through your stages, and post the deal the day the policy is written.",
    points: [
      "Stages you move a client through, not a status nobody updates",
      "Anyone going quiet is marked as needing attention",
      "Post a Deal opens with the client and the carrier's own products already filled in",
    ],
    visual: "retention",
  },
  {
    id: "book",
    eyebrow: "Book of business",
    title: "Your entire book, finally organised.",
    copy:
      "Every submitted and active policy, with the carrier, the premium, the writing number, the effective date, the draft day and the anniversary — kept from the day it is written.",
    points: [
      "Client and policy records that stay tied together",
      "Status from submitted through issued, active and lapsed",
      "The dates that decide whether a policy survives its first year",
    ],
    visual: "commissions",
  },
  {
    id: "dashboard",
    eyebrow: "Dashboard and leaderboard",
    title: "See the score while the month is still happening.",
    copy:
      "Agents see their own production and what needs doing today. Agencies see a live board across the whole organisation, so nobody has to ask how the month is going.",
    points: [
      "Personal production, month to date, against a goal you set",
      "A live agency leaderboard every agent can see",
      "The same figures on every screen, from one definition of production",
    ],
    visual: "dashboard",
  },
  {
    id: "team",
    eyebrow: "Team, contracts and invitations",
    title: "Build the team without losing the details.",
    copy:
      "Invite agents, set who reports to whom, and track carrier contracts and writing numbers so every producer knows what they are actually appointed to write.",
    points: [
      "Invitations that place a new agent in the hierarchy on arrival",
      "Contract status per carrier, from requested to appointed",
      "Writing numbers and compensation levels held against the agent, not a spreadsheet",
    ],
    visual: "contracting",
  },
];

export function ProductStories() {
  return (
    <LandingSection id="product" event="tour_viewed" className="border-t border-border">
      <SectionHead
        eyebrow="The product"
        title="Everything agents actually use to run their business."
        copy="Four screens carry most of the work. Here they are, doing it."
      />

      <div className="mt-12 space-y-16 lg:space-y-24">
        {STORIES.map((s, i) => (
          <Story key={s.id} story={s} flip={i % 2 === 1} />
        ))}
      </div>
    </LandingSection>
  );
}

function Story({ story, flip }: { story: Story; flip: boolean }) {
  return (
    <FadeUp>
      <div
        id={story.id}
        className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14 scroll-mt-24"
      >
        <div className={cn(flip && "lg:order-2")}>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
            {story.eyebrow}
          </p>
          <h3
            className="mt-3 text-2xl md:text-3xl font-bold tracking-tight text-foreground text-balance"
            style={display}
          >
            {story.title}
          </h3>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{story.copy}</p>
          <ul className="mt-5 space-y-2.5">
            {story.points.map((p) => (
              <li key={p} className="flex gap-2.5 text-sm text-muted-foreground">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                <span className="leading-relaxed">{p}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* The product is dark; the page is not. Keeping the frame on the
            application's own palette is what makes it read as the product
            rather than as an illustration of it. */}
        <div className={cn("dark", flip && "lg:order-1")}>
          {story.visual === "dashboard" ? (
            <LiveDashboard />
          ) : (
            <Screen screen={story.visual} />
          )}
        </div>
      </div>
    </FadeUp>
  );
}

/** The two paths out of the product section, one per buyer. */
export function AudienceSplit({ ctaHref }: { ctaHref: string }) {
  return (
    <LandingSection id="for-agents" event="agents_viewed" className="border-t border-border">
      <SectionHead
        eyebrow="Who it is for"
        title="One platform, two very different jobs."
        copy="A solo agent is running a business alone. An agency owner is running one through other people. The product does both; the day looks nothing alike."
      />

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <FadeUp>
          <div className="flex h-full flex-col rounded-[var(--radius)] border border-border bg-surface-1 p-6 md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              Solo agents
            </p>
            <h3
              className="mt-3 text-xl md:text-2xl font-bold tracking-tight text-foreground"
              style={display}
            >
              Stop running your business from scattered spreadsheets.
            </h3>
            <ul className="mt-5 flex-1 space-y-2.5">
              {[
                "Leads and clients in one list instead of three",
                "Every deal and policy tracked from written to active",
                "Your own production, month to date",
                "Carrier contracts and writing numbers in one place",
                "The client dates that decide whether a policy sticks",
                "Add Nova when you want the follow-up handled for you",
              ].map((b) => (
                <li key={b} className="flex gap-2.5 text-sm text-muted-foreground">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span className="leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
            <Button asChild className="mt-6 w-full sm:w-auto" onClick={() => track("solo_cta_clicked")}>
              <Link to={ctaHref}>
                Start as a solo agent <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </FadeUp>

        <FadeUp delay={80}>
          <div
            id="for-agencies"
            className="flex h-full flex-col rounded-[var(--radius)] border-2 border-primary/40 bg-surface-1 p-6 md:p-8 scroll-mt-24"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              Agencies
            </p>
            <h3
              className="mt-3 text-xl md:text-2xl font-bold tracking-tight text-foreground"
              style={display}
            >
              Give the whole agency one operating system.
            </h3>

            {/* The strongest reason a large agency moves, so it is the largest
                thing in the card rather than the fifth bullet down. */}
            <div className="mt-5 rounded-[var(--radius)] border border-primary/30 bg-primary/5 p-4">
              <p className="text-lg font-bold text-foreground" style={display}>
                Unlimited agents. No seat charges.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                One flat price for the agency, whether you have eight producers or four hundred.
                Adding an agent does not change the bill.
              </p>
            </div>

            <ul className="mt-5 flex-1 space-y-2.5">
              {[
                "Hierarchy and team management in one chart",
                "An agency-wide leaderboard every agent can see",
                "Contracting visibility across every carrier and producer",
                "Compensation levels and hierarchy override tracking",
                "Agent invitations and onboarding",
                "Nova profit share eligibility on agent subscriptions",
              ].map((b) => (
                <li key={b} className="flex gap-2.5 text-sm text-muted-foreground">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <span className="leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
            <Button
              asChild
              className="mt-6 w-full sm:w-auto"
              onClick={() => track("agency_cta_clicked")}
            >
              <Link to="/demo">
                Book an agency demo <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </FadeUp>
      </div>
    </LandingSection>
  );
}
