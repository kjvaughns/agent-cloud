/**
 * "We found 6 carriers in your book. Add them to your contracts?"
 *
 * The import can tell which carriers appear in somebody's policies. It cannot
 * tell which of those they hold a *contract* with — a book bought from a
 * retiring agent, a case written under somebody else's number, a carrier they
 * left two years ago all look identical in a spreadsheet.
 *
 * The previous version wrote a `contract_requests` row with status 'assigned'
 * for every carrier it saw. That is the system asserting a legal relationship
 * on the agent's behalf, from an inference, silently. Anything the carrier
 * matcher had merely guessed at was asserted exactly as confidently as
 * anything it was sure of.
 *
 * So: checkboxes. Pre-ticked, because the common case is that they do hold
 * these contracts and making them tick six boxes to confirm what is usually
 * true is its own kind of rude — but pre-ticked and *visible* is a different
 * thing from done-without-asking, and unticking is one click.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { confirmDetectedCarriers } from "@/lib/book-import.functions";

export type DetectedCarrier = { carrier_id: string; name: string; policy_count: number };

export function ConfirmCarriers({
  carriers,
  onDone,
}: {
  carriers: DetectedCarrier[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const confirmFn = useServerFn(confirmDetectedCarriers);
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(carriers.map((c) => c.carrier_id)),
  );
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function add() {
    setBusy(true);
    try {
      const r: any = await confirmFn({ data: { carrierIds: [...checked] } });
      toast.success(
        r.added > 0
          ? `Added ${r.added} carrier${r.added === 1 ? "" : "s"} to your contracts.`
          : "Nothing to add.",
      );
      await qc.invalidateQueries();
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add those carriers.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-left">
      <div>
        <div className="text-sm font-semibold">
          We found {carriers.length} carrier{carriers.length === 1 ? "" : "s"} in your book
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Add the ones you hold a contract with. You can add the rest later from My Contracts.
        </p>
      </div>

      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {carriers.map((c) => (
          <li key={c.carrier_id}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-md p-1.5 hover:bg-background/60">
              <Checkbox
                checked={checked.has(c.carrier_id)}
                onCheckedChange={() => toggle(c.carrier_id)}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
              {/* The number is the evidence. Somebody deciding whether they
                  really write Foresters is helped far more by "31 policies"
                  than by the name on its own. */}
              <span className="shrink-0 text-xs text-muted-foreground">
                {c.policy_count} polic{c.policy_count === 1 ? "y" : "ies"}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={add} disabled={busy || checked.size === 0}>
          {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Add {checked.size} to my contracts
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={busy}>
          Not now
        </Button>
      </div>
    </div>
  );
}
