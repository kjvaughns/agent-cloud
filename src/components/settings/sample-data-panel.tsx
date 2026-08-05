/**
 * Getting the sample data out again.
 *
 * The point of offering sample data at signup is that a new agency can tell
 * whether the product works before it has typed anything in. The point of this
 * panel is that they can undo it the moment they stop needing it — in one
 * action, always findable, without support.
 *
 * "Always findable" is doing real work in that sentence. A clear button hidden
 * three screens deep is how an agency ends up running on a book that is 40%
 * invented, and in insurance that is a compliance problem rather than an
 * untidy one.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  getSampleDataSummary, clearMySampleData, addSampleData,
} from "@/lib/sample-data.functions";

/** `clients` → `Clients`, `commission_schedule` → `Commission schedule`. */
function tableLabel(table: string): string {
  const s = table.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function SampleDataPanel() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"clear" | "add" | null>(null);

  const clearFn = useServerFn(clearMySampleData);
  const addFn = useServerFn(addSampleData);

  const { data, isLoading } = useQuery({
    queryKey: ["sample-data-summary"],
    queryFn: () => getSampleDataSummary(),
  });

  async function run(which: "clear" | "add") {
    setBusy(which);
    try {
      if (which === "clear") {
        const r: any = await clearFn();
        toast.success(`Removed ${r.cleared} sample record${r.cleared === 1 ? "" : "s"}.`);
      } else {
        const r: any = await addFn();
        toast.success(`Sample data added — ${r.detail}.`);
      }
      // Everything on screen may have just changed underneath the user.
      await qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  // The migration has not landed. Say that, rather than showing a button that
  // would silently do nothing.
  if (data && !data.available) {
    return (
      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium">Sample data</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This workspace is still updating. Sample data can be managed here once
            it finishes.
          </p>
        </CardContent>
      </Card>
    );
  }

  const total = data?.total ?? 0;

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 font-medium">
              <Sparkles className="h-4 w-4" />
              Sample data
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {total > 0
                ? "Made-up clients, policies and commissions so the product has something to show. Every one of them is labelled “Sample” wherever it appears."
                : "Your agency has no sample data. Adding some fills the product with a realistic book you can look around, all of it clearly labelled."}
            </p>
          </div>
          {total > 0 && <Badge variant="secondary">{total} records</Badge>}
        </div>

        {data && data.byTable.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.byTable.map((t) => (
              <Badge key={t.table} variant="outline" className="font-normal">
                {tableLabel(t.table)} · {t.count}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {total > 0 ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={busy !== null}>
                  {busy === "clear"
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Trash2 className="mr-2 h-4 w-4" />}
                  Clear sample data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear {total} sample records?</AlertDialogTitle>
                  {/* Naming what survives matters more than naming what goes.
                      The fear this dialog has to answer is "will this delete my
                      real clients", and the answer is no. */}
                  <AlertDialogDescription>
                    Only records labelled “Sample” are removed. Nothing you or your
                    agents entered is touched. This cannot be undone, but you can
                    add sample data again afterwards.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction onClick={() => run("clear")}>
                    Clear sample data
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button variant="outline" onClick={() => run("add")} disabled={busy !== null}>
              {busy === "add" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add sample data
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
