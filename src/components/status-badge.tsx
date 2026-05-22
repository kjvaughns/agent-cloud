import { cn } from "@/lib/utils";

type Status =
  | "active" | "in_review" | "lapse_pending" | "lapsed"
  | "cancelled" | "withdrawn" | "not_taken" | "postponed" | "carrier_na";

const map: Record<Status, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-success/15 text-success border-success/30" },
  in_review: { label: "In Review", cls: "bg-info/15 text-info border-info/30" },
  lapse_pending: { label: "Lapse Pending", cls: "bg-warning/15 text-warning border-warning/30" },
  lapsed: { label: "Lapsed", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground border-border" },
  withdrawn: { label: "Withdrawn", cls: "bg-muted text-muted-foreground border-border" },
  not_taken: { label: "Not Taken", cls: "bg-muted text-muted-foreground border-border" },
  postponed: { label: "Postponed", cls: "bg-warning/15 text-warning border-warning/30" },
  carrier_na: { label: "Carrier N/A", cls: "bg-muted text-muted-foreground border-border" },
};

export function StatusBadge({ status }: { status: Status | string }) {
  const m = map[status as Status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", m.cls)}>
      {m.label}
    </span>
  );
}
