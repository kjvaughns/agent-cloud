/**
 * The record book, on screen.
 *
 * Three rows — a producer's own writing, a leader with their downline, the
 * agency together — by three columns of day, week and month. Records that
 * nobody holds yet are drawn as empty slots rather than hidden, so the shape of
 * the book is the same for a new agency as for an old one.
 */

import { useMemo } from "react";
import { Trophy, Crown, Users, Building2 } from "lucide-react";
import { Panel } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import {
  KIND_LABELS, PERIOD_LABELS, RECORD_KINDS, RECORD_PERIODS,
  type RecordKind, type RecordPeriod,
} from "@/lib/records/records";
import type { TrophyRecord } from "@/lib/records.functions";

const KIND_ICON: Record<RecordKind, typeof Trophy> = {
  producer: Crown,
  leader: Users,
  agency: Building2,
};

const KIND_HINT: Record<RecordKind, string> = {
  producer: "One agent's own writing",
  leader: "An agent plus their whole team",
  agency: "Everyone together",
};

function initials(name: string) {
  return name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";
}

/** `2026-09-08` → `Mon, Sep 8` / `Week of Sep 8` / `September 2026`. */
function whenLabel(period: RecordPeriod, periodStart: string): string {
  const d = new Date(`${periodStart}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return periodStart;
  if (period === "month") {
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  }
  const short = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (period === "week") return `Week of ${short}`;
  const dow = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return `${dow}, ${short}`;
}

function RecordCard({ record, period }: { record: TrophyRecord | undefined; period: RecordPeriod }) {
  if (!record) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-2/40 px-3 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          {PERIOD_LABELS[period]}
        </div>
        <div className="mt-1 text-sm text-text-dim">No record yet</div>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-3 transition-colors",
        record.isYou
          ? "border-primary/50 bg-gold-glow/60"
          : "border-border bg-surface-2/60 hover:bg-surface-2",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          {PERIOD_LABELS[period]}
        </span>
        <Trophy className="h-3.5 w-3.5 text-gold-bright" />
      </div>
      <div
        className="mt-1 tnum font-bold text-gold-bright"
        style={{ fontFamily: "var(--font-display)", fontSize: "clamp(18px,2.4vw,24px)" }}
      >
        {money(record.premium)}
      </div>
      <div className="mt-1.5 flex items-center gap-2 min-w-0">
        {record.holderName ? (
          <>
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[10px] bg-primary/15 text-primary">
                {initials(record.holderName)}
              </AvatarFallback>
            </Avatar>
            <span className={cn("text-sm truncate", record.isYou && "text-gold-bright font-medium")}>
              {record.holderName}
            </span>
            {record.isYou && (
              <span className="text-[8.5px] px-1.5 py-0.5 bg-primary text-gold-foreground rounded font-extrabold tracking-[0.05em]">
                YOU
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Whole agency</span>
        )}
      </div>
      <div className="mt-1 text-[11px] text-text-dim tnum">
        {whenLabel(period, record.periodStart)}
        {record.previousPremium ? ` · beat ${money(record.previousPremium)}` : ""}
      </div>
    </div>
  );
}

export function TrophyCase({
  records,
  loading,
  title = "Trophy Case",
  subtitle,
}: {
  records: TrophyRecord[] | undefined;
  loading?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const byslot = useMemo(() => {
    const map = new Map<string, TrophyRecord>();
    for (const r of records ?? []) map.set(`${r.kind}:${r.period}`, r);
    return map;
  }, [records]);

  return (
    <Panel title={title}>
      {subtitle && <p className="-mt-1 mb-3 text-xs text-muted-foreground">{subtitle}</p>}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {RECORD_KINDS.map((kind) => {
            const Icon = KIND_ICON[kind];
            return (
              <div key={kind}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">{KIND_LABELS[kind]}</span>
                  <span className="text-xs text-muted-foreground">· {KIND_HINT[kind]}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {RECORD_PERIODS.map((period) => (
                    <RecordCard
                      key={period}
                      period={period}
                      record={byslot.get(`${kind}:${period}`)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
