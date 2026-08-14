import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { listSubAgencies, updateSubAgency } from "@/lib/agency-relationships.functions";
import { useMyAccess } from "@/hooks/use-my-access";
import { cn } from "@/lib/utils";

/**
 * Settings ▸ Sub-Agencies — the terms of each parent/child relationship, in
 * plain language. The sidebar only offers this page to an org that has
 * children (MyAccess.hasSubAgencies), but the URL is reachable, so the empty
 * state explains rather than 404s.
 */
export const Route = createFileRoute("/_authenticated/settings/sub-agencies")({
  component: SubAgenciesPage,
  head: () => ({ meta: [{ title: "Sub-Agencies | Settings | Agent Cloud" }] }),
});

function TermToggle({
  label, help, checked, disabled, onChange,
}: {
  label: string; help: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className={cn("flex items-start gap-2.5", disabled && "opacity-60")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[var(--gold)]"
      />
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{help}</span>
      </span>
    </label>
  );
}

function SubAgenciesPage() {
  const qc = useQueryClient();
  const { access } = useMyAccess();
  const listFn = useServerFn(listSubAgencies);
  const updateFn = useServerFn(updateSubAgency);

  const { data, isLoading } = useQuery({
    queryKey: ["sub-agencies"], queryFn: () => listFn(),
  });

  const update = useMutation({
    mutationFn: (p: any) => updateFn({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sub-agencies"] }),
    onError: (e: any) => {
      toast.error(e?.message ?? "Could not save that");
      qc.invalidateQueries({ queryKey: ["sub-agencies"] });
    },
  });

  const canManage = Boolean(access?.canEditAgencySettings);
  const children = ((data as any)?.children ?? []) as any[];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">Sub-Agencies</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Agencies operating under yours. You decide, per agency, whether their production counts
          in your totals and whether their sales flow into your feed. They can never see your
          numbers — the rollup only flows up.
        </p>
      </div>

      {(data as any)?.pendingMigration && (
        <p className="rounded-lg border border-warning/40 bg-warning/[0.06] px-3 py-2 text-xs text-muted-foreground">
          Sub-agency terms are waiting on a workspace update. Your sub-agencies still exist;
          their toggles appear once the update is applied.
        </p>
      )}

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : children.length === 0 ? (
        <Panel>
          <p className="py-6 text-center text-sm text-muted-foreground">
            No sub-agencies yet. A sub-agency is an agency whose owner you invited to run their
            own book under yours — invite an agency owner and they appear here.
          </p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {children.map((c) => (
            <Panel key={c.id} className="p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-primary/10 text-primary">
                  {c.logo_url
                    ? <img src={c.logo_url} alt="" className="h-full w-full object-cover" />
                    : <Building2 className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-bold text-foreground">{c.name}</h3>
                    {c.status === "paused" && (
                      <span className="rounded-full border border-warning/40 px-2 py-0.5 text-[10px] text-warning">Paused</span>
                    )}
                  </div>
                  <div className="mt-3 space-y-2.5">
                    <TermToggle
                      label="Count their production in my totals"
                      help="On: their premium rolls into your Total IMO numbers. Off: they stay visible here but never touch your figures."
                      checked={Boolean(c.include_production)}
                      disabled={!canManage || update.isPending}
                      onChange={(v) => update.mutate({ id: c.id, include_production: v })}
                    />
                    <TermToggle
                      label="Let them post sales to my feed"
                      help="On: their posted deals appear in your sales feed and leaderboards. Off: their wins stay in their own chat."
                      checked={Boolean(c.allow_sales_feed)}
                      disabled={!canManage || update.isPending}
                      onChange={(v) => update.mutate({ id: c.id, allow_sales_feed: v })}
                    />
                  </div>
                </div>
                {canManage && (
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <Button
                      size="sm" variant="outline" className="h-7 text-xs"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: c.id, status: c.status === "paused" ? "active" : "paused" })}
                    >
                      {c.status === "paused" ? "Resume" : "Pause"}
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive"
                      disabled={update.isPending}
                      onClick={() => {
                        if (window.confirm(`Remove ${c.name} as a sub-agency? Their production stops counting in your totals. This doesn't delete their agency.`)) {
                          update.mutate({ id: c.id, status: "terminated" });
                        }
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
