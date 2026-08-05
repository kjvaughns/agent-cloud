/**
 * What a list says when it has nothing in it.
 *
 * The cheapest onboarding there is, and unlike a scripted tour it never goes
 * stale — it is rendered from the same component as the list it replaces, so
 * it cannot describe a product that no longer exists.
 *
 * ── Four things a first-use empty state has to do ───────────────────────────
 *
 * 1. **State the outcome, not the feature.** "Your carrier writing numbers
 *    live here" tells somebody why they would want one. "No writing numbers"
 *    tells them what they already knew.
 * 2. **Show what success looks like** — the ghost row. A low-opacity sample
 *    record demonstrates the shape of the data before asking anybody to type
 *    it, which is a much better answer to "what goes in this field" than a
 *    placeholder.
 * 3. **Exactly one primary action.** Two equal buttons is a decision nobody
 *    asked to make.
 * 4. **Verb first.** "Add your first agent", never "Get started".
 *
 * ── Three empty states, not one ─────────────────────────────────────────────
 *
 * The same blank list means three different things and they need different
 * words. Today every one of them says the same generic sentence:
 *
 * - `first-use` — never had anything. Teach.
 * - `cleared`   — had things, they are gone. Confirm, do not re-teach; a
 *                 tutorial after somebody deletes their last row reads as if
 *                 the product did not notice what just happened.
 * - `error`     — we could not load it. Say so plainly and offer a retry.
 *                 Never dress a failure up as an invitation.
 *
 * No apologetic language, and no jokes in first-use. Humour is for celebrating
 * something, and somebody staring at an empty screen has not done anything yet.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";

export type EmptyKind = "first-use" | "cleared" | "error";

export type GhostRow = {
  /** Cells left to right. Kept short — a ghost row is an example, not a table. */
  cells: string[];
};

export function EmptyState({
  kind = "first-use",
  title,
  body,
  action,
  secondary,
  ghost,
  onRetry,
  className,
}: {
  kind?: EmptyKind;
  title: string;
  /** Two sentences at most. Anything longer is documentation. */
  body: string;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  ghost?: GhostRow[];
  onRetry?: () => void;
  className?: string;
}) {
  const isError = kind === "error";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--radius)] border border-dashed border-border bg-surface-2/30",
        // Generous on a desktop, not on a phone: 48px of vertical padding on a
        // 375px screen pushes the CTA below the fold, and a call to action you
        // have to scroll to is not one.
        "px-4 py-8 sm:px-6 sm:py-12",
        className,
      )}
    >
      {/* The ghost rows sit behind the copy, dimmed and inert. aria-hidden
          because a screen reader announcing three fake records as if they were
          data would be actively misleading — the whole point is that they are
          not real. */}
      {ghost && ghost.length > 0 && kind === "first-use" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 select-none opacity-[0.16]"
        >
          <div className="space-y-1.5 px-4 pb-4 sm:px-6">
            {ghost.map((row, i) => (
              <div
                key={i}
                className="flex items-center gap-3 overflow-hidden rounded-md border border-border bg-card px-3 py-2 text-xs"
              >
                {row.cells.map((c, j) => (
                  <span
                    key={j}
                    className={cn("truncate", j === 0 ? "font-medium" : "text-muted-foreground")}
                  >
                    {c}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="relative mx-auto max-w-md text-center">
        {isError && (
          <AlertTriangle className="mx-auto mb-3 h-5 w-5 text-warning" aria-hidden />
        )}
        {/* A heading rather than a styled paragraph: this is the only content
            on screen, so it is the section's heading in any honest reading of
            the document outline. */}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mx-auto mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>

        {(action || secondary || (isError && onRetry)) && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {isError && onRetry ? (
              <Button size="sm" variant="outline" onClick={onRetry}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Try again
              </Button>
            ) : (
              action
            )}
            {secondary}
          </div>
        )}
      </div>
    </div>
  );
}
