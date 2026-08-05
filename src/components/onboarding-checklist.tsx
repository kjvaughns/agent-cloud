/**
 * The onboarding checklist, bottom-right, on every page.
 *
 * Persistent rather than living on the dashboard, because the moment somebody
 * needs "what do I do next" is when they have wandered into a page and lost
 * the thread — not when they are looking at the dashboard. Dismissible for
 * good, because a nag that cannot be turned off is a nag.
 *
 * Collapsed by default to a single progress pill. Expanded it is a short list;
 * it never covers more than a corner, and it moves out of the way of the
 * content rather than sitting on top of it on a phone.
 */

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, ChevronUp, Sparkles, X, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getOnboardingChecklist, dismissOnboardingStep,
} from "@/lib/onboarding-checklist.functions";
import { runTour, type TourId } from "@/lib/tours";
import { supabase } from "@/integrations/supabase/client";

/**
 * How many items the list shows at once.
 *
 * The full set for an owner is eleven, which reads as a chore rather than a
 * start. Five is the documented sweet spot, and because the config is in
 * priority order, finishing one reveals the next — so nothing is hidden, it is
 * paced.
 */
const VISIBLE = 5;

export function OnboardingChecklist() {
  const qc = useQueryClient();
  const getFn = useServerFn(getOnboardingChecklist);
  const dismissFn = useServerFn(dismissOnboardingStep);
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["onboarding-checklist"],
    queryFn: () => getFn(),
    staleTime: 30_000,
  });

  // MFA is the one step the server cannot answer: factor state lives in the
  // auth session rather than in a table.
  const { data: mfaOn } = useQuery({
    queryKey: ["mfa", "has-verified"],
    queryFn: async () => {
      const { data: f } = await supabase.auth.mfa.listFactors();
      return (f?.totp ?? []).some((x: any) => x.status === "verified");
    },
    staleTime: 60_000,
  });

  const mutate = useMutation({
    mutationFn: (vars: { step?: string; dismissAll?: boolean; tourCompleted?: string }) =>
      dismissFn({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-checklist"] }),
  });

  if (!data || data.dismissed || data.total === 0) return null;

  const steps = data.steps.map((s) =>
    s.clientResolved ? { ...s, done: Boolean(mfaOn) } : s,
  );
  const complete = steps.filter((s) => s.done).length;

  // Finished. Disappearing on its own is the reward; a "well done" card that
  // has to be dismissed would make completing it feel like more work.
  if (complete === steps.length) return null;

  const pct = Math.round((complete / steps.length) * 100);
  const nextUp = steps.find((s) => !s.done);

  // The first item is kept even once done — an already-started list is the
  // whole reason it exists (see the note in onboarding-checklist.ts) — and the
  // rest of the room goes to what is actually left to do.
  const head = steps[0]?.done ? [steps[0]] : [];
  const todo = steps.filter((s, i) => !s.done && !(i === 0)).slice(0, VISIBLE - head.length);
  const visible = [...head, ...todo];
  const hidden = steps.length - complete - todo.length;

  async function startTour(id: string) {
    await runTour(id as TourId);
    mutate.mutate({ tourCompleted: id });
  }

  return (
    <div
      className={cn(
        // Sits above content but below dialogs (z-50) and toasts, so it can
        // never trap somebody inside a modal they cannot see past.
        "fixed z-40 print:hidden",
        // Full width on a phone, anchored above the bottom edge; a floating
        // card in the corner of a 375px screen either covers the content or is
        // too small to read.
        "inset-x-3 bottom-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[340px]",
      )}
    >
      <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card shadow-lg">
        <div className="flex items-center gap-2 p-3">
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <button
            onClick={() => setOpen((v) => !v)}
            className="min-w-0 flex-1 text-left"
            aria-expanded={open}
          >
            <div className="truncate text-sm font-medium">
              {open ? "Getting started" : nextUp?.label ?? "Getting started"}
            </div>
            <div className="text-xs text-muted-foreground">
              {complete} of {steps.length} done
            </div>
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label={open ? "Collapse checklist" : "Expand checklist"}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button
            onClick={() => mutate.mutate({ dismissAll: true })}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss for good"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className="h-1 bg-primary transition-[width] duration-500"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={complete}
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-label="Setup progress"
        />

        {open && (
          <ul className="max-h-[50svh] divide-y divide-border-soft overflow-y-auto border-t border-border">
            {visible.map((s) => (
              <li key={s.id} className="flex items-start gap-2.5 p-3">
                <span
                  className={cn(
                    "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                    s.done ? "border-success bg-success text-success-foreground" : "border-border",
                  )}
                  aria-hidden
                >
                  {s.done && <Check className="h-3 w-3" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={cn("text-sm", s.done && "text-muted-foreground line-through")}>
                    {s.label}
                  </div>
                  {!s.done && (
                    <>
                      <p className="mt-0.5 text-xs text-muted-foreground">{s.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                          <Link to={s.ctaRoute}>{s.ctaLabel}</Link>
                        </Button>
                        {/* Tours launch from here and nowhere else — see the
                            note in tours.ts about why nothing auto-plays. */}
                        {s.tourId && (
                          <button
                            onClick={() => startTour(s.tourId!)}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <PlayCircle className="h-3.5 w-3.5" />
                            Show me
                          </button>
                        )}
                        <button
                          onClick={() => mutate.mutate({ step: s.id })}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Skip
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </li>
            ))}
            {hidden > 0 && (
              <li className="px-3 py-2 text-xs text-muted-foreground">
                {hidden} more after these.
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
