import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, UserPlus, IdCard, FileSignature, Users, Contact, Shield,
  LifeBuoy, Wallet, ListChecks, BarChart3, Settings2,
  Search, Bell, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { display } from "./primitives";

/**
 * Product screens.
 *
 * These are rendered, not photographed. Every screen below is built from the
 * same tokens and components as the application itself, which means they never
 * drift out of date the way a folder of PNGs does, they stay sharp on any
 * display, and they reflow on a phone instead of becoming an unreadable
 * postage stamp.
 *
 * They are representative of shipped screens on sample data — the same posture
 * as the interactive demos, one level lighter.
 *
 * Three of them, not fifteen. The other twelve existed to fill ProductTour's
 * tab rail; when the tour went, they became a thousand lines of mock data that
 * shipped to every visitor's browser and appeared on no page. What survives is
 * the screen each feature band points at.
 */

// ── Shared chrome ───────────────────────────────────────────────────────────

const NAV: { icon: LucideIcon; label: string }[] = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: UserPlus, label: "Recruiting" },
  { icon: Users, label: "Agents" },
  { icon: IdCard, label: "Licensing" },
  { icon: FileSignature, label: "Contracting" },
  { icon: Contact, label: "Clients" },
  { icon: Shield, label: "Policies" },
  { icon: LifeBuoy, label: "Retention" },
  { icon: Wallet, label: "Commissions" },
  { icon: ListChecks, label: "Tasks" },
  { icon: BarChart3, label: "Reports" },
  { icon: Settings2, label: "Settings" },
];

/** Window chrome, so a screen reads as the application and not as a graphic. */
export function AppFrame({
  title, active, children, className,
}: {
  title: string;
  /** Which sidebar entry is lit. Matches a NAV label. */
  active?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "@container/frame overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/40",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2">
        <span className="flex gap-1.5">
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span key={c} className="h-2.5 w-2.5 rounded-full" style={{ background: c, opacity: 0.55 }} />
          ))}
        </span>
        <span className="ml-1.5 truncate text-[11px] text-muted-foreground">{title} — Agent Cloud</span>
      </div>

      <div className="flex min-h-[300px]">
        {/* The rail is hidden on small screens: on a phone the content is the
            point, and a squeezed sidebar only steals width from it. */}
        <aside className="hidden w-[146px] shrink-0 border-r border-border bg-surface-2/60 py-2 @3xl/frame:block">
          {NAV.map((n) => {
            const on = n.label === active;
            return (
              <div
                key={n.label}
                className={cn(
                  "mx-1.5 flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px]",
                  on ? "bg-primary/12 font-semibold text-primary" : "text-muted-foreground",
                )}
              >
                <n.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{n.label}</span>
              </div>
            );
          })}
        </aside>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 border-b border-border px-3 py-2 @xl/frame:px-4">
            <span className="text-xs font-semibold text-foreground" style={display}>{title}</span>
            <span className="ml-auto hidden items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-[10px] text-text-dim @xl/frame:flex">
              <Search className="h-3 w-3" /> Search
            </span>
            <Bell className="h-3.5 w-3.5 text-text-dim" />
            <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/15 text-[9px] font-bold text-primary">
              KV
            </span>
          </div>
          <div className="p-3 @xl/frame:p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ── Small building blocks ───────────────────────────────────────────────────

function Tile({ label, value, delta, tone = "success" }: {
  label: string; value: string; delta?: string; tone?: "success" | "muted" | "warning";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/50 p-2.5">
      <div className="truncate text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="tnum mt-1 text-base font-bold leading-none text-foreground" style={display}>{value}</div>
      {delta && (
        <div className={cn(
          "mt-1 text-[9px] font-medium",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "muted" && "text-muted-foreground",
        )}>
          {delta}
        </div>
      )}
    </div>
  );
}

function Pill({ children, tone = "muted" }: {
  children: React.ReactNode;
  tone?: "success" | "warning" | "danger" | "info" | "muted";
}) {
  return (
    <span className={cn(
      "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
      tone === "success" && "bg-success/15 text-success",
      tone === "warning" && "bg-warning/15 text-warning",
      tone === "danger" && "bg-destructive/15 text-destructive",
      tone === "info" && "bg-primary/15 text-primary",
      tone === "muted" && "bg-muted text-muted-foreground",
    )}>
      {children}
    </span>
  );
}

function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span className={cn(
      "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[9px] font-bold text-primary",
      className,
    )}>
      {initials}
    </span>
  );
}

/** Column headers + rows, sized down to screenshot scale. */
function Table({ cols, children }: { cols: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="hidden bg-surface-2/70 px-3 py-1.5 @xl/frame:flex">
        {cols.map((c, i) => (
          <span
            key={c}
            className={cn(
              "truncate text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground",
              i === 0 ? "flex-[2]" : "flex-1",
            )}
          >
            {c}
          </span>
        ))}
      </div>
      <div className="divide-y divide-border-soft">{children}</div>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 px-3 py-2 text-[11px]">{children}</div>;
}

function Cell({ children, grow = 1, className }: { children: React.ReactNode; grow?: number; className?: string }) {
  return (
    <span
      className={cn("min-w-0 truncate", className)}
      style={{ flex: grow }}
    >
      {children}
    </span>
  );
}

// ── The screens ─────────────────────────────────────────────────────────────

export type ScreenKey = "contracting" | "commissions" | "retention";

function ContractingScreen() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Pill tone="info">7 in progress</Pill>
        <Pill tone="warning">5 documents outstanding</Pill>
        <Pill tone="success">23 appointed</Pill>
      </div>

      <div className="grid gap-3 @xl/frame:grid-cols-[1.3fr_1fr]">
        <Table cols={["Carrier", "Agent", "Submitted", "Status"]}>
          {[
            { c: "Mutual of Omaha", a: "Marcus Bell", d: "Jul 12", st: ["success", "Appointed"] },
            { c: "Transamerica", a: "Tasha Wynn", d: "Jul 19", st: ["warning", "Docs needed"] },
            { c: "Foresters", a: "Leo Márquez", d: "Jul 22", st: ["info", "In review"] },
            { c: "GTL", a: "Priya Raman", d: "Jul 24", st: ["info", "Submitted"] },
          ].map((r) => (
            <Row key={r.c + r.a}>
              <Cell grow={2} className="text-foreground">{r.c}</Cell>
              <Cell className="text-muted-foreground">{r.a}</Cell>
              <Cell className="tnum hidden text-muted-foreground @xl/frame:block">{r.d}</Cell>
              <Cell><Pill tone={r.st[0] as "success" | "warning" | "info"}>{r.st[1]}</Pill></Cell>
            </Row>
          ))}
        </Table>

        <div className="rounded-lg border border-border p-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Transamerica — Tasha Wynn
          </span>
          <div className="mt-2 space-y-1.5">
            {[["Signed contract", true], ["E&O certificate", true], ["Voided check", false], ["AML certificate", false]].map(([l, done]) => (
              <div key={String(l)} className="flex items-center gap-1.5 text-[10px]">
                <span className={cn(
                  "grid h-3.5 w-3.5 place-items-center rounded-full",
                  done ? "bg-success/20 text-success" : "border border-warning/50 text-warning",
                )}>
                  {done ? <Check className="h-2.5 w-2.5" /> : "!"}
                </span>
                <span className={done ? "text-muted-foreground" : "text-foreground"}>{l}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-md bg-primary px-2 py-1.5 text-center text-[10px] font-semibold text-gold-foreground">
            Request missing documents
          </div>
        </div>
      </div>
    </div>
  );
}

function CommissionsScreen() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 @xl/frame:grid-cols-4">
        <Tile label="Advanced" value={money(51840)} delta="This month" tone="muted" />
        <Tile label="Trail due" value={money(17280)} delta="Next 90 days" tone="muted" />
        <Tile label="Chargebacks" value={money(2140)} delta="4 policies" tone="warning" />
        <Tile label="Net paid" value={money(49700)} delta="+9% MoM" />
      </div>

      <div className="grid gap-3 @xl/frame:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-border p-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Schedule — Policy MO-448120
          </span>
          <div className="mt-2 rounded-md border border-primary/30 bg-primary/[0.05] p-2.5">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Advance on effective date</div>
            <div className="tnum text-xl font-bold text-gold-bright" style={display}>{money(1215)}</div>
            {/* Every figure here has to reconcile, because a prospect who
                checks the arithmetic and finds it invented stops believing the
                reconciliation claim two paragraphs up. Annual premium 1,800 at
                a 90% year-one rate is 1,620; nine of those twelve months
                advanced is 1,215; the remaining three pay 135 each. */}
            <div className="tnum text-[9px] text-muted-foreground">
              Year one {money(1620)} · 90% of {money(1800)} · 9 months advanced
            </div>
          </div>
          <div className="mt-2 flex gap-1.5">
            {[10, 11, 12].map((m) => (
              <div key={m} className="flex-1 rounded-md border border-border bg-surface-2 p-1.5 text-center">
                <div className="text-[8px] text-muted-foreground">Mo {m}</div>
                <div className="tnum text-[10px] font-semibold text-foreground">{money(135)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Statement import
            </span>
            {/* An exact count rather than a rounded percentage: 184 posted
                plus 91 of TA's 97 is 275 of 281 finished lines, and the file
                still in review is not counted as matched. */}
            <Pill tone="success">275 of 281 matched</Pill>
          </div>
          <div className="mt-2 space-y-1.5">
            {[
              { f: "MOO_July_2026.csv", r: "184 rows", st: ["success", "Posted"] },
              { f: "TA_July_2026.xlsx", r: "97 rows", st: ["warning", "6 unmatched"] },
              { f: "GTL_July_2026.csv", r: "42 rows", st: ["info", "Reviewing"] },
            ].map((x) => (
              <div key={x.f} className="flex items-center gap-2 rounded-md border border-border-soft bg-surface-2/50 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[10px] text-foreground">{x.f}</span>
                <span className="tnum hidden text-[9px] text-text-dim @xl/frame:inline">{x.r}</span>
                <Pill tone={x.st[0] as "success" | "warning" | "info"}>{x.st[1]}</Pill>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RetentionScreen() {
  return (
    <div className="space-y-3">
      {/*
        Redrawn to match what the band above now claims. The old mockup showed
        a queue of cases opened by NSFs and declined cards — a rescue after the
        fact. The scan that shipped ranks the in-force book *before* the draft
        fails, so the screen leads with the ranking and keeps the payment
        failures as the last row, which is where they belong.
      */}
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Scored at risk" value="41" delta="of 612 in force" tone="warning" />
        <Tile label="Premium at risk" value={money(3820)} delta="Monthly" tone="muted" />
        <Tile label="Save rate" value="68%" delta="+6pts MoM" />
      </div>

      <Table cols={["Client", "Policy", "Why", "Risk", "Owner"]}>
        {/* Reasons are the signals the scan actually weighs — months in force,
            premium against the death benefit, time since anyone spoke to the
            client — not invented categories. */}
        {[
          { c: "Angela Ruiz", p: "MO-448120", r: "Month 3 · no contact in 74d", s: "88", o: "MB", tone: "danger" },
          { c: "Nia Thompson", p: "FOR-220718", r: "Month 2 · premium high for face", s: "81", o: "PR", tone: "danger" },
          { c: "Derrick Combs", p: "TA-991044", r: "Month 5 · no contact in 51d", s: "64", o: "RI", tone: "warning" },
          { c: "Sam Whitaker", p: "GTL-330991", r: "Payment failed 1d ago", s: "—", o: "—", tone: "info" },
        ].map((r) => (
          <Row key={r.p}>
            <Cell grow={2} className="text-foreground">{r.c}</Cell>
            <Cell className="tnum text-muted-foreground">{r.p}</Cell>
            <Cell className="hidden text-muted-foreground @xl/frame:block">{r.r}</Cell>
            <Cell>
              {r.s === "—"
                ? <Pill tone="info">Case open</Pill>
                : <Pill tone={r.tone as "danger" | "warning"}>{r.s}</Pill>}
            </Cell>
            <Cell>{r.o === "—" ? <span className="text-text-dim">Unassigned</span> : <Avatar initials={r.o} />}</Cell>
          </Row>
        ))}
      </Table>

      <p className="text-[10px] text-muted-foreground">
        Every score breaks down into the signals behind it, so you can disagree with one.
      </p>
    </div>
  );
}

// ── Registry ────────────────────────────────────────────────────────────────

/**
 * Three entries, not fifteen.
 *
 * The registry used to carry a `caption` per screen — the one-line claim the
 * screenshot was evidence for — because ProductTour rendered a caption under
 * each tab. The bands write their own copy, so the field went with the tour
 * rather than sitting here as documentation nobody renders.
 */
const SCREENS: Record<ScreenKey, {
  label: string;
  /** Sidebar entry to light up. */
  nav?: string;
  render: () => React.ReactNode;
}> = {
  contracting: { label: "Contracting", nav: "Contracting", render: () => <ContractingScreen /> },
  commissions: { label: "Commissions", nav: "Commissions", render: () => <CommissionsScreen /> },
  retention: { label: "Retention", nav: "Retention", render: () => <RetentionScreen /> },
};

/** A single screen with its chrome, ready to drop anywhere on the page. */
export function Screen({ screen, className }: { screen: ScreenKey; className?: string }) {
  const s = SCREENS[screen];
  return (
    <AppFrame title={s.label} active={s.nav} className={className}>
      {s.render()}
    </AppFrame>
  );
}
