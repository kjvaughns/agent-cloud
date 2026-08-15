/**
 * What has happened to a contracting request, for the agent waiting on it.
 *
 * The question this answers is not "what is the status" — My Contracts already
 * shows that — but "is anything happening, and is it my turn". So every entry
 * leads with who it is waiting on, and the open one says so at the top.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { currentStanding, type HistoryEntry } from "@/lib/contracting/history";
import { CONTRACT_TYPE_LABELS, type ContractType } from "@/lib/contracting-ops/types";

export type RequestRow = {
  id: string;
  reference: string | null;
  status: string;
  contract_type: string;
  carrier_name: string | null;
  created_at: string;
  updated_at: string;
  history: HistoryEntry[];
};

function when(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const day = 86_400_000;
  if (diff < 0) return new Date(t).toLocaleDateString();
  if (diff < day) return "Today";
  if (diff < 2 * day) return "Yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
  return new Date(t).toLocaleDateString();
}

function Standing({ status }: { status: string }) {
  const s = currentStanding(status);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          s.open ? "bg-amber-500" : "bg-emerald-500",
        )}
      />
      <span className="font-medium">{s.label}</span>
      {s.open && (
        <span className="text-muted-foreground">· waiting on {s.waiting.toLowerCase()}</span>
      )}
    </span>
  );
}

export function RequestHistory({ rows }: { rows: RequestRow[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  if (rows.length === 0) return null;

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const isOpen = open.has(r.id);
        return (
          <div key={r.id} className="rounded-md border">
            <button
              type="button"
              onClick={() => toggle(r.id)}
              className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40"
              aria-expanded={isOpen}
            >
              {isOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {r.carrier_name ?? "Carrier"}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {CONTRACT_TYPE_LABELS[r.contract_type as ContractType] ?? r.contract_type}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Standing status={r.status} />
                  {r.reference && (
                    <span className="text-xs text-muted-foreground">{r.reference}</span>
                  )}
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{when(r.updated_at)}</span>
            </button>

            {isOpen && (
              <div className="border-t px-3 py-3">
                {r.history.length === 0 ? (
                  // A request raised before the history table existed has no
                  // rows. Saying so beats an empty box that reads as a bug.
                  <p className="text-xs text-muted-foreground">
                    No steps recorded yet. Anything that happens from here will show up on this
                    list.
                  </p>
                ) : (
                  <ol className="space-y-3">
                    {r.history.map((h) => (
                      <li key={h.id} className="flex gap-3">
                        <span
                          className={cn(
                            "mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                            h.open ? "bg-muted-foreground/50" : "bg-emerald-500",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-medium">{h.label}</span>
                            {h.fromLabel && (
                              <span className="text-xs text-muted-foreground">
                                from {h.fromLabel}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">· {when(h.at)}</span>
                          </div>
                          {h.message && <p className="mt-0.5 text-sm">{h.message}</p>}
                          {h.nextAction && (
                            <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                              <Clock className="mt-0.5 h-3 w-3 shrink-0" />
                              <span>
                                Next: {h.nextAction}
                                {h.dueDate && ` (by ${new Date(h.dueDate).toLocaleDateString()})`}
                              </span>
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
