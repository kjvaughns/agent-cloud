/**
 * Contracting setup as one list, in order, with what is wrong spelled out.
 *
 * Every step links to the screen that fixes it, and every problem line is the
 * resolver's own sentence — the same one Post a Deal shows an agent whose
 * commission would not resolve. That is deliberate: a setup screen that
 * disagreed with the deal screen would be worse than no setup screen.
 */

import { Link } from "@tanstack/react-router";
import { Check, CircleDashed, Lock, ArrowRight } from "lucide-react";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SetupStep } from "@/lib/settings/contracting-checklist";

function StepIcon({ status }: { status: SetupStep["status"] }) {
  if (status === "done") {
    return (
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
        <Check className="h-3 w-3" />
      </span>
    );
  }
  if (status === "blocked") {
    return (
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-text-dim">
        <Lock className="h-3 w-3" />
      </span>
    );
  }
  return (
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
      <CircleDashed className="h-3 w-3" />
    </span>
  );
}

export function SetupChecklist({
  steps,
  progress,
  ready,
}: {
  steps: SetupStep[];
  progress: { done: number; total: number; pct: number };
  ready: boolean;
}) {
  return (
    <Panel
      title="Contracting setup"
      action={
        <span className="tnum text-xs text-muted-foreground">
          {progress.done} of {progress.total}
        </span>
      }
    >
      <p className="text-sm text-muted-foreground">
        {ready
          ? "Everything is set up. Your agents can write business and their commission will resolve."
          : "Work down this list. Until it is finished, some deals will post without a commission."}
      </p>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("h-full rounded-full transition-all", ready ? "bg-success" : "bg-primary")}
          style={{ width: `${progress.pct}%` }}
        />
      </div>

      <ol className="mt-4 space-y-3">
        {steps.map((step, i) => (
          <li key={step.id} className="flex gap-3">
            <StepIcon status={step.status} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className={cn(
                    "text-sm font-medium",
                    step.status === "blocked" ? "text-text-dim" : "text-foreground",
                  )}
                >
                  {i + 1}. {step.title}
                </span>
                <span className="text-xs text-muted-foreground">{step.purpose}</span>
              </div>

              {step.problems.length > 0 && (
                <ul className="mt-1 space-y-1">
                  {step.problems.map((p) => (
                    <li key={p} className="text-xs text-warning">
                      {p}
                    </li>
                  ))}
                </ul>
              )}

              {/* A blocked step gets no link. Sending somebody to configure
                  advance options before they have added a carrier is sending
                  them to an empty screen. */}
              {step.status === "todo" && (
                <Button asChild size="sm" variant="outline" className="mt-2 h-7 text-xs">
                  <Link to={step.href}>
                    Open <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
