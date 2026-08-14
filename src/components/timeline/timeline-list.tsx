/**
 * The client's story, rendered once and used in both places that tell it.
 *
 * The client drawer shows the whole thing; the policy detail sheet shows one
 * policy's slice. Same component, same ordering, same wording — because two
 * renderings of one record are how a product ends up saying two things about
 * the same afternoon.
 *
 * All the deciding happens in `lib/timeline/build.ts`. Nothing here works out
 * what belongs where.
 */

import { useMemo, useState } from "react";
import {
  applyFilter,
  TIMELINE_FILTERS,
  type TimelineEntry,
  type TimelineFilter,
} from "@/lib/timeline/build";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Phone,
  StickyNote,
  UserPlus,
  Heart,
  FileText,
  CalendarDays,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

const ICONS: Record<TimelineEntry["kind"], typeof Phone> = {
  contact: Phone,
  note: StickyNote,
  referral: UserPlus,
  life_event: Heart,
  policy_posted: FileText,
  policy_effective: FileText,
  policy_status: RefreshCw,
  meeting: CalendarDays,
  retention: AlertTriangle,
};

/** Tone carries meaning: a policy at risk should not look like a phone call. */
const TONES: Partial<Record<TimelineEntry["kind"], string>> = {
  retention: "text-warning",
  policy_status: "text-primary",
  policy_posted: "text-success",
};

function when(at: string): string {
  const d = new Date(at);
  const now = Date.now();
  const diff = now - d.getTime();
  const day = 86_400_000;
  // A meeting booked for next week is a real entry and must not be described
  // as having happened.
  if (diff < 0) return `Scheduled ${d.toLocaleDateString()}`;
  if (diff < day) return "Today";
  if (diff < 2 * day) return "Yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
  return d.toLocaleDateString();
}

export function TimelineList({
  entries,
  emptyMessage = "Nothing recorded yet.",
  showFilters = true,
  limit,
}: {
  entries: TimelineEntry[];
  emptyMessage?: string;
  showFilters?: boolean;
  limit?: number;
}) {
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const shown = useMemo(() => {
    const filtered = applyFilter(entries, filter);
    return limit ? filtered.slice(0, limit) : filtered;
  }, [entries, filter, limit]);

  return (
    <div className="space-y-3">
      {showFilters && (
        <div className="flex gap-1 flex-wrap">
          {TIMELINE_FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="text-sm text-muted-foreground">{emptyMessage}</div>
      ) : (
        <ol className="relative space-y-3 border-l border-border pl-4">
          {shown.map((e) => {
            const Icon = ICONS[e.kind] ?? StickyNote;
            return (
              <li key={e.id} className="relative">
                {/* The dot sits on the rail rather than beside it, so the
                    entries read as one thread instead of a list of cards. */}
                <span
                  className={cn(
                    "absolute -left-[22px] top-1 grid h-4 w-4 place-items-center rounded-full border border-border bg-surface-2",
                    TONES[e.kind],
                  )}
                >
                  <Icon className="h-2.5 w-2.5" />
                </span>
                <div className="text-xs text-muted-foreground">
                  {when(e.at)}
                  {e.isAuto && <span className="ml-1.5 uppercase tracking-wide">· auto</span>}
                </div>
                <div className={cn("text-sm font-medium", TONES[e.kind])}>{e.title}</div>
                {e.detail && (
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {e.detail}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
