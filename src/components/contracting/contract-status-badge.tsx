import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, Clock, XCircle, Send, Loader2, ClipboardList } from "lucide-react";
import { CONTRACT_STATUS_LABELS, type ContractStatus } from "@/lib/contracting/status";
import { BADGE_BASE, toneDot, toneSoft, type Tone } from "@/lib/tone";

// The list and the labels come from the pure module, so a server function that
// cannot import a React component still validates against the same seven
// values this renders. Only the tone and the icon live here.
export { CONTRACT_STATUSES, type ContractStatus } from "@/lib/contracting/status";

// Seven statuses, four meanings: not started yet, in flight, needs attention,
// done. Previously each had its own palette colour — slate, amber, orange,
// emerald, rose — which read as seven unrelated things instead of one pipeline.
const MAP: Record<ContractStatus, { tone: Tone; Icon: typeof CheckCircle2 }> = {
  assigned:   { tone: "neutral", Icon: ClipboardList },
  requested:  { tone: "neutral", Icon: Clock },
  submitted:  { tone: "info",    Icon: Send },
  processing: { tone: "info",    Icon: Loader2 },
  issue:      { tone: "warning", Icon: AlertTriangle },
  active:     { tone: "success", Icon: CheckCircle2 },
  rejected:   { tone: "danger",  Icon: XCircle },
};

export function ContractStatusBadge({ status }: { status: ContractStatus | string }) {
  const m = MAP[status as ContractStatus] ?? { tone: "neutral" as Tone, Icon: Clock };
  // An unrecognised status shows its own raw value rather than nothing, so a
  // vocabulary that has drifted is visible on the screen instead of silent.
  const label = CONTRACT_STATUS_LABELS[status as ContractStatus] ?? status;
  const Icon = m.Icon;
  return (
    <span className={cn(BADGE_BASE, toneSoft(m.tone))}>
      <Icon className={cn("h-3 w-3", m.tone === "info" && status === "processing" && "animate-spin")} />
      {label}
    </span>
  );
}

export function statusDot(status: ContractStatus | null | undefined): string {
  if (!status) return toneDot("neutral");
  return toneDot(MAP[status as ContractStatus]?.tone ?? "neutral");
}
