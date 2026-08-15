import { cn } from "@/lib/utils";
import { BADGE_BASE, toneSoft } from "@/lib/tone";
import { statusLabel, statusTone } from "@/lib/policy-status";

/**
 * Policy status, as a badge.
 *
 * The labels and tones come from src/lib/policy-status.ts so this component and
 * the pipeline's own status pills cannot say different words or wear different
 * colours for the same policy — they did, before this was routed through the
 * shared map.
 */
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(BADGE_BASE, toneSoft(statusTone(status)))}>
      {statusLabel(status)}
    </span>
  );
}
