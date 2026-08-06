/**
 * The upsell, as an inline card and never as anything else.
 *
 * The rule this component exists to enforce: it renders where the user already
 * is, in the flow of the page, at the moment they feel the thing it solves. It
 * is not a modal, not an interstitial, and it never sits over work in progress.
 * If somebody later wants a modal version of this, that is a different
 * component and it should be argued for on its own.
 *
 * Dismissal is real. A dismissed card stays dismissed for the session, the
 * dismissal is counted, and a placement that gets dismissed far more than it is
 * clicked is one `shouldRetire` will eventually identify and somebody will
 * delete. That loop only works if dismissing actually does something.
 *
 * There is no "no thanks, I'll keep doing this by hand" link, and there will
 * not be one. Confirmshaming is on the prohibited list in the prompt, it is
 * what the FTC and state AGs are actively enforcing against in 2026, and it
 * reads as contempt for the person using your product.
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@/hooks/use-server-fn";
import { Button } from "@/components/ui/button";
import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { placement as findPlacement } from "@/lib/nova-features";
import { recordUpsellEvent } from "@/lib/nova-gate.functions";

export function UpsellCard({
  placementId,
  className,
}: {
  placementId: string;
  className?: string;
}) {
  const p = findPlacement(placementId);
  const [dismissed, setDismissed] = useState(false);
  const recordFn = useServerFn(recordUpsellEvent);

  // Counted once per mount. `p` is stable config and `recordFn` is stable from
  // the hook, so the impression fires when the card first appears and not
  // again on every re-render of the page around it.
  useEffect(() => {
    if (!p) return;
    recordFn({ data: { placement: p.id, event: "impression" } }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id]);

  if (!p || dismissed) return null;

  const track = (event: "dismissal" | "click") => {
    recordFn({ data: { placement: p.id, event } }).catch(() => {});
  };

  return (
    <div
      className={cn(
        "relative rounded-[var(--radius)] border border-primary/25 bg-gold-glow/40 p-3 pr-9",
        className,
      )}
    >
      <button
        onClick={() => { setDismissed(true); track("dismissal"); }}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded p-1 text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-2.5">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold-bright" />
        <div className="min-w-0 space-y-1">
          <div className="text-sm font-medium">{p.headline}</div>
          <p className="text-xs text-muted-foreground">{p.body}</p>
          <Button asChild size="sm" variant="outline" className="mt-1.5">
            <Link to="/settings/nova-pro" onClick={() => track("click")}>
              See what Nova Pro does
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * What a gated feature shows instead of its output.
 *
 * Distinct from `UpsellCard` on purpose: this one appears where the user
 * *asked* for something, so it answers them rather than pitching at them. It
 * repeats the sentence `resolveAccess` produced, because that sentence already
 * says which of the four situations they are in.
 *
 * No blurred teaser rows here. The prompt allows a teaser only where gating
 * was disclosed before the user invested effort, and by the time somebody has
 * pressed a button we are past that line.
 */
export function LockedFeature({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  const recordFn = useServerFn(recordUpsellEvent);
  return (
    <div className={cn("rounded-[var(--radius)] border border-border bg-surface-2 p-4 text-center", className)}>
      <Sparkles className="mx-auto h-5 w-5 text-gold-bright" />
      <p className="mt-2 text-sm">{message}</p>
      <Button asChild size="sm" className="mt-3">
        <Link
          to="/settings/nova-pro"
          onClick={() => recordFn({ data: { placement: "locked_feature", event: "click" } }).catch(() => {})}
        >
          See Nova Pro
        </Link>
      </Button>
    </div>
  );
}

/**
 * "1 free run left" — the honest meter.
 *
 * Persistent and visible rather than an interstitial at the moment of use.
 * Somebody about to spend their one free run should know it before they press
 * the button, not after the result is on screen.
 */
export function TrialMeter({ runsLeft }: { runsLeft: number | null }) {
  if (runsLeft === null) return null;
  return (
    <span className="text-[11px] text-muted-foreground tnum">
      {runsLeft > 0
        ? `${runsLeft} free ${runsLeft === 1 ? "run" : "runs"} left`
        : "free run used"}
    </span>
  );
}
