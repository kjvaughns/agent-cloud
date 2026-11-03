import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, GraduationCap, FileSignature, Landmark } from "lucide-react";
import { LandingNav } from "@/components/landing/nav";
import { LandingFooter } from "@/components/landing/support";
import { display } from "@/components/landing/primitives";

const TOOLS = [
  {
    name: "Licensing",
    href: "https://getlicensed.useagentcloud.com",
    icon: GraduationCap,
    blurb: "Plain-English life and health prelicensing prep: short lessons, quick quizzes, flashcards and practice exams.",
    tag: "Get licensed",
  },
  {
    name: "Release Center",
    href: "https://release.useagentcloud.com",
    icon: FileSignature,
    blurb: "Fill out your information once, generate carrier release paperwork, and get it signed online.",
    tag: "Free for agents",
  },
  {
    name: "Bankdocs",
    href: "https://bankdocs.useagentcloud.com",
    icon: Landmark,
    blurb: "Generate voided checks and automatically complete direct deposit forms for your carriers.",
    tag: "Nothing is stored",
  },
];

const TITLE = "Free Tools for Insurance Agents — Agent Cloud";
const DESC = "Agent Cloud's tools for life insurance agents: get licensed, generate carrier release forms, and complete direct deposit paperwork.";

export const Route = createFileRoute("/tools")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://useagentcloud.com/tools" }],
  }),
  component: ToolsPage,
});

function ToolsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav ctaLabel="Book a demo" ctaHref="/demo" />
      <main className="mx-auto max-w-6xl px-5 py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Agent Cloud tools</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight md:text-5xl text-balance" style={display}>
          The paperwork around the sale, handled.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Standalone tools built by the Agent Cloud team. Use them on their own, no Agent Cloud account needed.
        </p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {TOOLS.map((t) => (
            <a
              key={t.name}
              href={t.href}
              target="_blank"
              rel="noreferrer"
              className="group flex flex-col rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-primary/50"
            >
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <t.icon className="h-5 w-5" />
                </span>
                <ArrowUpRight className="h-5 w-5 text-muted-foreground transition group-hover:text-foreground" />
              </div>
              <h2 className="mt-5 text-xl font-semibold" style={display}>
                Agent Cloud <span className="font-normal text-muted-foreground">{t.name}</span>
              </h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{t.blurb}</p>
              <div className="mt-6 flex items-center justify-between text-xs">
                <span className="rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground">{t.tag}</span>
                <span className="font-mono text-muted-foreground">{new URL(t.href).host}</span>
              </div>
            </a>
          ))}
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
