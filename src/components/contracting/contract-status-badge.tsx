import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, Clock, XCircle, Send, Loader2, ClipboardList } from "lucide-react";

export type ContractStatus = "assigned" | "requested" | "submitted" | "processing" | "issue" | "active" | "rejected";

const MAP: Record<ContractStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  assigned:   { label: "Assigned",   cls: "bg-primary/15 text-primary border-primary/30",                             Icon: ClipboardList },
  requested:  { label: "Requested",  cls: "bg-slate-500/15 text-slate-600 border-slate-500/30 dark:text-slate-300",  Icon: Clock },
  submitted:  { label: "Submitted",  cls: "bg-[#C9A227]/15 text-[#C9A227] border-[#C9A227]/30",                         Icon: Send },
  processing: { label: "Processing", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",  Icon: Loader2 },
  issue:      { label: "Issue",      cls: "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-300", Icon: AlertTriangle },
  active:     { label: "Active",     cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300", Icon: CheckCircle2 },
  rejected:   { label: "Rejected",   cls: "bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300",      Icon: XCircle },
};

export function ContractStatusBadge({ status }: { status: ContractStatus | string }) {
  const m = MAP[status as ContractStatus] ?? { label: status, cls: "bg-muted text-muted-foreground border-border", Icon: Clock };
  const Icon = m.Icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", m.cls)}>
      <Icon className="h-3 w-3" />{m.label}
    </span>
  );
}

export function statusDot(status: ContractStatus | null | undefined): string {
  if (!status) return "bg-muted";
  if (status === "active") return "bg-emerald-500";
  if (status === "assigned") return "bg-primary/60";
  if (status === "submitted" || status === "processing") return "bg-[#C9A227]";
  if (status === "issue" || status === "rejected") return "bg-rose-500";
  return "bg-slate-400";
}

export const CONTRACT_STATUSES: ContractStatus[] = ["assigned","requested","submitted","processing","issue","active","rejected"];
