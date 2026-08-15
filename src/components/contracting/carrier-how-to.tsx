/**
 * What adding a carrier actually involves, said once, before the wizard starts.
 *
 * The seven-step flow is the right shape but it is not self-explanatory the
 * first time: an owner who has never mapped a comp grid does not know that the
 * grid is the part that takes the time, that photographing a paper grid page by
 * page is expected, or why a carrier stays unavailable to agents until levels
 * are mapped. Explaining that here — in the owner's language, no field names —
 * is cheaper than letting them discover it halfway through and abandon a
 * half-configured carrier.
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowRight } from "lucide-react";

const STEPS: { title: string; body: string }[] = [
  {
    title: "Pick the carrier",
    body:
      "Search the shared carrier library. If yours is not listed — a local or private " +
      "carrier — add it by name and it stays private to your agency.",
  },
  {
    title: "Add the details",
    body:
      "Contact information and any instructions your contracting staff need. " +
      "Product types can be set here or picked up from the grid in the next step.",
  },
  {
    title: "Load the comp grid",
    body:
      "The slowest step, and the one worth doing carefully. Drop in the PDF, a " +
      "spreadsheet, or photos of a paper grid — several pages at once is normal, and " +
      "each batch is read and merged as it lands. Everything extracted is shown for " +
      "you to correct before it is saved.",
  },
  {
    title: "Check the levels",
    body:
      "The levels found in the grid, with their percentages. Fix anything the " +
      "extraction misread here; this is what agents are ultimately paid from.",
  },
  {
    title: "Set the advance",
    body:
      "The most the carrier allows, then your agency's default. The default can " +
      "never exceed the carrier's maximum.",
  },
  {
    title: "Choose how contracts are submitted",
    body:
      "Portal, email, or paper — whatever this carrier expects. Requests from your " +
      "agents are routed accordingly.",
  },
  {
    title: "Review and activate",
    body:
      "Anything still missing is listed plainly. Once it is clear, activating the " +
      "carrier is what makes it appear to your agents in Post a Deal, contract " +
      "requests and the pipeline.",
  },
];

export function CarrierHowTo({
  open,
  onOpenChange,
  onGoToCarriers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoToCarriers?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adding a carrier</DialogTitle>
          <DialogDescription>
            Seven steps, saved as you go. You can leave at any point and come back to
            the first thing still unfinished.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{s.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          {onGoToCarriers && (
            <Button onClick={onGoToCarriers}>
              Go to Carriers <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
