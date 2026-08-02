import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronDown, Clock } from "lucide-react";
import { Panel } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { getAgentOnboarding, type OnboardingStep } from "@/lib/agent-onboarding.functions";
import { sendAgentReminder } from "@/lib/team.functions";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * The button on a step, and who it is for.
 *
 * Every CTA here used to be a bare `<Link to={step.href}>` with no params —
 * and six of the nine steps hardcode `/account/producer-profile`, which is
 * self-scoped and whose `validateSearch` strips anything else. So an agency
 * owner looking at Marcus and clicking "Open the profile" opened *their own*
 * profile. The agent id was computed to build the step and then dropped.
 *
 * Three cases now, and they are genuinely different:
 *
 *   Looking at your own list — unchanged. `/account/producer-profile` is
 *   exactly right when the profile in question is yours.
 *
 *   Looking at somebody else's, and it is something the agency does — an E&O
 *   or AML certificate, an ID. Goes to the agency-facing agent page, which
 *   knows whose record it is.
 *
 *   Looking at somebody else's, and only they can do it — bank details, the
 *   background disclosure, their own legal name and date of birth. There is no
 *   honest destination here, so the button sends a reminder instead of
 *   pretending the owner can act.
 */
function StepAction({
  step, agentId, viewingSelf, prominent = false,
}: {
  step: OnboardingStep;
  agentId: string;
  viewingSelf: boolean;
  prominent?: boolean;
}) {
  const remindFn = useServerFn(sendAgentReminder);
  const remind = useMutation({
    mutationFn: () => remindFn({ data: { agentId } }),
    onSuccess: (r: any) =>
      r?.ok === false
        ? toast.message(r.reason ?? "Already reminded recently")
        : toast.success("Reminder sent"),
    onError: (e: any) => toast.error(e?.message ?? "Couldn't send the reminder"),
  });

  const cls = prominent
    ? "mt-2.5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
    : "shrink-0 text-xs font-medium text-primary hover:underline";

  if (viewingSelf) {
    return (
      <Link to={step.href} className={cls}>
        {step.cta}
        {prominent && <ArrowRight className="h-3.5 w-3.5" />}
      </Link>
    );
  }

  if (step.actor === "owner") {
    // Steps whose href is already an agency-facing page (licensing, the
    // contracting queue, the invite) keep it — those know how to scope
    // themselves. Only the self-scoped ones are redirected.
    const selfScoped = step.href.startsWith("/account/");
    if (!selfScoped) {
      return (
        <Link to={step.href} className={cls}>
          {step.cta}
          {prominent && <ArrowRight className="h-3.5 w-3.5" />}
        </Link>
      );
    }
    return (
      <Link
        to="/agency/agents/$agentId"
        params={{ agentId }}
        search={{ tab: "readiness" as const }}
        className={cls}
      >
        {step.cta}
        {prominent && <ArrowRight className="h-3.5 w-3.5" />}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => remind.mutate()}
      disabled={remind.isPending}
      className={cn(cls, "disabled:opacity-60")}
    >
      {remind.isPending ? "Sending…" : "Remind agent"}
      {prominent && <ArrowRight className="h-3.5 w-3.5" />}
    </button>
  );
}

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
  const { user } = useAuth();
  // The same component renders on the agent's own dashboard and on the agency
  // owner's Getting Ready tab. That is why the bug survived: self-scoped links
  // are correct in the first case and wrong in the second.
  const viewingSelf = !!user?.id && user.id === agentId;

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
          <StepAction step={next} agentId={agentId} viewingSelf={viewingSelf} prominent />
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
                <StepAction step={s} agentId={agentId} viewingSelf={viewingSelf} />
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
