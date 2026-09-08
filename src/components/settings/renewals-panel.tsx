/**
 * The agency's renewal rates, for every carrier that hasn't published its own.
 *
 * A comp grid can carry a renewal column, and where it does the carrier's own
 * number is used. Almost none of them do — so before this, most policies
 * simply never renewed: no row in the grid, no renewal in the schedule, no
 * message about it. These two fields are the fallback, and the copy says so,
 * because "3%" means nothing without knowing when it applies.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { getOrgSettings, updateOrgSettings } from "@/lib/org-settings.functions";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function RenewalsPanel() {
  const qc = useQueryClient();
  const getFn = useServerFn(getOrgSettings);
  const saveFn = useServerFn(updateOrgSettings);
  const { data } = useQuery({ queryKey: ["org-settings"], queryFn: () => getFn() });

  const settings = (data as any)?.settings;
  const isOwner = Boolean((data as any)?.isOwner);

  const [personal, setPersonal] = useState("");
  const [override, setOverride] = useState("");

  // Fields fill in when the settings arrive, and not on every render after —
  // typing into a controlled input that keeps being reset from the query is
  // the classic "my keystrokes disappear" bug.
  useEffect(() => {
    if (!settings) return;
    setPersonal(String(settings.renewal_pct_default ?? 3));
    setOverride(String(settings.override_renewal_pct_default ?? 1));
  }, [settings?.renewal_pct_default, settings?.override_renewal_pct_default]);

  const save = useMutation({
    mutationFn: (p: any) => saveFn({ data: p }),
    onSuccess: () => {
      toast.success("Renewal rates saved");
      qc.invalidateQueries({ queryKey: ["org-settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save that"),
  });

  if (!settings || !isOwner) return null;

  const parse = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  };

  const onSave = () => {
    const a = parse(personal);
    const b = parse(override);
    if (a == null || b == null) {
      toast.error("Renewal rates are percentages between 0 and 100.");
      return;
    }
    save.mutate({ renewal_pct_default: a, override_renewal_pct_default: b });
  };

  return (
    <Panel title="Renewal rates" className="mt-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        From the 13th month of a policy, and on every anniversary after, personal production
        earns the first rate and <span className="text-foreground">each</span> upline earns the
        second — both as a percentage of the annual premium. Where a carrier's comp grid publishes
        its own renewal rate, the carrier's number is used instead.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="renewal-personal">Personal production renewal %</Label>
          <Input
            id="renewal-personal"
            type="number"
            min={0}
            max={100}
            step="0.25"
            value={personal}
            onChange={(e) => setPersonal(e.target.value)}
            className="mt-1.5"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            On $1,200 of annual premium, 3% pays $36 a year.
          </p>
        </div>
        <div>
          <Label htmlFor="renewal-override">Override renewal %</Label>
          <Input
            id="renewal-override"
            type="number"
            min={0}
            max={100}
            step="0.25"
            value={override}
            onChange={(e) => setOverride(e.target.value)}
            className="mt-1.5"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Paid to every upline of the writing agent, not shared between them.
          </p>
        </div>
      </div>

      <Button onClick={onSave} disabled={save.isPending} size="sm" className="mt-4">
        {save.isPending ? "Saving…" : "Save renewal rates"}
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        Changes apply to policies posted from now on. Ask for a recalculation if you want them
        applied to the book you've already imported.
      </p>
    </Panel>
  );
}
