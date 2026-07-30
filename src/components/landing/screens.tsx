import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, UserPlus, IdCard, FileSignature, Users, Contact, Shield,
  LifeBuoy, Wallet, ListChecks, BarChart3, Sparkles, Settings2,
  Search, Bell, Plus, TrendingUp, AlertTriangle, Check, ChevronRight,
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

function Bar({ pct, tone = "gold" }: { pct: number; tone?: "gold" | "success" | "danger" }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <span
        className={cn(
          "block h-full rounded-full",
          tone === "gold" && "bg-primary",
          tone === "success" && "bg-success",
          tone === "danger" && "bg-destructive",
        )}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
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

function Sparkline({ points, className }: { points: number[]; className?: string }) {
  const max = Math.max(...points);
  const step = 100 / (points.length - 1);
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"} ${i * step} ${30 - (v / max) * 28}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={cn("h-8 w-full", className)} aria-hidden>
      <path d={`${d} L 100 30 L 0 30 Z`} fill="var(--gold)" opacity="0.12" />
      <path d={d} fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function Columns({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 @xl/frame:grid-cols-4 @3xl/frame:grid-cols-5">{children}</div>;
}

function KanbanCol({ title, count, children }: { title: string; count: number; children?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <span className="truncate text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</span>
        <span className="tnum text-[9px] text-text-dim">{count}</span>
      </div>
      <div className="min-h-[110px] space-y-1.5 rounded-lg border border-border-soft bg-surface-2/40 p-1.5">
        {children}
      </div>
    </div>
  );
}

function KanbanCard({ name, sub, tone }: { name: string; sub: string; tone?: "success" | "warning" | "info" }) {
  return (
    <div className="rounded-md border border-border bg-card p-1.5">
      <div className="flex items-center gap-1.5">
        <span className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-primary",
        )} />
        <span className="truncate text-[10px] font-medium text-foreground">{name}</span>
      </div>
      <div className="tnum mt-0.5 truncate text-[9px] text-muted-foreground">{sub}</div>
    </div>
  );
}

// ── The screens ─────────────────────────────────────────────────────────────

export type ScreenKey =
  | "dashboard" | "recruiting" | "agent" | "applicant" | "licensing" | "contracting"
  | "commissions" | "retention" | "staff" | "nova" | "book" | "reporting"
  | "analytics" | "mobile" | "settings";

function DashboardScreen() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 @xl/frame:grid-cols-4">
        <Tile label="Today ALP" value={money(6480)} delta="+$1,240" />
        <Tile label="Month to date" value={money(184320)} delta="+23%" />
        <Tile label="Active policies" value="312" delta="+4 today" />
        <Tile label="Team ALP" value={money(742900)} delta="+11% MoM" />
      </div>

      <div className="grid gap-3 @3xl/frame:grid-cols-[1.4fr_1fr]">
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              ALP trend
            </span>
            <Pill tone="success">+23%</Pill>
          </div>
          <Sparkline points={[12, 16, 14, 19, 22, 20, 26, 31, 28, 36, 41, 39, 46, 52, 49, 58, 63, 67]} className="mt-2 h-14" />
        </div>

        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-warning" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Needs attention
            </span>
          </div>
          <div className="mt-2 space-y-1.5">
            {[
              { t: "3 licenses expire in 30 days", tone: "warning" as const },
              { t: "2 policies pending lapse", tone: "danger" as const },
              { t: "5 contracting docs outstanding", tone: "info" as const },
            ].map((x) => (
              <div key={x.t} className="flex items-center gap-2 rounded-md border border-border-soft bg-surface-2/50 px-2 py-1.5">
                <span className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  x.tone === "warning" && "bg-warning",
                  x.tone === "danger" && "bg-destructive",
                  x.tone === "info" && "bg-primary",
                )} />
                <span className="truncate text-[10px] text-foreground">{x.t}</span>
                <ChevronRight className="ml-auto h-3 w-3 shrink-0 text-text-dim" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Leaderboard — this month
        </span>
        <div className="mt-2 space-y-2">
          {[
            { n: "Rosa Iglesias", a: 61400, p: 100 },
            { n: "Marcus Bell", a: 48200, p: 78 },
            { n: "Priya Raman", a: 39900, p: 65 },
          ].map((r, i) => (
            <div key={r.n} className="flex items-center gap-2">
              <span className="tnum w-3 text-[10px] text-text-dim">{i + 1}</span>
              <Avatar initials={r.n.split(" ").map((s) => s[0]).join("")} />
              <span className="w-24 truncate text-[10px] text-foreground @xl/frame:w-32">{r.n}</span>
              <span className="min-w-0 flex-1"><Bar pct={r.p} /></span>
              <span className="tnum w-14 text-right text-[10px] font-semibold text-gold-bright">{money(r.a)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RecruitingScreen() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="info">42 open applicants</Pill>
        <Pill tone="success">9 activated this month</Pill>
        <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-gold-foreground">
          <Plus className="h-3 w-3" /> Add applicant
        </span>
      </div>

      <Columns>
        <KanbanCol title="Applied" count={4}>
          <KanbanCard name="Jordan Pike" sub="Referral · 2d" />
          <KanbanCard name="Aisha Bello" sub="Indeed · 4d" />
        </KanbanCol>
        <KanbanCol title="Screening" count={3}>
          <KanbanCard name="Chris Vogel" sub="Call booked" tone="warning" />
        </KanbanCol>
        <KanbanCol title="Interview" count={2}>
          <KanbanCard name="Tasha Wynn" sub="Thu 2:00 PM" tone="warning" />
          <KanbanCard name="Leo Márquez" sub="Fri 10:00 AM" tone="warning" />
        </KanbanCol>
        <KanbanCol title="Pre-license" count={5}>
          <KanbanCard name="Dana Whitfield" sub="Course 60%" />
        </KanbanCol>
        <KanbanCol title="Activated" count={9}>
          <KanbanCard name="Marcus Bell" sub="Producing" tone="success" />
          <KanbanCard name="Nia Thompson" sub="Producing" tone="success" />
        </KanbanCol>
      </Columns>

      <p className="text-[10px] text-muted-foreground">
        Moving a card to Activated creates the agent — the same record, carried forward.
      </p>
    </div>
  );
}

function AgentScreen() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
        <Avatar initials="MB" className="h-10 w-10 text-xs" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-foreground" style={display}>Marcus Bell</span>
            <Pill tone="success">Active</Pill>
          </div>
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            Producer · NPN 19284471 · Joined Mar 2026 · Reports to D. Whitfield
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <Tile label="MTD ALP" value={money(48200)} delta="+18%" />
          <Tile label="Placement" value="82%" delta="+4pts" />
        </div>
      </div>

      <div className="flex gap-3 border-b border-border pb-1 text-[10px]">
        {["Overview", "Licensing", "Contracting", "Book", "Commissions", "Documents"].map((t, i) => (
          <span key={t} className={cn("pb-1", i === 0 ? "border-b-2 border-primary font-semibold text-primary" : "text-muted-foreground")}>
            {t}
          </span>
        ))}
      </div>

      <div className="grid gap-3 @xl/frame:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Licensing</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[["TX", "success"], ["OK", "success"], ["NM", "success"], ["LA", "warning"], ["AR", "muted"]].map(([s, t]) => (
              <Pill key={s} tone={t as "success" | "warning" | "muted"}>{s}</Pill>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">LA renews in 24 days · AR not appointed</p>
        </div>

        <div className="rounded-lg border border-border p-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Onboarding</span>
          <div className="mt-2 space-y-1.5">
            {[["Background check", true], ["E&O on file", true], ["Carrier training", true], ["Direct deposit", false]].map(([l, done]) => (
              <div key={String(l)} className="flex items-center gap-1.5 text-[10px]">
                <span className={cn(
                  "grid h-3.5 w-3.5 place-items-center rounded-full",
                  done ? "bg-success/20 text-success" : "border border-border text-text-dim",
                )}>
                  {done ? <Check className="h-2.5 w-2.5" /> : null}
                </span>
                <span className={done ? "text-muted-foreground" : "text-foreground"}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ApplicantScreen() {
  return (
    <div className="mx-auto max-w-xl space-y-3">
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center gap-2">
          <Avatar initials="TW" className="h-8 w-8" />
          <div className="min-w-0">
            <div className="truncate text-xs font-bold text-foreground" style={display}>Tasha Wynn</div>
            <div className="text-[10px] text-muted-foreground">tasha.w@email.com · (214) 555-0148</div>
          </div>
          <Pill tone="warning">Interview</Pill>
        </div>

        <div className="mt-3 flex items-center gap-1">
          {["Applied", "Screening", "Interview", "Pre-license", "Activated"].map((s, i) => (
            <span key={s} className="flex flex-1 items-center gap-1">
              <span className={cn(
                "h-1 flex-1 rounded-full",
                i <= 2 ? "bg-primary" : "bg-surface-2",
              )} />
            </span>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[8px] uppercase tracking-wider text-text-dim">
          <span>Applied</span><span>Screening</span><span className="text-primary">Interview</span><span>Pre-license</span><span>Activated</span>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Activity</span>
        <div className="mt-2 space-y-2">
          {[
            { w: "Interview scheduled", who: "D. Whitfield", when: "Today, 9:14 AM" },
            { w: "Screening call — strong P&C background", who: "D. Whitfield", when: "Mon, 3:02 PM" },
            { w: "Application received from careers page", who: "System", when: "Fri, 8:40 AM" },
          ].map((a) => (
            <div key={a.w} className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
              <div className="min-w-0">
                <div className="truncate text-[10px] text-foreground">{a.w}</div>
                <div className="text-[9px] text-text-dim">{a.who} · {a.when}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LicensingScreen() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 @xl/frame:grid-cols-4">
        <Tile label="Licensed agents" value="38" delta="of 42" tone="muted" />
        <Tile label="Active licenses" value="171" delta="+6 this month" />
        <Tile label="Expiring ≤ 30d" value="3" delta="Action needed" tone="warning" />
        <Tile label="Lapsed" value="1" delta="Blocking appointments" tone="warning" />
      </div>

      <Table cols={["Agent", "State", "Line", "Expires", "Status"]}>
        {[
          { a: "Marcus Bell", s: "LA", l: "Life & Health", e: "Aug 23, 2026", st: ["warning", "Expiring"] },
          { a: "Rosa Iglesias", s: "TX", l: "Life & Health", e: "Jan 14, 2027", st: ["success", "Active"] },
          { a: "Priya Raman", s: "OK", l: "Life only", e: "Nov 02, 2026", st: ["success", "Active"] },
          { a: "Tom Okafor", s: "NM", l: "Life & Health", e: "Jul 09, 2026", st: ["danger", "Lapsed"] },
          { a: "Nia Thompson", s: "AR", l: "Life & Health", e: "Mar 30, 2027", st: ["success", "Active"] },
        ].map((r) => (
          <Row key={r.a + r.s}>
            <Cell grow={2}>
              <span className="flex items-center gap-1.5">
                <Avatar initials={r.a.split(" ").map((x) => x[0]).join("")} />
                <span className="truncate text-foreground">{r.a}</span>
              </span>
            </Cell>
            <Cell className="text-muted-foreground">{r.s}</Cell>
            <Cell className="hidden text-muted-foreground @xl/frame:block">{r.l}</Cell>
            <Cell className="tnum text-muted-foreground">{r.e}</Cell>
            <Cell><Pill tone={r.st[0] as "success" | "warning" | "danger"}>{r.st[1]}</Pill></Cell>
          </Row>
        ))}
      </Table>
    </div>
  );
}

function ContractingScreen() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Pill tone="info">7 in progress</Pill>
        <Pill tone="warning">5 documents outstanding</Pill>
        <Pill tone="success">23 appointed</Pill>
      </div>

      <div className="grid gap-3 @3xl/frame:grid-cols-[1.3fr_1fr]">
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

      <div className="grid gap-3 @3xl/frame:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-border p-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Schedule — Policy MO-448120
          </span>
          <div className="mt-2 rounded-md border border-primary/30 bg-primary/[0.05] p-2.5">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Advance on effective date</div>
            <div className="tnum text-xl font-bold text-gold-bright" style={display}>{money(1215)}</div>
            <div className="tnum text-[9px] text-muted-foreground">Year one {money(1620)} · 90% of {money(1800)}</div>
          </div>
          <div className="mt-2 flex gap-1.5">
            {[9, 10, 11].map((m) => (
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
            <Pill tone="success">Matched 96%</Pill>
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
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Working" value="14" delta="4 unassigned" tone="warning" />
        <Tile label="Premium at risk" value={money(3820)} delta="Monthly" tone="muted" />
        <Tile label="Save rate" value="68%" delta="+6pts MoM" />
      </div>

      <Table cols={["Client", "Policy", "Reason", "Open", "Owner"]}>
        {[
          { c: "Angela Ruiz", p: "MO-448120", r: "Lapse pending", d: "6d", o: "MB", tone: "warning" },
          { c: "Derrick Combs", p: "TA-991044", r: "NSF", d: "12d", o: "RI", tone: "danger" },
          { c: "Nia Thompson", p: "FOR-220718", r: "Lapse pending", d: "3d", o: "PR", tone: "warning" },
          { c: "Sam Whitaker", p: "GTL-330991", r: "Card declined", d: "1d", o: "—", tone: "info" },
        ].map((r) => (
          <Row key={r.p}>
            <Cell grow={2} className="text-foreground">{r.c}</Cell>
            <Cell className="tnum text-muted-foreground">{r.p}</Cell>
            <Cell className="hidden text-muted-foreground @xl/frame:block">{r.r}</Cell>
            <Cell><Pill tone={r.tone as "warning" | "danger" | "info"}>{r.d}</Pill></Cell>
            <Cell>{r.o === "—" ? <span className="text-text-dim">Unassigned</span> : <Avatar initials={r.o} />}</Cell>
          </Row>
        ))}
      </Table>

      <p className="text-[10px] text-muted-foreground">
        Cases open from carrier feeds and payment failures — before the policy lapses, not after.
      </p>
    </div>
  );
}

function StaffScreen() {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 @xl/frame:grid-cols-3">
        {[
          { t: "Document intake", n: 12, s: "3 need review", tone: "warning" as const },
          { t: "Import requests", n: 4, s: "2 ready to post", tone: "info" as const },
          { t: "Support desk", n: 7, s: "1 overdue", tone: "danger" as const },
        ].map((q) => (
          <div key={q.t} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{q.t}</span>
              <Pill tone={q.tone}>{q.n}</Pill>
            </div>
            <div className="tnum mt-1.5 text-lg font-bold text-foreground" style={display}>{q.n}</div>
            <div className="text-[9px] text-muted-foreground">{q.s}</div>
          </div>
        ))}
      </div>

      <Table cols={["Item", "Type", "Agent", "Age", "Status"]}>
        {[
          { i: "Void check — T. Wynn", t: "Contracting doc", a: "Tasha Wynn", g: "2h", st: ["warning", "Review"] },
          { i: "Carrier statement — GTL", t: "Import", a: "—", g: "4h", st: ["info", "Queued"] },
          { i: "License renewal — LA", t: "Licensing", a: "Marcus Bell", g: "1d", st: ["warning", "Action"] },
          { i: "Password reset", t: "Support", a: "Leo Márquez", g: "3d", st: ["danger", "Overdue"] },
        ].map((r) => (
          <Row key={r.i}>
            <Cell grow={2} className="text-foreground">{r.i}</Cell>
            <Cell className="hidden text-muted-foreground @xl/frame:block">{r.t}</Cell>
            <Cell className="text-muted-foreground">{r.a}</Cell>
            <Cell className="tnum text-muted-foreground">{r.g}</Cell>
            <Cell><Pill tone={r.st[0] as "warning" | "info" | "danger"}>{r.st[1]}</Pill></Cell>
          </Row>
        ))}
      </Table>
    </div>
  );
}

function NovaScreen() {
  return (
    <div className="mx-auto max-w-2xl space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <span className="text-xs font-bold text-foreground" style={display}>Nova</span>
        <Pill tone="muted">Sees only what you can see</Pill>
      </div>

      <div className="ml-auto max-w-[80%] rounded-xl rounded-br-sm border border-border bg-surface-2 px-3 py-2 text-[11px] text-foreground">
        Which policies are most likely to lapse this week, and who owns them?
      </div>

      <div className="max-w-[92%] rounded-xl rounded-bl-sm border border-primary/30 bg-primary/[0.05] px-3 py-2.5">
        <p className="text-[11px] leading-relaxed text-foreground">
          Four policies are at risk in the next seven days, {money(3820)} of monthly premium in total.
          Two are unassigned. Derrick Combs (TA-991044) has been open 12 days after an NSF — the
          longest-running case on the board.
        </p>
        <div className="mt-2 space-y-1">
          {["MO-448120 · Angela Ruiz · lapse pending · M. Bell", "TA-991044 · Derrick Combs · NSF · R. Iglesias"].map((s) => (
            <div key={s} className="truncate rounded-md border border-border-soft bg-card px-2 py-1 text-[10px] text-muted-foreground">
              {s}
            </div>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {["Assign the two unassigned", "Draft outreach to Derrick", "Create follow-up tasks"].map((a) => (
            <span key={a} className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[9px] font-semibold text-primary">
              {a}
            </span>
          ))}
        </div>
      </div>

      <p className="text-[9px] text-text-dim">
        Sources: retention_cases (4), policies (4), profiles (3) — all within your permissions.
      </p>
    </div>
  );
}

function BookScreen() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {["All policies", "Active", "Pending", "Lapsed", "Carrier", "Product"].map((f, i) => (
          <span key={f} className={cn(
            "rounded-full border px-2 py-0.5 text-[9px] font-medium",
            i === 1 ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground",
          )}>
            {f}
          </span>
        ))}
        <span className="tnum ml-auto text-[10px] text-muted-foreground">312 policies · {money(486300)} ALP</span>
      </div>

      <Table cols={["Client", "Carrier", "Product", "Premium", "Status"]}>
        {[
          { c: "Angela Ruiz", ca: "Mutual of Omaha", p: "Whole Life", m: 148, st: ["warning", "At risk"] },
          { c: "Rosa Iglesias", ca: "Transamerica", p: "Term 20", m: 96, st: ["success", "Active"] },
          { c: "Sam Whitaker", ca: "GTL", p: "Final Expense", m: 62, st: ["success", "Active"] },
          { c: "Priya Raman", ca: "Foresters", p: "Whole Life", m: 210, st: ["success", "Active"] },
          { c: "Tom Okafor", ca: "Mutual of Omaha", p: "Term 10", m: 54, st: ["info", "Pending"] },
        ].map((r) => (
          <Row key={r.c}>
            <Cell grow={2} className="text-foreground">{r.c}</Cell>
            <Cell className="text-muted-foreground">{r.ca}</Cell>
            <Cell className="hidden text-muted-foreground @xl/frame:block">{r.p}</Cell>
            <Cell className="tnum text-foreground">{money(r.m)}/mo</Cell>
            <Cell><Pill tone={r.st[0] as "success" | "warning" | "info"}>{r.st[1]}</Pill></Cell>
          </Row>
        ))}
      </Table>
    </div>
  );
}

function ReportingScreen() {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 @xl/frame:grid-cols-3">
        {[
          { t: "Placement rate", v: "82%", d: "+4pts vs last month" },
          { t: "13-month persistency", v: "89%", d: "+2pts vs last month" },
          { t: "Avg. days to activate", v: "23", d: "−5 days vs last month" },
        ].map((k) => (
          <div key={k.t} className="rounded-lg border border-border p-3">
            <div className="text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{k.t}</div>
            <div className="tnum mt-1 text-2xl font-bold text-foreground" style={display}>{k.v}</div>
            <div className="text-[9px] text-success">{k.d}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 @3xl/frame:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Production by month
          </span>
          <div className="mt-3 flex h-24 items-end gap-1.5">
            {[42, 51, 47, 63, 58, 72, 69, 84, 91].map((h, i) => (
              <span key={i} className="flex-1 rounded-t bg-primary/70" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border p-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Production by carrier
          </span>
          <div className="mt-2.5 space-y-2">
            {[
              { c: "Mutual of Omaha", p: 88 },
              { c: "Transamerica", p: 64 },
              { c: "Foresters", p: 41 },
              { c: "GTL", p: 27 },
            ].map((x) => (
              <div key={x.c} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-[10px] text-muted-foreground">{x.c}</span>
                <Bar pct={x.p} />
                <span className="tnum w-8 text-right text-[10px] text-foreground">{x.p}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsScreen() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 @xl/frame:grid-cols-4">
        <Tile label="Team ALP" value={money(742900)} delta="+11% MoM" />
        <Tile label="Producing agents" value="27" delta="of 38 licensed" tone="muted" />
        <Tile label="Avg. per producer" value={money(27515)} delta="+6% MoM" />
        <Tile label="New agents (90d)" value="14" delta="9 producing" />
      </div>

      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Leaderboard — quarter to date
          </span>
          <span className="inline-flex items-center gap-1 text-[9px] text-success">
            <TrendingUp className="h-3 w-3" /> Team +11%
          </span>
        </div>
        <div className="mt-2.5 space-y-2">
          {[
            { n: "Rosa Iglesias", t: "Team A", a: 184200, p: 100 },
            { n: "Marcus Bell", t: "Team A", a: 148600, p: 81 },
            { n: "Priya Raman", t: "Team B", a: 121400, p: 66 },
            { n: "Nia Thompson", t: "Team B", a: 98300, p: 53 },
            { n: "Leo Márquez", t: "Team C", a: 71900, p: 39 },
          ].map((r, i) => (
            <div key={r.n} className="flex items-center gap-2">
              <span className="tnum w-3 text-[10px] text-text-dim">{i + 1}</span>
              <Avatar initials={r.n.split(" ").map((s) => s[0]).join("")} />
              <span className="w-20 truncate text-[10px] text-foreground @xl/frame:w-28">{r.n}</span>
              <span className="hidden w-14 text-[9px] text-text-dim @xl/frame:block">{r.t}</span>
              <span className="min-w-0 flex-1"><Bar pct={r.p} /></span>
              <span className="tnum w-16 text-right text-[10px] font-semibold text-gold-bright">{money(r.a)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Phone-shaped, because that is how the mobile experience is actually judged. */
function MobileScreen() {
  return (
    <div className="flex justify-center py-2">
      <div className="w-[228px] overflow-hidden rounded-[26px] border-[6px] border-surface-2 bg-card shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between bg-surface-2 px-4 py-1 text-[8px] text-muted-foreground">
          <span className="tnum">9:41</span>
          <span className="flex gap-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-text-dim" />
            <span className="h-1.5 w-1.5 rounded-full bg-text-dim" />
            <span className="h-1.5 w-3 rounded-sm bg-text-dim" />
          </span>
        </div>

        <div className="space-y-2 p-3">
          <div>
            <div className="text-[9px] text-muted-foreground">Good morning, Kenneth</div>
            <div className="text-[10px] font-semibold text-foreground" style={display}>Month to date</div>
            <div className="tnum text-xl font-bold text-gold-bright" style={display}>{money(184320)}</div>
          </div>

          <Sparkline points={[12, 18, 15, 24, 21, 30, 36, 33, 44, 52, 61]} />

          <div className="grid grid-cols-2 gap-1.5">
            <Tile label="Today" value={money(6480)} />
            <Tile label="At risk" value="4" delta="Tap to work" tone="warning" />
          </div>

          <div className="rounded-lg border border-border p-2">
            <div className="text-[8px] uppercase tracking-[0.08em] text-muted-foreground">Today's tasks</div>
            <div className="mt-1.5 space-y-1">
              {["Call Angela Ruiz", "Submit T. Wynn documents", "Review GTL statement"].map((t) => (
                <div key={t} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-border" />
                  <span className="truncate text-[9px] text-foreground">{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-around border-t border-border bg-surface-2/70 px-2 py-1.5">
          {[LayoutDashboard, Contact, Shield, Wallet].map((I, i) => (
            <I key={i} className={cn("h-3.5 w-3.5", i === 0 ? "text-primary" : "text-text-dim")} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsScreen() {
  return (
    <div className="space-y-3">
      <div className="flex gap-3 border-b border-border pb-1 text-[10px]">
        {["Organization", "Branding", "Team", "Permissions", "Billing", "Integrations"].map((t, i) => (
          <span key={t} className={cn("pb-1", i === 1 ? "border-b-2 border-primary font-semibold text-primary" : "text-muted-foreground")}>
            {t}
          </span>
        ))}
      </div>

      <div className="grid gap-3 @xl/frame:grid-cols-2">
        <div className="rounded-lg border border-border p-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Brand</span>
          <div className="mt-2 space-y-2">
            <div>
              <div className="text-[9px] text-muted-foreground">Agency name</div>
              <div className="mt-0.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-[10px] text-foreground">
                Summit Financial Group
              </div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground">Accent</div>
              <div className="mt-1 flex gap-1.5">
                {["#CBA35A", "#7C9CBF", "#8FA97C", "#B08A38"].map((c, i) => (
                  <span
                    key={c}
                    className={cn("h-5 w-5 rounded-full border-2", i === 0 ? "border-primary" : "border-transparent")}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border p-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Access</span>
          <div className="mt-2 space-y-2">
            {[
              ["Agents see only their own book", true],
              ["Managers see their downline", true],
              ["Staff see operational queues", true],
              ["Anyone can export the agency book", false],
            ].map(([l, on]) => (
              <div key={String(l)} className="flex items-center gap-2">
                <span className={cn(
                  "flex h-3.5 w-6 shrink-0 items-center rounded-full px-0.5",
                  on ? "justify-end bg-primary" : "justify-start bg-surface-2 border border-border",
                )}>
                  <span className={cn("h-2.5 w-2.5 rounded-full", on ? "bg-gold-foreground" : "bg-text-dim")} />
                </span>
                <span className="text-[10px] text-foreground">{l}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[9px] text-text-dim">Enforced in the database, not just the interface.</p>
        </div>
      </div>
    </div>
  );
}

// ── Registry ────────────────────────────────────────────────────────────────

export const SCREENS: {
  key: ScreenKey;
  label: string;
  /** Sidebar entry to light up. */
  nav?: string;
  /** The one-line claim this screen is evidence for. */
  caption: string;
  render: () => React.ReactNode;
}[] = [
  { key: "dashboard", label: "Dashboard", nav: "Dashboard", caption: "Production, risk and team standing on one screen.", render: () => <DashboardScreen /> },
  { key: "recruiting", label: "Recruiting", nav: "Recruiting", caption: "Every applicant, every stage, one board.", render: () => <RecruitingScreen /> },
  { key: "agent", label: "Agent Profile", nav: "Agents", caption: "One profile carrying licensing, contracting and production.", render: () => <AgentScreen /> },
  { key: "applicant", label: "Applicant Card", nav: "Recruiting", caption: "The record that becomes the agent — nothing re-keyed.", render: () => <ApplicantScreen /> },
  { key: "licensing", label: "Licensing", nav: "Licensing", caption: "Renewals and gaps surfaced before they block appointments.", render: () => <LicensingScreen /> },
  { key: "contracting", label: "Contracting", nav: "Contracting", caption: "Carrier requests and outstanding documents in one queue.", render: () => <ContractingScreen /> },
  { key: "commissions", label: "Commissions", nav: "Commissions", caption: "Advances, trails, chargebacks and statement imports.", render: () => <CommissionsScreen /> },
  { key: "retention", label: "Retention", nav: "Retention", caption: "At-risk policies worked before they lapse.", render: () => <RetentionScreen /> },
  { key: "staff", label: "Staff Workspace", nav: "Tasks", caption: "Operational queues with an owner and an age on every item.", render: () => <StaffScreen /> },
  { key: "nova", label: "Nova AI", caption: "An assistant bounded by the asker's permissions.", render: () => <NovaScreen /> },
  { key: "book", label: "Book of Business", nav: "Policies", caption: "The whole book, filterable, without a spreadsheet.", render: () => <BookScreen /> },
  { key: "reporting", label: "Reporting", nav: "Reports", caption: "Placement, persistency and production, measured.", render: () => <ReportingScreen /> },
  { key: "analytics", label: "Team Analytics", nav: "Reports", caption: "Who is producing, who is stalling, and by how much.", render: () => <AnalyticsScreen /> },
  { key: "mobile", label: "Mobile", caption: "The same operation, in a pocket.", render: () => <MobileScreen /> },
  { key: "settings", label: "Settings", nav: "Settings", caption: "Branding and access, enforced at the database.", render: () => <SettingsScreen /> },
];

export const SCREEN_BY_KEY = Object.fromEntries(SCREENS.map((s) => [s.key, s])) as Record<
  ScreenKey,
  (typeof SCREENS)[number]
>;

/** A single screen with its chrome, ready to drop anywhere on the page. */
export function Screen({ screen, className }: { screen: ScreenKey; className?: string }) {
  const s = SCREEN_BY_KEY[screen];
  return (
    <AppFrame title={s.label} active={s.nav} className={className}>
      {s.render()}
    </AppFrame>
  );
}
