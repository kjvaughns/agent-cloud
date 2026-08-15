/**
 * Where this agency stands, in five lines, at the top of Agency settings.
 *
 * An owner opening Settings should not have to open eight tabs to learn which
 * one is unfinished. Every incomplete line says what is missing in plain
 * language and opens the tab that fixes it — no route change, so the answer is
 * one click away rather than a page load and a hunt.
 *
 * It collapses, and once the agency is set up it can be dismissed for good.
 * A checklist is guidance for the first week, not furniture: an owner who
 * finished months ago should not have to scroll past it to reach Settings, and
 * one who is mid-setup should still be able to fold it away while they work.
 * The choice is remembered per browser rather than per session, so it does not
 * reappear on the next visit; a dismissed checklist comes back by itself if a
 * later change makes the agency incomplete again, because that is exactly when
 * the owner needs to see it.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, CircleDashed, ArrowRight, ChevronDown, X, HelpCircle } from "lucide-react";
import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getAgencySetupProgress } from "@/lib/settings/setup.functions";
import { CarrierHowTo } from "@/components/contracting/carrier-how-to";

const COLLAPSE_KEY = "agentcloud.setup.collapsed";
const DISMISS_KEY = "agentcloud.setup.dismissed";

function readFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    if (value) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // A browser with storage blocked still gets a working page; the preference
    // just does not survive the reload.
  }
}

export function AgencySetupProgress({ onOpenTab }: { onOpenTab: (tab: string) => void }) {
  const { data } = useQuery({
    queryKey: ["settings", "agency-setup-progress"],
    queryFn: () => getAgencySetupProgress(),
  });

  // Read after mount: localStorage during render would mismatch the server HTML.
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [howTo, setHowTo] = useState(false);
  useEffect(() => {
    setCollapsed(readFlag(COLLAPSE_KEY));
    setDismissed(readFlag(DISMISS_KEY));
  }, []);

  if (!data?.available) return null;
  const items = data.items;
  const done = items.filter((i) => i.done).length;
  const ready = done === items.length;

  // Dismissal only holds while the agency is actually finished.
  if (dismissed && ready) return null;

  const pct = Math.round((done / items.length) * 100);

  return (
    <>
      <Panel
        title="Setup"
        action={
          <div className="flex items-center gap-1">
            <span className="tnum mr-1 text-xs text-muted-foreground">{done} of {items.length}</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setHowTo(true)}
            >
              <HelpCircle className="h-3.5 w-3.5" /> How to add a carrier
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Show setup steps" : "Hide setup steps"}
              onClick={() => { const next = !collapsed; setCollapsed(next); writeFlag(COLLAPSE_KEY, next); }}
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", collapsed && "-rotate-90")} />
            </Button>
            {ready && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Dismiss setup checklist"
                onClick={() => { setDismissed(true); writeFlag(DISMISS_KEY, true); }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          {ready
            ? "Your agency is set up. Agents can request carriers, write business, and be paid correctly."
            : "Finish these and your agents can request carriers and write business."}
        </p>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn("h-full rounded-full transition-all", ready ? "bg-success" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>

        {collapsed ? (
          !ready && (
            <p className="mt-3 text-xs text-warning">
              {items.find((i) => !i.done)?.missing ?? ""}
            </p>
          )
        ) : (
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
        )}
      </Panel>

      <CarrierHowTo
        open={howTo}
        onOpenChange={setHowTo}
        onGoToCarriers={() => { setHowTo(false); onOpenTab("carriers"); }}
      />
    </>
  );
}
