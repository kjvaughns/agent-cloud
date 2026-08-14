import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@/hooks/use-server-fn";
import { useQuery } from "@tanstack/react-query";
import { getAgentOnboarding, type OnboardingStep } from "@/lib/agent-onboarding.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageShell, Panel } from "@/components/page-shell";
import { cn } from "@/lib/utils";
import { Check, ArrowRight, BookOpen, ScrollText, GraduationCap } from "lucide-react";
import { useNavContext } from "@/hooks/use-my-access";

export const Route = createFileRoute("/_authenticated/resources/new-agent-guide")({
  head: () => ({ meta: [{ title: "New Agent Guide — Agent Cloud" }] }),
  component: Page,
});

/**
 * The same six steps, from the other side of the desk.
 *
 * Back-office staff opening Resources were handed an agent's new-hire
 * checklist — complete your producer profile, get your first carrier contract,
 * post your first deal — which described somebody else's job in the second
 * person. It also cannot be completed: `getOnboardingStatus` derives every
 * step from policies and contract requests belonging to the person asking, and
 * a coordinator has neither, so the bar sits at 0% forever.
 *
 * What a contracting coordinator actually needs on their first day is where
 * things are and what the rules are, so these are destinations and references
 * rather than steps with a progress bar over them.
 */
const STAFF_SECTIONS: {
  title: string;
  items: { title: string; desc: string; href?: string; cta?: string; external?: string }[];
}[] = [
  {
    title: "Where the work is",
    items: [
      {
        title: "Today's Work",
        desc: "The queue: what is overdue, unassigned, not in good order, or ready to submit.",
        href: "/contracting-ops/queue", cta: "Open the queue",
      },
      {
        title: "Contract Requests",
        desc: "Every request and its packet, plus writing numbers, hierarchy and change requests.",
        href: "/contracting-ops/requests", cta: "Open requests",
      },
      {
        title: "Licensing & PDB",
        desc: "Expirations, PDB review cadence and what each agent has on file. Filter by expiring, expired or missing report.",
        href: "/contracting-ops/licensing", cta: "Open licensing",
      },
    ],
  },
  {
    title: "Set the agency up",
    items: [
      {
        title: "Carrier submission methods",
        desc: "How each carrier takes paperwork — SureLC, a portal, an invitation link, email or a spreadsheet. More than one per carrier is normal: SureLC for a new contract, email for a hierarchy change.",
        href: "/settings/carriers", cta: "Open carriers",
      },
      {
        title: "Carrier requirements",
        desc: "What each carrier needs before a submission is in good order. These drive the readiness bar on every request, so a missing requirement here is a NIGO later.",
        href: "/settings/carriers", cta: "Edit a carrier",
      },
      {
        title: "Submission templates",
        desc: "The email wording and spreadsheet columns each carrier expects, so a batch is not rejected over one blank column.",
        href: "/settings/templates", cta: "Open templates",
      },
      {
        title: "Contracting settings",
        desc: "Agency defaults: how often a fresh PDB report is required, the licence expiry warning window, request priorities and due dates.",
        href: "/settings/contracting", cta: "Open settings",
      },
    ],
  },
  {
    title: "Worth knowing",
    items: [
      {
        title: "Licensing data here is manually verified",
        desc: "Agent Cloud is not connected to NIPR. Everything in Licensing comes from PDB reports your team uploads and reviews — nothing is live or automatically synced, and the page says so wherever it shows a date.",
      },
      {
        title: "Onboarding a new agent",
        desc: "Producer profile and NPN, E&O and AML certificates, banking, background disclosures, then a contracting request per carrier. What is outstanding for any one agent is on their record; what is outstanding across everybody is the Getting agents ready tab.",
        href: "/team", cta: "Getting agents ready",
      },
      {
        title: "Reading a comp grid",
        desc: "A carrier's comp levels are the ladder; a grid is what each level pays by product and issue age. A writing number is issued against a level, so changing the level is a contracting request, not an edit.",
        href: "/settings/comp-grids", cta: "Comp levels and grids",
      },
      {
        title: "NIPR and the national database",
        desc: "The producer database is the source of truth for licences and appointments. Look a producer up by NPN, download the report, then upload it here so the review and the next-review date are recorded.",
        external: "https://nipr.com",
      },
    ],
  },
];

function Page() {
  const { audience } = useNavContext();
  return audience === "staff" ? <StaffGuide /> : <AgentGuide />;
}

function StaffGuide() {
  return (
    <PageShell>
      <div className="max-w-4xl space-y-6">
        <Panel>
          <div className="font-semibold">Running contracting for this agency</div>
          <p className="mt-1 text-sm text-text-dim">
            Where each part of the job lives, and the handful of rules worth knowing before you start
            on somebody's paperwork.
          </p>
        </Panel>

        {STAFF_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {section.title}
            </h2>
            {section.items.map((item) => (
              <div
                key={item.title}
                className="flex items-start gap-4 rounded-[var(--radius)] border border-border bg-card p-pad transition-colors hover:bg-surface-2"
              >
                <div className="flex-1">
                  <div className="font-semibold">{item.title}</div>
                  <div className="mt-1 text-sm text-text-dim">{item.desc}</div>
                </div>
                {item.href && (
                  <Button asChild variant="outline" size="sm">
                    <Link to={item.href}>{item.cta} <ArrowRight className="ml-1 h-4 w-4" /></Link>
                  </Button>
                )}
                {item.external && (
                  <Button asChild variant="outline" size="sm">
                    <a href={item.external} target="_blank" rel="noreferrer">
                      Open <ArrowRight className="ml-1 h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </PageShell>
  );
}

/**
 * The guide renders the same list the dashboard does.
 *
 * It used to carry its own six steps and its own `getOnboardingStatus`, while
 * the dashboard showed ten from `getAgentOnboarding` — different counts *and*
 * different membership, so "1 of 10" here and "6 steps" there described the
 * same person with no way to reconcile them. A third copy in
 * `listOnboardingProgress` hardcoded a total of six and listed one of its
 * entries twice.
 *
 * `getAgentOnboarding` is authoritative now. It is the only one that derives
 * every step from real data rather than a stored flag, and it gained the one
 * step this page had that it lacked — posting the first policy — so nothing was
 * lost in the merge.
 */
function AgentGuide() {
  const { user } = useAuth();
  const fn = useServerFn(getAgentOnboarding);
  const { data, isLoading } = useQuery({
    queryKey: ["agent-onboarding", user?.id],
    queryFn: () => fn({ data: { agent_id: user!.id } }),
    enabled: Boolean(user?.id),
  });
  const steps = (data?.steps ?? []) as OnboardingStep[];

  return (
    <PageShell>
      <div className="space-y-6 max-w-4xl">

        <Panel>
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Your Setup Progress</div>
            <div className="text-sm text-text-dim tnum">{data?.complete ?? 0} of {data?.total ?? 0} steps complete ({data?.pct ?? 0}%)</div>
          </div>
          <Progress value={data?.pct ?? 0} />
        </Panel>

        <div className="space-y-3">
          {steps.map((step, i) => {
            const done = step.done;
            return (
              <div
                key={step.key}
                className={cn(
                  "rounded-[var(--radius)] border p-pad flex items-start gap-4 transition-colors",
                  done ? "border-success/40 bg-success/5" : "border-border bg-card hover:bg-surface-2",
                )}
              >
                <div className={cn("shrink-0 w-9 h-9 rounded-full grid place-items-center", done ? "bg-success text-white" : "bg-surface-2 text-text-dim")}>
                  {done ? <Check className="h-5 w-5" /> : <span className="text-sm font-semibold tnum">{i + 1}</span>}
                </div>
                <div className="flex-1">
                  <div className="font-semibold">Step {i + 1}: {step.title}</div>
                  <div className="text-sm text-text-dim mt-1">{step.why}</div>
                </div>
                <Button asChild variant={done ? "outline" : "default"} size="sm">
                  <Link to={step.href}>{step.cta} <ArrowRight className="h-4 w-4 ml-1" /></Link>
                </Button>
              </div>
            );
          })}
        </div>

        <div className="grid md:grid-cols-3 gap-4 pt-4">
          {[
            { icon: BookOpen, label: "Read the Agent Handbook", to: "/resources/agent-handbook" },
            { icon: ScrollText, label: "Review Sales Scripts", to: "/resources/scripts" },
            { icon: GraduationCap, label: "Start Agent Academy", to: "/resources/agent-academy" },
          ].map((r) => (
            <Link
              key={r.to}
              to={r.to}
              className="rounded-[var(--radius)] border border-border bg-card p-pad flex items-center gap-3 transition-colors hover:bg-surface-2"
            >
              <r.icon className="h-6 w-6 text-primary" />
              <div className="font-medium">{r.label}</div>
            </Link>
          ))}
        </div>
        {isLoading && <div className="text-xs text-text-dim">Loading status…</div>}
      </div>
    </PageShell>
  );
}
