import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, Clock, XCircle, Send, Loader2, ClipboardList } from "lucide-react";
import { CONTRACT_STATUS_LABELS, type ContractStatus } from "@/lib/contracting/status";

// The list and the labels come from the pure module, so a server function that
// cannot import a React component still validates against the same seven
// values this renders. Only the colours and icons live here.
export { CONTRACT_STATUSES, type ContractStatus } from "@/lib/contracting/status";

const MAP: Record<ContractStatus, { cls: string; Icon: typeof CheckCircle2 }> = {
  assigned:   { cls: "bg-primary/15 text-primary border-primary/30",                             Icon: ClipboardList },
  requested:  { cls: "bg-slate-500/15 text-slate-600 border-slate-500/30 dark:text-slate-300",  Icon: Clock },
  submitted:  { cls: "bg-primary/15 text-primary border-primary/30",                         Icon: Send },
  processing: { cls: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",  Icon: Loader2 },
  issue:      { cls: "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-300", Icon: AlertTriangle },
  active:     { cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300", Icon: CheckCircle2 },
  rejected:   { cls: "bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300",      Icon: XCircle },
};

export function ContractStatusBadge({ status }: { status: ContractStatus | string }) {
  const m = MAP[status as ContractStatus] ?? { cls: "bg-muted text-muted-foreground border-border", Icon: Clock };
  // An unrecognised status shows its own raw value rather than nothing, so a
  // vocabulary that has drifted is visible on the screen instead of silent.
  const label = CONTRACT_STATUS_LABELS[status as ContractStatus] ?? status;
  const Icon = m.Icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", m.cls)}>
      <Icon className="h-3 w-3" />{label}
    </span>
  );
}

export function statusDot(status: ContractStatus | null | undefined): string {
  if (!status) return "bg-muted";
  if (status === "active") return "bg-emerald-500";
  if (status === "assigned") return "bg-primary/60";
  if (status === "submitted" || status === "processing") return "bg-primary";
  if (status === "issue" || status === "rejected") return "bg-rose-500";
  return "bg-slate-400";
}
