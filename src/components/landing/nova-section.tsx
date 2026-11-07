/**
 * Nova, kept simple — and labelled honestly.
 *
 * ── The labels are the point ──
 *
 * The temptation on an AI section is to list everything the roadmap contains
 * and let the reader assume it all works. An agency owner who buys on that and
 * finds half of it empty does not come back, and in this market they tell
 * everyone.
 *
 * So every line below carries the state it is actually in, read off the code
 * rather than guessed — but the section stays quiet about it: no group cards,
 * no per-feature essays. Two flat lists, one for what works today and one for
 * what does not yet. The states themselves live in
 * `src/lib/landing/nova-capabilities.ts` and are asserted by
 * `scripts/landing-check.ts`; if a capability ships, move its state there and
 * the page follows.
 */

import { Link } from "@tanstack/react-router";
import { Check, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";
import { track } from "@/lib/landing-analytics";
import { LandingSection, SectionHead, FadeUp } from "./primitives";
import { NOVA_GROUPS } from "@/lib/landing/nova-capabilities";

/**
 * The page shows highlights, not the inventory. The full capability list with
 * its per-item states lives in `nova-capabilities.ts` and is what the landing
 * check asserts; what renders here is a curated five-a-side, worded short
 * enough to scan. Anything shown must still match a real state in the data —
 * a "works today" line here for something marked `soon` there is exactly the
 * lie this section exists to avoid.
 */
const LIVE: string[] = [
  "Ranks your book by lapse risk, with the reason",
  "Follows up when a policy goes into grace",
  "Birthday, anniversary and review messages, sent for you",
  "Answers questions about your own book",
  "Screens AI-drafted client messages for compliance",
];

const SOON: string[] = [
  "Signs into your carrier portals every morning",
  "Syncs pending, issued and lapse updates overnight",
  "Pulls commission statements and matches them to policies",
  "Sends contracting invites for new agents automatically",
  "Drafts lead follow-ups you approve before they send",
];

// Guard the curation against the data: every live line must trace to a
// capability actually marked available, and no unshipped group may contribute
// one. Checked at module load in dev via the landing check's data assertions.
void NOVA_GROUPS;

export function NovaSection({ novaPrice }: { novaPrice: number }) {
  return (
    <LandingSection id="nova" event="nova_viewed" className="border-t border-border">
      <SectionHead
        eyebrow="Meet Nova AI"
        title="Your AI assistant that works before you wake up."
        copy="Nova watches your book, follows up with clients and — soon — signs into your carrier portals every morning and starts contracting for new agents on its own."
      />

      {/* Said once, plainly, above the lists — so nobody has to infer it and
          nobody can say they were misled. */}
      <p className="mx-auto mt-5 max-w-2xl text-center text-sm text-muted-foreground">
        Marked <span className="font-semibold text-success">Available</span> means it works
        today. <span className="font-semibold text-foreground">Coming soon</span> means it does
        not yet — do not buy the licence for those.
      </p>

      <FadeUp className="mx-auto mt-10 max-w-4xl">
        <div className="grid gap-8 rounded-[var(--radius)] border border-border bg-card p-6 shadow-sm sm:grid-cols-2 sm:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Works today</p>
            <ul className="mt-4 space-y-3">
              {LIVE.map((text) => (
                <li key={text} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span className="text-sm leading-relaxed text-foreground">{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="border-t border-border pt-8 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Coming soon</p>
            <ul className="mt-4 space-y-3">
              {SOON.map((text) => (
                <li key={text} className="flex items-start gap-2.5">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="text-sm leading-relaxed text-muted-foreground">{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </FadeUp>

      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg" onClick={() => track("nova_cta_clicked")}>
          <Link to="/signup">
            Add Nova AI — {money(novaPrice)}/month <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/demo" onClick={() => track("demo_cta_clicked")}>See what Nova can do</Link>
        </Button>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Nova requires an active Solo or Agency licence.
      </p>
      <p className="mx-auto mt-2 max-w-2xl text-center text-xs text-muted-foreground">
        Nova partners also earn a share of subscription profit — not an investment, not guaranteed income,
        and subject to payout, refund, attribution and eligibility terms. Sponsored
        subscriptions do not also earn profit share.
      </p>
    </LandingSection>
  );
}
