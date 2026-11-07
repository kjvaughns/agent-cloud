/**
 * The Agency Suite — the sister tools that come with an Agency licence.
 *
 * An agency plan is not just the CRM: it also unlocks the other Agent Cloud
 * products automatically. This section says so on the marketing page, because
 * the pricing section answers "what does it cost" and this one answers "what
 * else is in the box".
 *
 * The four entries mirror the /tools page exactly (same names, same hosts).
 * If a tool's URL or pitch changes there, change it here too.
 */

import { Link } from "@tanstack/react-router";
import {
  GraduationCap, FileSignature, Landmark, School, ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/landing-analytics";
import { LandingSection, SectionHead, FadeUp, display } from "./primitives";

type SuiteTool = {
  key: string;
  name: string;
  icon: LucideIcon;
  blurb: string;
  comesWith: string;
};

const SUITE: SuiteTool[] = [
  {
    key: "licensing",
    name: "Licensing",
    icon: GraduationCap,
    blurb: "Plain-English prelicensing prep: short lessons, quick quizzes, flashcards and practice exams.",
    comesWith: "Your agency automatically becomes a licensing partner — discounted exam prep for every recruit you sponsor.",
  },
  {
    key: "bankdocs",
    name: "Bankdocs",
    icon: Landmark,
    blurb: "Generate voided checks and complete direct deposit forms for your carriers.",
    comesWith: "Contracting paperwork flows straight through Bankdocs — no separate account to manage.",
  },
  {
    key: "release",
    name: "Release Center",
    icon: FileSignature,
    blurb: "Generate carrier release paperwork and get it signed online.",
    comesWith: "When a release is needed, it's built in — request, sign and track status without leaving your agency.",
  },
  {
    key: "academy",
    name: "Academy",
    icon: School,
    blurb: "Build courses and lessons, onboard new agents and track their progress.",
    comesWith: "Every agency gets its own academy — your training, your brand, your agents.",
  },
];

export function AgencySuiteSection() {
  return (
    <LandingSection id="agency-suite" event="agency_suite_viewed" className="border-t border-border">
      <SectionHead
        eyebrow="Included with the Agency plan"
        title="One plan, four tools."
        copy="An Agency licence doesn't stop at the CRM. The rest of the Agent Cloud suite comes with it — already set up, nothing extra to buy."
      />

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        {SUITE.map((t, i) => (
          <FadeUp key={t.key} delay={i * 60}>
            <div className="flex h-full gap-4 rounded-[var(--radius)] border border-border bg-surface-1 p-6">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary"
                aria-hidden
              >
                <t.icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Agent Cloud <span className="font-normal text-muted-foreground">{t.name}</span>
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t.blurb}</p>
                <p className="mt-2 text-sm leading-relaxed text-foreground">
                  <span className="font-semibold text-primary">Included: </span>
                  {t.comesWith}
                </p>
              </div>
            </div>
          </FadeUp>
        ))}
      </div>

      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Button asChild size="lg" variant="outline" onClick={() => track("tools_link_clicked")}>
          <Link to="/tools">
            See all the tools <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
        <Button asChild size="lg" onClick={() => track("agency_cta_clicked", { surface: "suite" })}>
          <Link to="/start" search={{ plan: "agency" }}>Start</Link>
        </Button>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground" style={display}>
        Available with any Agency plan.
      </p>
    </LandingSection>
  );
}
