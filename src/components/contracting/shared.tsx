import { AlertTriangle, CheckCircle2, Circle, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState as SharedEmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { REQUEST_STATUS_META, READINESS_LABELS, type RequestStatus } from "@/lib/contracting-ops/types";

/**
 * Shared contracting UI pieces.
 *
 * Status is communicated by label first and colour second — a red badge and an
 * amber badge are the same badge to a colourblind operator, and this module is
 * used all day by people who cannot afford to misread one.
 */

const TONE_CLASSES = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-primary/12 text-primary border-primary/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  success: "bg-success/15 text-success border-success/30",
  danger: "bg-destructive/15 text-destructive border-destructive/30",
} as const;

export function StatusBadge({ status }: { status: string }) {
  const meta = REQUEST_STATUS_META[status as RequestStatus];
  if (!meta) return <Badge variant="outline">{status}</Badge>;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        TONE_CLASSES[meta.tone],
      )}
    >
      {meta.label}
    </span>
  );
}

/** Whose turn it is. The single most-asked question about any request. */
export function OwnerChip({ status }: { status: string }) {
  const meta = REQUEST_STATUS_META[status as RequestStatus];
  if (!meta || meta.owner === "none") return <span className="text-xs text-muted-foreground">—</span>;
  const label = {
    agent: "Agent", manager: "Manager", owner: "Owner", staff: "Staff", carrier: "Carrier", none: "",
  }[meta.owner];
  return <span className="text-xs text-muted-foreground">{label}</span>;
}

export function ReadinessBar({
  state, pct, blockers,
}: {
  state: string;
  pct: number;
  blockers?: { label: string; reason: string; owner: string }[];
}) {
  const ready = state === "ready_to_submit" || state === "approved" || state === "submitted";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">
          {READINESS_LABELS[state as keyof typeof READINESS_LABELS] ?? state}
        </span>
        <span className="tnum text-sm font-bold text-foreground">{pct}%</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("h-full rounded-full transition-all duration-500", ready ? "bg-success" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {blockers && blockers.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {blockers.map((b) => (
            <li key={b.label} className="flex items-start gap-2 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <span className="min-w-0">
                <span className="font-medium text-foreground">{b.label}</span>
                <span className="text-muted-foreground"> — {b.reason}</span>
                <span className="ml-1 text-text-dim">({b.owner})</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DocStatusIcon({ status }: { status: string }) {
  if (status === "approved" || status === "waived") return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (status === "uploaded") return <Circle className="h-4 w-4 text-primary" />;
  if (status === "rejected" || status === "expired") return <FileWarning className="h-4 w-4 text-destructive" />;
  return <Circle className="h-4 w-4 text-text-dim" />;
}

export const DOC_STATUS_LABEL: Record<string, string> = {
  missing: "Not uploaded",
  uploaded: "Waiting on review",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  waived: "Waived",
};

/**
 * Empty states. Each one says what the surface is for and what to do next,
 * because a blank table with a spinner that already finished is indistinguishable
 * from a broken page.
 */
/**
 * The contracting module's empty state, now a thin pass-through.
 *
 * Nine surfaces reach this through `RecordTable`'s `empty` prop, so making it
 * delegate is what gives all nine ghost rows and the first-use/cleared
 * distinction without touching nine call sites.
 */
export function EmptyState({
  title, body, action, ghost, kind,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  ghost?: { cells: string[] }[];
  kind?: "first-use" | "cleared" | "error";
}) {
  return <SharedEmptyState kind={kind} title={title} body={body} action={action} ghost={ghost} />;
}

/** Days-open pill that turns urgent only when it actually is. */
export function AgePill({ days, overdue }: { days: number; overdue?: boolean }) {
  return (
    <span
      className={cn(
        "tnum inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        overdue ? TONE_CLASSES.danger : days > 14 ? TONE_CLASSES.warning : TONE_CLASSES.neutral,
      )}
    >
      {days}d{overdue ? " overdue" : ""}
    </span>
  );
}
