import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, UserPlus } from "lucide-react";
import { PageShell, Panel } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@/hooks/use-server-fn";
import { listOnboardingProgress } from "@/lib/agent-onboarding.functions";
import { GetReady } from "@/components/onboarding/get-ready";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingPage,
  head: () => ({ meta: [{ title: "Getting agents ready — Agent Cloud" }] }),
});

/**
 * Who is part-way through joining.
 *
 * One page instead of five, and sorted by who is furthest from selling rather
 * than alphabetically — the roster exists to surface who is stuck, and sorting
 * by name buries exactly that.
 */
function OnboardingPage() {
  const fn = useServerFn(listOnboardingProgress);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding-progress"],
    queryFn: () => fn(),
  });

  const agents = data?.agents ?? [];

  return (
    <PageShell>
      <div className="mx-auto flex max-w-[900px] flex-col gap-[var(--gap)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Getting agents ready
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Everyone part-way through joining, and the one thing each is waiting on.
            Furthest from selling first.
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : agents.length === 0 ? (
          <Panel>
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-foreground">
                Nobody is mid-onboarding.
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Everyone in the agency is either ready to sell or has not been invited yet.
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link to="/contracting/invite">
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Invite an agent
                </Link>
              </Button>
            </div>
          </Panel>
        ) : (
          <div className="flex flex-col gap-2">
            {agents.map((a) => {
              const open = openId === a.agent_id;
              return (
                <div key={a.agent_id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : a.agent_id)}
                    aria-expanded={open}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors",
                      "hover:border-primary/40",
                      open && "border-primary/40",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{a.name}</span>
                      <span className="tnum block text-xs text-muted-foreground">
                        {a.complete} of {a.total} done
                      </span>
                    </span>
                    <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{ width: `${a.pct}%` }}
                      />
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </button>

                  {open && (
                    <div className="mt-2">
                      <GetReady agentId={a.agent_id} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
