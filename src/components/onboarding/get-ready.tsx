import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronDown, Clock } from "lucide-react";
import { Panel } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { getAgentOnboarding, type OnboardingStep } from "@/lib/agent-onboarding.functions";
import { cn } from "@/lib/utils";

/**
 * Get one agent ready to sell.
 *
 * Shows the next thing to do, and only that. The rest of the list is behind a
 * disclosure, because a six-item checklist invites you to read all six and
 * decide — which is the work this is supposed to remove.
 *
 * A step that is genuinely waiting on somebody else is never presented as the
 * next action. "Submitted, waiting on the carrier" is a status; telling
 * somebody to go do something about it would be a lie.
 */
export function GetReady({
  agentId,
  hideWhenFinished = false,
}: {
  agentId: string;
  /** For the agent's own dashboard: vanish once there is nothing left to do. */
  hideWhenFinished?: boolean;
}) {
  const fn = useServerFn(getAgentOnboarding);
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["agent-onboarding", agentId],
    queryFn: () => fn({ data: { agent_id: agentId } }),
  });

  // Nothing on someone else's dashboard should flash a skeleton for a panel
  // that is about to hide itself.
  if (isLoading) return hideWhenFinished ? null : <Skeleton className="h-40 rounded-xl" />;
  if (!data) return null;
  if (hideWhenFinished && data.finished) return null;

  const { steps, next, complete, total, pct, finished, first_name } = data;

  return (
    <Panel
      title={finished ? `${first_name} is ready to sell` : `Get ${first_name} ready to sell`}
    >
      <div className="mb-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="tnum shrink-0 text-xs text-muted-foreground">
          {complete} of {total}
        </span>
      </div>

      {finished ? (
        <p className="flex items-center gap-2 text-sm text-foreground">
          <Check className="h-4 w-4 shrink-0 text-success" />
          Licensed, appointed and cleared to write. Nothing outstanding.
        </p>
      ) : next ? (
        <div className="rounded-xl border border-primary/30 bg-primary/[0.04] px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
            Next
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">{next.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{next.why}</p>
          <Link
            to={next.href}
            className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            {next.cta}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        {open ? "Hide the full list" : `Show all ${total} steps`}
      </button>

      {open && (
        <ul className="mt-2 space-y-1">
          {steps.map((s: OnboardingStep) => (
            <li
              key={s.key}
              className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm"
            >
              <span className="mt-0.5 shrink-0">
                {s.done ? (
                  <Check className="h-4 w-4 text-success" />
                ) : s.waiting ? (
                  <Clock className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <span className="block h-4 w-4 rounded-full border border-border" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block",
                    s.done ? "text-muted-foreground line-through" : "text-foreground",
                  )}
                >
                  {s.title}
                </span>
                {/* Says who it is on. Without this, "waiting" and "ignored"
                    look identical in a list. */}
                {!s.done && s.waiting && (
                  <span className="block text-xs text-muted-foreground">Waiting — {s.why}</span>
                )}
              </span>
              {!s.done && !s.waiting && (
                <Link to={s.href} className="shrink-0 text-xs font-medium text-primary hover:underline">
                  {s.cta}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
