import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { LandingSection, SectionHead, FadeUp, display } from "./primitives";
import { useInView, useCountUp } from "./motion";

/**
 * Breadth and proof.
 *
 * EverythingSection answers "does it do the thing I need?" by showing that the
 * answer is almost always yes. Every card names a surface that exists in the
 * application — this list is checked against the routes, not aspirational.
 *
 * ByTheNumbers answers "what does that get me?" without inventing a customer
 * we do not have. Every figure is a fact about the product, and the section
 * says so out loud. A made-up "saves 8 hours a week" is worth less than a true
 * "ten tools become one", and it costs trust the first time someone asks where
 * the number came from.
 */

const CAPABILITIES = [
  "Recruiting", "Onboarding", "Licensing", "Contracting", "Agent profiles",
  "Hierarchy", "Clients", "Policies", "Book of business", "Retention",
  "Commissions", "Reconciliation", "Tasks", "Reports", "Team analytics",
  "Leaderboards", "Nova AI", "Phone", "SMS", "Calendar",
  "Documents", "Imports", "Automations", "Permissions", "White label",
];

export function EverythingSection() {
  return (
    <LandingSection id="everything" className="border-t border-border/60">
      <SectionHead
        eyebrow="Breadth"
        title="Everything your agency needs."
        copy="Not a roadmap. These are surfaces in the product today."
      />

      <div className="mt-12 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {CAPABILITIES.map((c, i) => (
          <div
            key={c}
            className={cn(
              "ac-float ac-lift flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5",
              "hover:border-primary/40",
            )}
            // Staggered so the grid breathes as a field rather than pulsing in
            // unison. Disabled wholesale under reduced motion, in CSS.
            style={{ animationDelay: `${(i % 5) * 420 + Math.floor(i / 5) * 160}ms` }}
          >
            <Check className="h-3.5 w-3.5 shrink-0 text-success" />
            <span className="truncate text-xs font-medium text-foreground">{c}</span>
          </div>
        ))}
      </div>
    </LandingSection>
  );
}

// ── By the numbers ──────────────────────────────────────────────────────────

function Figure({ value, suffix, label, copy, delay }: {
  value: number; suffix?: string; label: string; copy: string; delay: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const n = useCountUp(value, 1100, inView);

  return (
    <FadeUp delay={delay}>
      <div ref={ref} className="rounded-2xl border border-border bg-card p-5 h-full">
        <div className="tnum flex items-baseline text-4xl font-bold text-gold-bright md:text-5xl" style={display}>
          {Math.round(n)}
          {suffix && <span className="text-2xl md:text-3xl">{suffix}</span>}
        </div>
        <div className="mt-2 text-sm font-semibold text-foreground">{label}</div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{copy}</p>
      </div>
    </FadeUp>
  );
}

export function ByTheNumbers({ includedSeats }: { includedSeats: number }) {
  return (
    <LandingSection id="numbers" className="border-t border-border/60 bg-surface-2/30">
      <SectionHead
        eyebrow="The math"
        title="What consolidating actually buys you."
        copy="Counted from the product, not from a case study we do not have yet."
      />

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          value={10}
          label="Tools become one"
          copy="Applicant tracking, onboarding, licensing, contracting, CRM, policies, commissions, retention, tasks and reporting — one login, one bill, one place to look."
          delay={0}
        />
        <Figure
          value={1}
          label="Record per person"
          copy="An applicant becomes an agent without being retyped. Licensing, contracting, production and retention all hang off that same record."
          delay={80}
        />
        <Figure
          value={0}
          suffix="%"
          label="Of your commission"
          copy="Agent Cloud is software, not an IMO. We never take an override, never own your carrier contracts, and never recruit your agents."
          delay={160}
        />
        <Figure
          value={includedSeats}
          label="Active users included"
          copy={`The Agency plan covers ${includedSeats} active users before any per-user charge. Pending invitations are not billed until they are accepted.`}
          delay={240}
        />
      </div>

      <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
        Every figure above is a fact about how Agent Cloud is built and priced. We are not going to
        quote you an hours-saved number until we have real agencies to measure it on — and when we
        do, we will tell you whose agencies they were.
      </p>
    </LandingSection>
  );
}
