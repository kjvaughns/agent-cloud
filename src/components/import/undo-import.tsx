/**
 * The undo button for an import.
 *
 * Deliberately shown on a *finished* import rather than hidden in a menu. The
 * anxiety this answers — "what if it goes in wrong and I cannot get it out
 * again" — is at its peak in the minute after the import completes, and an
 * undo somebody has to go looking for does not answer it at all.
 *
 * The confirmation states numbers rather than asking "are you sure?". "This
 * removes 4,182 records and keeps 11 you have edited since" is a decision
 * somebody can make; "are you sure?" is a coin toss with extra steps.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Button } from "@/components/ui/button";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  previewImportRollback, rollbackImport, type RollbackPreview,
} from "@/lib/import-rollback.functions";

const label = (t: string) => t.replace(/_/g, " ");

export function UndoImport({ batchId }: { batchId: string }) {
  const qc = useQueryClient();
  const previewFn = useServerFn(previewImportRollback);
  const rollbackFn = useServerFn(rollbackImport);

  const [preview, setPreview] = useState<RollbackPreview | null>(null);
  const [busy, setBusy] = useState(false);

  async function openPreview() {
    setBusy(true);
    try {
      const p = await previewFn({ data: { batchId } });
      setPreview(p);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not work out what this import added.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const r: any = await rollbackFn({ data: { batchId } });
      if (r.failures?.length) {
        // Named rather than swallowed: a partial undo is something the person
        // has to know about, because the half that survived is still in their
        // book and they are about to assume it is not.
        toast.error(`Removed ${r.removed}, but ${r.failures.length} table(s) refused: ${r.failures.join("; ")}`);
      } else {
        toast.success(
          `Removed ${r.removed} record${r.removed === 1 ? "" : "s"}.` +
            (r.kept_edited ? ` Kept ${r.kept_edited} you have edited since.` : ""),
        );
      }
      await qc.invalidateQueries();
      setPreview(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not undo this import.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={openPreview} disabled={busy}>
        {busy && !preview ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Undo2 className="mr-1.5 h-3.5 w-3.5" />}
        Undo
      </Button>

      <AlertDialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {preview?.total === 0 ? "Nothing to undo" : `Remove ${preview?.total} imported record${preview?.total === 1 ? "" : "s"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {preview && preview.removable.length > 0 && (
                  <ul className="space-y-0.5">
                    {preview.removable.map((r) => (
                      <li key={r.table}>
                        {r.count} {label(r.table)}
                      </li>
                    ))}
                  </ul>
                )}

                {/* The reassurance that makes the button usable. Somebody who
                    imported on Monday and has worked in the data since needs
                    to know that work survives before they will press it. */}
                {preview && preview.keptEdited.length > 0 && (
                  <p className="text-muted-foreground">
                    {preview.keptEdited.reduce((a, r) => a + r.count, 0)} record
                    {preview.keptEdited.reduce((a, r) => a + r.count, 0) === 1 ? "" : "s"} you have
                    edited since the import will be kept.
                  </p>
                )}

                {preview && preview.keptUpdated > 0 && (
                  <p className="text-muted-foreground">
                    {preview.keptUpdated} record{preview.keptUpdated === 1 ? "" : "s"} were updated
                    rather than created by this import. Those cannot be reversed — the records
                    existed beforehand.
                  </p>
                )}

                {preview?.total === 0 && (
                  <p className="text-muted-foreground">
                    Nothing from this import is still removable.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            {(preview?.total ?? 0) > 0 && (
              <AlertDialogAction onClick={confirm} disabled={busy}>
                Remove them
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
