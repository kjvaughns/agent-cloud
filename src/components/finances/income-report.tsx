/**
 * Who earned what, ranked.
 *
 * Deliberately its own panel with its own period control rather than folded
 * into the figures below it. The page below answers "what am I paid"; this
 * answers "what is everybody paid", and the two must never be added together —
 * a manager's override on a downline policy is already in their own numbers,
 * so summing the column would count every policy twice.
 */
import { useMemo, useState } from "react";
import { Panel } from "@/components/page-shell";
import { DateRangePicker, type RangeOption } from "@/components/ui/date-range-picker";
import { fmtCurrency } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AgentIncome } from "@/lib/finances.functions";

export const INCOME_RANGES: RangeOption[] = [
  { value: "mtd", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "qtd", label: "This Quarter" },
  { value: "ytd", label: "This Year" },
  { value: "12mo", label: "Last 12 Months" },
  { value: "all", label: "All Time" },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The window, in the `YYYY-MM-DD` the schedule's payment_date is stored as.
 *
 * Both bounds inclusive: a range whose end is the last day of a month has to
 * include that day's payments.
 */
export function incomeBounds(
  range: string,
  custom: { from: string; to: string } | null,
): { from?: string; to?: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  if (range === "__custom" && custom?.from && custom?.to) {
    return { from: custom.from, to: custom.to, label: `${custom.from} → ${custom.to}` };
  }
  switch (range) {
    case "last_month": {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return {
        from: iso(start), to: iso(end),
        label: start.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      };
    }
    case "qtd": {
      const start = new Date(y, Math.floor(m / 3) * 3, 1);
      return { from: iso(start), to: iso(now), label: "Quarter to date" };
    }
    case "ytd":
      return { from: `${y}-01-01`, to: iso(now), label: `${y} to date` };
    case "12mo": {
      const start = new Date(y, m - 11, 1);
      return { from: iso(start), to: iso(now), label: "Last 12 months" };
    }
    case "all":
      return { label: "All time" };
    case "mtd":
    default: {
      const start = new Date(y, m, 1);
      return {
        from: iso(start), to: iso(now),
        label: `${start.toLocaleDateString("en-US", { month: "long" })} to date`,
      };
    }
  }
}

export function IncomeReport({
  report,
  loading,
  range,
  onRange,
  onCustom,
  rangeLabel,
  scopeLabel,
  onSelectAgent,
  selectedAgentId,
}: {
  report: AgentIncome[] | null;
  loading: boolean;
  range: string;
  onRange: (v: string) => void;
  onCustom: (from: string, to: string) => void;
  rangeLabel: string;
  scopeLabel: string;
  onSelectAgent: (agentId: string) => void;
  selectedAgentId?: string;
}) {
  const [showAll, setShowAll] = useState(false);

  const total = useMemo(
    () => (report ?? []).reduce((s, r) => s + r.total, 0),
    [report],
  );
  const max = useMemo(
    () => Math.max(1, ...(report ?? []).map((r) => r.total)),
    [report],
  );

  const list = report ?? [];
  const shown = showAll ? list : list.slice(0, 10);

  return (
    <Panel
      title={`${scopeLabel} income report`}
      action={
        <DateRangePicker
          options={INCOME_RANGES}
          value={range}
          onChange={onRange}
          onCustom={onCustom}
        />
      }
    >
      <p className="text-xs text-muted-foreground">
        Everyone&apos;s commissions for {rangeLabel.toLowerCase()}, ranked. Separate from your own
        figures below — your overrides on their business are already counted there, so these do not
        add up to yours.
      </p>

      {loading ? (
        <div className="mt-3 col gap-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      ) : list.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No commissions dated in this period.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-[var(--gap)] sm:grid-cols-4">
            <Figure label="Paid" value={total} />
            <Figure label="Direct" value={list.reduce((s, r) => s + r.direct, 0)} />
            <Figure label="Overrides" value={list.reduce((s, r) => s + r.override, 0)} />
            <Figure label="Renewals" value={list.reduce((s, r) => s + r.renewal, 0)} />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Agent</th>
                  <th className="pb-2 text-right font-medium">Paid</th>
                  <th className="hidden pb-2 text-right font-medium sm:table-cell">Direct</th>
                  <th className="hidden pb-2 text-right font-medium sm:table-cell">Override</th>
                  <th className="hidden pb-2 text-right font-medium sm:table-cell">Renewal</th>
                  <th className="pb-2 text-right font-medium">Due / projected</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr
                    key={r.agent_id}
                    onClick={() => onSelectAgent(r.agent_id)}
                    className={cn(
                      "cursor-pointer border-t border-border-soft hover:bg-muted/40",
                      selectedAgentId === r.agent_id && "bg-muted/60",
                    )}
                  >
                    <td className="py-2 tnum text-muted-foreground">{i + 1}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{r.name}</span>
                        {r.is_self && (
                          <span className="rounded-full border border-primary/40 px-1.5 py-px text-[10px] uppercase tracking-wide text-primary">
                            You
                          </span>
                        )}
                      </div>
                      <div className="mt-1 h-1 w-full max-w-[220px] rounded-full bg-muted">
                        <div
                          className="h-1 rounded-full bg-primary"
                          style={{ width: `${Math.round((r.total / max) * 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="tnum py-2 text-right font-medium">{fmtCurrency(r.total)}</td>
                    <td className="tnum hidden py-2 text-right text-muted-foreground sm:table-cell">{fmtCurrency(r.direct)}</td>
                    <td className="tnum hidden py-2 text-right text-muted-foreground sm:table-cell">{fmtCurrency(r.override)}</td>
                    <td className="tnum hidden py-2 text-right text-muted-foreground sm:table-cell">{fmtCurrency(r.renewal)}</td>
                    <td className="tnum py-2 text-right text-muted-foreground">{fmtCurrency(r.pending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {list.length > 10 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 text-xs font-medium text-primary hover:underline"
            >
              {showAll ? "Show top 10" : `Show all ${list.length}`}
            </button>
          )}
        </>
      )}
    </Panel>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius)] border border-border-soft p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="tnum mt-1 text-lg font-semibold">{fmtCurrency(value)}</div>
    </div>
  );
}
