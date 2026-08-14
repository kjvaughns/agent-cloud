import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { getProducerProfile } from "@/lib/account.functions";

/**
 * A nudge, not a gate.
 *
 * This used to explain why half the app was missing — Clients, Book, Finances
 * and Reports were hidden until an agency activated you. They aren't anymore.
 * Nothing in Agent Cloud waits on a producer profile; the profile is a place to
 * keep the things carriers ask for so you only ever type them once.
 *
 * So it says what is still worth filling in and how far along it is, and it can
 * be dismissed. A suggestion you cannot close is a demand.
 */
export function PendingAgentNotice() {
  const [dismissed, setDismissed] = useState(false);

  // Same key the Producer Profile page uses, so this reads from cache when the
  // agent has already been there rather than asking again.
  const { data } = useQuery({
    queryKey: ["account", "producerProfile"],
    queryFn: () => getProducerProfile(),
    enabled: !dismissed,
    staleTime: 60_000,
  });

  const pct = Number((data as any)?.completion?.pct ?? 0);

  // How complete the profile is, and nothing else. This used to also require
  // the agent to be "pending" — a membership status that no longer exists for
  // anybody new, which would have quietly retired the nudge along with the
  // gate. Whether a profile is worth finishing has nothing to do with it.
  //
  // Waits for `data` rather than trusting the 0 default, so a fully complete
  // profile never flashes "0% on file" while the query is in flight.
  if (dismissed || !data || pct >= 100) return null;

  return (
    <div className="relative rounded-[var(--radius)] border border-primary/40 bg-gold-glow p-4">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold-bright" />
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-foreground">
            Everything's open — a few details are still worth adding.
          </p>
          <p className="text-sm text-muted-foreground">
            Your producer profile is where the things carriers keep asking for live: your licence,
            your E&amp;O, your AML certificate. None of it is required to use Agent Cloud — filling
            it in just means you never dig for it again.
          </p>
          {pct > 0 && (
            <div className="flex items-center gap-2 pt-0.5">
              <span className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </span>
              <span className="tnum text-xs text-muted-foreground">{pct}% on file</span>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
            <Link
              to="/account/producer-profile"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              Producer Profile <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              to="/contracting"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              Get contracted <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              to="/resources/new-agent-guide"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              New agent guide <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
