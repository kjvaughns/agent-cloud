/**
 * "Suggested from your book" — carriers with real policies and no setup.
 *
 * Deliberately a suggestion, not an action that writes: adding a carrier means
 * choosing an advance option and a level mapping, which is the carrier wizard's
 * job. This says which ones are worth doing first and how much premium is
 * waiting on each.
 */

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { listSuggestedCarriers } from "@/lib/settings/suggested-carriers.functions";
import { Panel } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function SuggestedCarriersPanel({ onAddCarrier }: { onAddCarrier?: () => void }) {
  const fetchSuggested = useServerFn(listSuggestedCarriers);
  const { data, isLoading } = useQuery({
    queryKey: ["suggested-carriers"],
    queryFn: () => fetchSuggested({}),
  });

  if (isLoading) {
    return (
      <Panel>
        <Skeleton className="h-5 w-56" />
        <Skeleton className="mt-3 h-16 w-full" />
      </Panel>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-primary" />
            Suggested from your book
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Your agents have policies on these carriers, but they are not set up here yet. Until
            they are, those deals pay from the agent's agency position instead of the carrier's own
            schedule.
          </p>
        </div>
        {onAddCarrier ? (
          <Button size="sm" variant="outline" onClick={onAddCarrier}>
            Add a carrier
          </Button>
        ) : null}
      </div>

      <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
        {data.map((c) => (
          <li key={c.carrierId} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">
                {c.policies} {c.policies === 1 ? "policy" : "policies"} · {c.agents}{" "}
                {c.agents === 1 ? "agent" : "agents"}
              </p>
            </div>
            <Badge variant="secondary" className="shrink-0">
              {money(c.annualPremium)} AP
            </Badge>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
