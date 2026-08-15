/**
 * Where this agency stands, in five lines, at the top of Agency settings.
 *
 * An owner opening Settings should not have to open eight tabs to learn which
 * one is unfinished. Every incomplete line says what is missing in plain
 * language and opens the tab that fixes it — no route change, so the answer is
 * one click away rather than a page load and a hunt.
 */

import { useQuery } from "@tanstack/react-query";
import { Check, CircleDashed, ArrowRight } from "lucide-react";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getAgencySetupProgress } from "@/lib/settings/setup.functions";

export function AgencySetupProgress({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  const { data } = useQuery({
    queryKey: ["settings", "agency-setup-progress"],
    queryFn: () => getAgencySetupProgress(),
  });

  if (!data?.available) return null;
  const items = data.items;
  const done = items.filter((i) => i.done).length;
  const ready = done === items.length;

  return (
    <Panel
      title="Setup"
      action={<span className="tnum text-xs text-muted-foreground">{done} of {items.length}</span>}
    >
      <p className="text-sm text-muted-foreground">
        {ready
          ? "Your agency is set up. Agents can request carriers, write business, and be paid correctly."
          : "Finish these and your agents can request carriers and write business."}
      </p>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("h-full rounded-full transition-all", ready ? "bg-success" : "bg-primary")}
          style={{ width: `${Math.round((done / items.length) * 100)}%` }}
        />
      </div>

      <ol className="mt-4 space-y-2.5">
        {items.map((item) => (
          <li key={item.id} className="flex gap-3">
            {item.done ? (
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                <Check className="h-3 w-3" />
              </span>
            ) : (
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
                <CircleDashed className="h-3 w-3" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              {!item.done && (
                <>
                  <p className="mt-0.5 text-xs text-warning">{item.missing}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-xs"
                    onClick={() => onOpenTab(item.tab)}
                  >
                    Fix this <ArrowRight className="ml-1 h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
