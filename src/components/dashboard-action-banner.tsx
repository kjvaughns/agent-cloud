import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, CheckCircle2, ChevronDown, Clock, Sparkles, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@/hooks/use-server-fn";
import { getProducerProfile } from "@/lib/account.functions";
import { getAgentOnboarding } from "@/lib/agent-onboarding.functions";
import { getMyWork, type WorkItem } from "@/lib/work.functions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const WORK_LABELS: Record<string, string> = {
  "tasks-overdue": "Overdue tasks",
  "tasks-today": "Tasks today",
  "my-contracting": "Waiting on you",
  "requests-overdue": "Overdue requests",
  "requests-nigo": "Sent back",
  "requests-ready": "Ready to submit",
  "requests-unassigned": "Unassigned",
  "hierarchy-approvals": "Approvals",
  "docs-review": "Documents",
  "retention-open": "At-risk policies",
  "licenses-expired": "Expired licences",
  "licenses-soon": "Expiring licences",
};

function WorkChip({ item }: { item: WorkItem }) {
  return (
    <Button asChild variant="outline" size="sm" className="h-9 max-w-full rounded-full bg-background px-3">
      <Link to={item.href} aria-label={item.title} title={`${item.title}. ${item.detail}`}>
        <span className={cn("size-1.5 shrink-0 rounded-full", item.urgency === "overdue" ? "bg-destructive" : item.urgency === "today" ? "bg-warning" : "bg-muted-foreground")} />
        <span className="tnum font-semibold">{item.count}</span>
        <span className="truncate">{WORK_LABELS[item.id] ?? item.title}</span>
        <ArrowRight className="size-3.5 text-muted-foreground" />
      </Link>
    </Button>
  );
}

/** A single presentation of the existing profile, onboarding, and scoped work queries. */
export function DashboardActionBanner() {
  const { user } = useAuth();
  const [setupDismissed, setSetupDismissed] = useState(false);
  const profileFn = useServerFn(getProducerProfile);
  const onboardingFn = useServerFn(getAgentOnboarding);
  const workFn = useServerFn(getMyWork);
  const profile = useQuery({
    queryKey: ["account", "producerProfile"],
    queryFn: () => profileFn(),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });
  const onboarding = useQuery({
    queryKey: ["agent-onboarding", user?.id],
    queryFn: () => {
      if (!user?.id) throw new Error("Sign in to view your setup progress");
      return onboardingFn({ data: { agent_id: user.id } });
    },
    enabled: Boolean(user?.id),
  });
  const work = useQuery({ queryKey: ["my-work"], queryFn: () => workFn(), staleTime: 60_000 });
  const profilePct = profile.data?.completion?.pct;
  const progress = onboarding.data;
  const needsSetup = !setupDismissed && ((progress && !progress.finished) || (profilePct !== undefined && profilePct < 100));
  const next = progress && !progress.finished ? progress.next : null;
  const items = work.data?.items ?? [];
  const loading = profile.isLoading || onboarding.isLoading || work.isLoading;

  if (loading && !progress && !work.data && !profile.data) {
    return <Skeleton className="mb-[var(--gap)] h-24 rounded-lg" aria-label="Loading today's actions" />;
  }

  return (
    <section aria-label="Today's actions" className="mb-[var(--gap)] rounded-lg border border-primary/25 bg-gold-glow">
      <div className={cn("grid gap-4 px-4 py-3 sm:px-5", needsSetup && "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] xl:gap-5")}>
        {needsSetup && (
          <div className="relative flex min-w-0 items-start gap-3 pr-6">
            <Sparkles className="mt-1 size-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-sm font-semibold">{progress && !progress.finished ? `Ready to sell · ${progress.complete} of ${progress.total}` : "Finish your producer profile"}</h2>
                {profilePct !== undefined && profilePct < 100 && <span className="tnum text-xs text-muted-foreground">{profilePct}% profile on file</span>}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{next ? `Next: ${next.title}` : progress && !progress.finished ? "Waiting on your agency or carrier" : "Keep your carrier details in one place"}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {(next || !progress || progress.finished) && (
                  <Button asChild variant="link" size="sm" className="h-7 px-0">
                    <Link to={next?.href ?? "/account/producer-profile"}>{next?.cta ?? "Open profile"}<ArrowRight className="size-3.5" /></Link>
                  </Button>
                )}
                {progress && !progress.finished && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 px-0 text-muted-foreground">All {progress.total} steps<ChevronDown className="size-3.5" /></Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="max-h-[65vh] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto">
                      <h3 className="mb-3 text-sm font-semibold">Your path to selling</h3>
                      <ul className="space-y-3">
                        {progress.steps.map((step) => (
                          <li key={step.key} className="flex items-start gap-2 text-xs">
                            {step.done ? <Check className="mt-0.5 size-4 shrink-0 text-success" /> : step.waiting ? <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <span className="mt-0.5 size-4 shrink-0 rounded-full border border-border" />}
                            <div className="min-w-0 flex-1">
                              <p className={cn("font-medium", step.done && "text-muted-foreground")}>{step.title}</p>
                              {!step.done && <p className="mt-0.5 leading-relaxed text-muted-foreground">{step.waiting ? "Waiting — " : ""}{step.why}</p>}
                              {!step.done && !step.waiting && <Button asChild variant="link" size="sm" className="mt-1 h-auto whitespace-normal p-0 text-xs"><Link to={step.href}>{step.cta}<ArrowRight className="size-3" /></Link></Button>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
            <Button variant="ghost" size="icon" className="absolute -right-1 -top-1 size-7 text-muted-foreground" aria-label="Dismiss setup reminder" title="Dismiss setup reminder" onClick={() => setSetupDismissed(true)}><X className="size-3.5" /></Button>
          </div>
        )}
        <div className={cn("flex min-w-0 flex-col justify-center", needsSetup && "border-t border-primary/15 pt-3 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0")}>
          <h2 className="mb-2 text-xs font-semibold text-muted-foreground">Needs you today</h2>
          {work.isLoading ? <Skeleton className="h-9 w-full max-w-80" /> : work.isError ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">Couldn't load your action items.<Button variant="link" size="sm" className="h-7 px-0" onClick={() => work.refetch()}>Try again</Button></div>
          ) : items.length === 0 ? (
            <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-success" />You're all caught up.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {items.slice(0, 3).map((item) => <WorkChip key={item.id} item={item} />)}
              {items.length > 3 && (
                <Popover>
                  <PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-9 rounded-full">+{items.length - 3} more<ChevronDown className="size-3.5" /></Button></PopoverTrigger>
                  <PopoverContent align="end" className="flex max-h-[60vh] w-80 max-w-[calc(100vw-2rem)] flex-col items-start gap-2 overflow-y-auto">
                    <h3 className="mb-1 text-sm font-semibold">More action items</h3>
                    {items.slice(3).map((item) => <WorkChip key={item.id} item={item} />)}
                  </PopoverContent>
                </Popover>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}