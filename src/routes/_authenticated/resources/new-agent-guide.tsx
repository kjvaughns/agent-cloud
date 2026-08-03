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

export const Route = createFileRoute("/_authenticated/resources/new-agent-guide")({
  head: () => ({ meta: [{ title: "New Agent Guide — Agent Cloud" }] }),
  component: Page,
});

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
function Page() {
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
