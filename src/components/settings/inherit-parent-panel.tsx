import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getInheritStatus, inheritParentSetup } from "@/lib/agency-seed.functions";
import { useServerFn } from "@/hooks/use-server-fn";

/**
 * One line, only when there is something to say.
 *
 * A sub agency created through an invite already arrives with the parent's
 * ladder, carriers and grids copied in, so this stays hidden for them. It
 * appears for the agencies that predate that copy — the only people who need
 * to know the option exists — and says plainly that what arrives is theirs.
 */
export function InheritParentPanel() {
  const qc = useQueryClient();
  const status = useServerFn(getInheritStatus);
  const inherit = useServerFn(inheritParentSetup);

  const { data } = useQuery({
    queryKey: ["inherit-parent-status"],
    queryFn: () => status({}),
    staleTime: 60_000,
  });

  const copy = useMutation({
    mutationFn: () => inherit({}),
    onSuccess: (res: any) => {
      const total = Object.values(res?.counts ?? {}).reduce((a: number, b: any) => a + Number(b || 0), 0);
      toast.success(
        total
          ? `Copied ${total} settings from ${data?.parentName ?? "your parent agency"}. They're yours to change.`
          : "Nothing new to copy — your setup is already in place.",
      );
      qc.invalidateQueries({ queryKey: ["inherit-parent-status"] });
      qc.invalidateQueries({ queryKey: ["agency-levels"] });
      qc.invalidateQueries({ queryKey: ["org-carriers"] });
      qc.invalidateQueries({ queryKey: ["commission-grids"] });
      qc.invalidateQueries({ queryKey: ["agency-setup"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "That copy didn't go through."),
  });

  if (!data?.hasParent || !data.missing.length) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Your {data.missing.join(", ")} can be carried over from{" "}
        <span className="font-medium text-foreground">{data.parentName}</span> as your own copy —
        edit anything afterwards without affecting them.
      </p>
      <Button
        size="sm"
        onClick={() => copy.mutate()}
        disabled={copy.isPending}
        className="shrink-0"
      >
        {copy.isPending ? "Copying…" : "Copy their setup"}
      </Button>
    </div>
  );
}
