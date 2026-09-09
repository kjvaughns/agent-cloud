/**
 * Recompute the record book after a policy write, and say so if the writer just
 * took a record.
 *
 * One helper rather than the same four lines in the post-deal form, the book of
 * business sheet and the pipeline drawer — a new editing surface should not have
 * to remember that records exist.
 *
 * Everything here is best-effort. The policy is already saved by the time this
 * runs, and a record book that lags by one deal is a far smaller problem than a
 * sale that looks like it failed.
 */

import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { syncProductionRecords } from "@/lib/records.functions";

export async function syncRecordsAfterPolicyWrite(
  qc: QueryClient,
  opts: { silent?: boolean; agentId?: string | null } = {},
) {
  try {
    const res: any = await syncProductionRecords({ data: { silent: opts.silent ?? false } });
    qc.invalidateQueries({ queryKey: ["trophy-case"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    if (opts.silent) return;
    // Only records that were actually announced are worth a toast: the first
    // sync writes the whole book from history and beat nothing.
    const mine = ((res?.broken ?? []) as any[]).filter((r) => r.announced);
    if (!mine.length) return;
    const first = mine[0];
    toast.success(`New record — ${first.title}!`, {
      description:
        mine.length > 1
          ? `You also set ${mine.length - 1} more. Your agency has been notified.`
          : "Your agency has been notified.",
      duration: 9000,
    });
  } catch {
    // Silent: see the header.
  }
}
