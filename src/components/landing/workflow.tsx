/**
 * From new lead to active policy, in the order the work actually happens.
 *
 * ── Why this section exists at all ──
 *
 * A feature list answers "what does it have". It does not answer the question
 * an agent actually has, which is "how much of my day does this replace". The
 * seven steps below are one client's journey through the product, and the
 * point of drawing them in sequence is the sentence underneath: the
 * information is entered once and carried, rather than retyped into a CRM, a
 * spreadsheet, a carrier portal and a group chat.
 *
 * Every step names a screen that exists. Nothing here is aspirational.
 */

import {
  UserPlus, ListChecks, Send, Shield, Trophy, Wallet, Sparkles,
  type LucideIcon,
} from "lucide-react";
import { LandingSection, SectionHead, FadeUp } from "./primitives";

type Step = {
  icon: LucideIcon;
  title: string;
  body: string;
  /** The screen this happens on, so the claim is checkable. */
  where: string;
};

const STEPS: Step[] = [
  {
    icon: UserPlus,
    title: "Add or import the lead",
    body: "Type one in, or bring a book across from a spreadsheet or a carrier report.",
    where: "Pipeline",
  },
  {
    icon: ListChecks,
    title: "Work it through the stages",
    body: "Notes, appointments, and the next action — with the ones going quiet marked as needing attention.",
    where: "Pipeline",
  },
  {
    icon: Send,
    title: "Post the deal",
    body: "The client is already there, so the deal form opens with their details and the carrier's own product list.",
    where: "Post a Deal",
  },
  {
    icon: Shield,
    title: "The policy joins the book",
    body: "Carrier, premium, effective date, draft day and the anniversary, tracked from the day it is written.",
    where: "Book of Business",
  },
  {
    icon: Trophy,
    title: "Production updates",
    body: "The same deal moves your dashboard and your agency's leaderboard the moment it is posted.",
    where: "Dashboard · Leaderboard",
  },
  {
    icon: Wallet,
    title: "Commission and override are worked out",
    body: "Advance and deferral on your own contract, and the spread up the hierarchy, from the comp grid you configured.",
    where: "Finances",
  },
  {
    icon: Sparkles,
    title: "Nova keeps the relationship going",
    body: "Birthdays, policy anniversaries and lapse follow-up, and the in-force book ranked by what is most at risk.",
    where: "Nova AI",
  },
];

export function WorkflowSection() {
  return (
    <LandingSection id="workflow" event="workflow_viewed" className="border-t border-border">
      <SectionHead
        eyebrow="One connected record"
        title="From new lead to active policy, everything stays connected."
        copy="Enter the information once. Agent Cloud carries it through your pipeline, production, book of business, finances and follow-up."
      />

      <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <FadeUp key={s.title} delay={i * 40}>
            <li className="h-full rounded-[var(--radius)] border border-border bg-surface-1 p-5">
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                  aria-hidden
                >
                  <s.icon className="h-4 w-4" />
                </span>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                  Step {i + 1}
                </span>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-foreground">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              <p className="mt-3 text-[11px] font-medium uppercase tracking-wider text-primary">
                {s.where}
              </p>
            </li>
          </FadeUp>
        ))}
      </ol>

      <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground">
        No re-keying the same client into four systems, and no month-end spent working out
        which numbers are the real ones.
      </p>
    </LandingSection>
  );
}
