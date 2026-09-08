import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  KanbanSquare,
  BookOpen,
  FilePlus,
  LifeBuoy,
  FileSignature,
  Wallet,
  Landmark,
  Trophy,
  Users,
  Sparkles,
  Settings2,
  Search,
  Bell,
  Check,
  DollarSign,
  ArrowUp,
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

/**
 * The rail, in the real application's order and with its real icons — see
 * `src/lib/navigation.ts`. Still twelve entries, deliberately: Pipeline, Post a
 * Deal, Book of Business, Finances, Leaderboard and Nova came in, and
 * Recruiting, Licensing, Clients, Policies, Tasks and Reports went out.
 *
 * The count is load-bearing, which is not obvious. This column is the taller of
 * the two siblings on every screen except Retention, so the rail — not the
 * content — sets the frame's height, and a thirteenth entry silently grows
 * every screenshot on the marketing page by ~32px at once. Measured, not
 * guessed: `npm run measure` reports `frameH` per screen, and thirteen entries
 * took all four existing screens from 390/404 to a uniform 422.
 *
 * So: swap entries in and out, don't append. If a thirteenth is genuinely
 * needed, re-measure and update `FRAME_H` in `video/src/lib/anchors.ts` with it.
 */
const NAV: { icon: LucideIcon; label: string }[] = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: KanbanSquare, label: "Pipeline" },
  { icon: BookOpen, label: "Book of Business" },
  { icon: FilePlus, label: "Post a Deal" },
  { icon: LifeBuoy, label: "Retention" },
  { icon: FileSignature, label: "Contracting" },
  { icon: Wallet, label: "Commissions" },
  { icon: Landmark, label: "Finances" },
  { icon: Trophy, label: "Leaderboard" },
  { icon: Users, label: "Agents" },
  { icon: Sparkles, label: "Nova" },
  { icon: Settings2, label: "Settings" },
];

/** Window chrome, so a screen reads as the application and not as a graphic. */
export function AppFrame({
  title,
  active,
  children,
  className,
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
            <span
              key={c}
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: c, opacity: 0.55 }}
            />
          ))}
        </span>
        <span className="ml-1.5 truncate text-[11px] text-muted-foreground">
          {title} — Agent Cloud
        </span>
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
            <span className="text-xs font-semibold text-foreground" style={display}>
              {title}
            </span>
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

function Tile({
  label,
  value,
  delta,
  tone = "success",
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: "success" | "muted" | "warning";
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/50 p-2.5">
      <div className="truncate text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="tnum mt-1 text-base font-bold leading-none text-foreground" style={display}>
        {value}
      </div>
      {delta && (
        <div
          className={cn(
            "mt-1 text-[9px] font-medium",
            tone === "success" && "text-success",
            tone === "warning" && "text-warning",
            tone === "muted" && "text-muted-foreground",
          )}
        >
          {delta}
        </div>
      )}
    </div>
  );
}

function Pill({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "success" | "warning" | "danger" | "info" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
        tone === "success" && "bg-success/15 text-success",
        tone === "warning" && "bg-warning/15 text-warning",
        tone === "danger" && "bg-destructive/15 text-destructive",
        tone === "info" && "bg-primary/15 text-primary",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[9px] font-bold text-primary",
        className,
      )}
    >
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

function Cell({
  children,
  grow = 1,
  className,
}: {
  children: React.ReactNode;
  grow?: number;
  className?: string;
}) {
  return (
    <span className={cn("min-w-0 truncate", className)} style={{ flex: grow }}>
      {children}
    </span>
  );
}

// ── The screens ─────────────────────────────────────────────────────────────

export type ScreenKey =
  | "contracting"
  | "commissions"
  | "retention"
  | "grid"
  | "pipeline"
  | "postDeal"
  | "book"
  | "leaderboard"
  | "finances"
  | "nova";

/**
 * How much of the agency a screen is looking at.
 *
 * The application's own control (`src/lib/scope.ts`) offers Mine / Team /
 * Agency / Total IMO and only renders at all once you have a downline. Two of
 * the four are enough to show what the toggle *does*, which is the only claim
 * a screenshot is making.
 */
export type ScreenScope = "mine" | "agency";

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
              <Cell grow={2} className="text-foreground">
                {r.c}
              </Cell>
              <Cell className="text-muted-foreground">{r.a}</Cell>
              <Cell className="tnum hidden text-muted-foreground @xl/frame:block">{r.d}</Cell>
              <Cell>
                <Pill tone={r.st[0] as "success" | "warning" | "info"}>{r.st[1]}</Pill>
              </Cell>
            </Row>
          ))}
        </Table>

        <div className="rounded-lg border border-border p-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Transamerica — Tasha Wynn
          </span>
          <div className="mt-2 space-y-1.5">
            {[
              ["Signed contract", true],
              ["E&O certificate", true],
              ["Voided check", false],
              ["AML certificate", false],
            ].map(([l, done]) => (
              <div key={String(l)} className="flex items-center gap-1.5 text-[10px]">
                <span
                  className={cn(
                    "grid h-3.5 w-3.5 place-items-center rounded-full",
                    done ? "bg-success/20 text-success" : "border border-warning/50 text-warning",
                  )}
                >
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
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
              Advance on effective date
            </div>
            <div className="tnum text-xl font-bold text-gold-bright" style={display}>
              {money(1215)}
            </div>
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
              <div
                key={m}
                className="flex-1 rounded-md border border-border bg-surface-2 p-1.5 text-center"
              >
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
              <div
                key={x.f}
                className="flex items-center gap-2 rounded-md border border-border-soft bg-surface-2/50 px-2 py-1.5"
              >
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
          {
            c: "Angela Ruiz",
            p: "MO-448120",
            r: "Month 3 · no contact in 74d",
            s: "88",
            o: "MB",
            tone: "danger",
          },
          {
            c: "Nia Thompson",
            p: "FOR-220718",
            r: "Month 2 · premium high for face",
            s: "81",
            o: "PR",
            tone: "danger",
          },
          {
            c: "Derrick Combs",
            p: "TA-991044",
            r: "Month 5 · no contact in 51d",
            s: "64",
            o: "RI",
            tone: "warning",
          },
          {
            c: "Sam Whitaker",
            p: "GTL-330991",
            r: "Payment failed 1d ago",
            s: "—",
            o: "—",
            tone: "info",
          },
        ].map((r) => (
          <Row key={r.p}>
            <Cell grow={2} className="text-foreground">
              {r.c}
            </Cell>
            <Cell className="tnum text-muted-foreground">{r.p}</Cell>
            <Cell className="hidden text-muted-foreground @xl/frame:block">{r.r}</Cell>
            <Cell>
              {r.s === "—" ? (
                <Pill tone="info">Case open</Pill>
              ) : (
                <Pill tone={r.tone as "danger" | "warning"}>{r.s}</Pill>
              )}
            </Cell>
            <Cell>
              {r.o === "—" ? (
                <span className="text-text-dim">Unassigned</span>
              ) : (
                <Avatar initials={r.o} />
              )}
            </Cell>
          </Row>
        ))}
      </Table>

      <p className="text-[10px] text-muted-foreground">
        Every score breaks down into the signals behind it, so you can argue with one.
      </p>
    </div>
  );
}

/**
 * What an agent sees about themselves.
 *
 * The one screen here that is not the back office looking at the book — it is
 * the producer looking at their own numbers. Every figure is one the product
 * already computes and already scopes by RLS to the person asking: their
 * carrier levels off `listMyCarrierLevels`, placement and 4/7/13-month
 * persistency off `getPersistency`.
 *
 * The persistency bands read 88 / 84 / 79 rather than a single rounded number
 * because that is the shape of a real one — it decays with duration, and an
 * agent who has seen a carrier report knows that.
 */
function GridScreen() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Placement" value="77.8%" delta="42 of 54 submitted" tone="muted" />
        <Tile label="13-mo persistency" value="83.4%" delta="+2.1 pts vs agency" />
        <Tile label="Chargebacks YTD" value={money(1240)} delta="3 policies" tone="warning" />
      </div>

      <div className="grid gap-3 @xl/frame:grid-cols-[1.4fr_1fr]">
        <Table cols={["Carrier", "Level", "Yr 1", "Trail"]}>
          {[
            { c: "Mutual of Omaha", l: "110", y: "110%", t: "5%" },
            { c: "Transamerica", l: "105", y: "105%", t: "4%" },
            { c: "Foresters", l: "100", y: "100%", t: "5%" },
            { c: "GTL", l: "95", y: "95%", t: "3%" },
          ].map((r) => (
            <Row key={r.c}>
              <Cell grow={2} className="text-foreground">
                {r.c}
              </Cell>
              <Cell>
                <Pill tone="info">{r.l}</Pill>
              </Cell>
              <Cell className="tnum text-muted-foreground">{r.y}</Cell>
              <Cell className="tnum hidden text-muted-foreground @xl/frame:block">{r.t}</Cell>
            </Row>
          ))}
        </Table>

        <div className="rounded-lg border border-border p-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Persistency
          </span>
          <div className="mt-2 space-y-2">
            {[
              ["4 month", 88],
              ["7 month", 84],
              ["13 month", 79],
            ].map(([l, v]) => (
              <div key={String(l)}>
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">{l}</span>
                  <span className="tnum font-semibold text-foreground">{v}%</span>
                </div>
                <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <span
                    className={cn(
                      "block h-full rounded-full",
                      (v as number) >= 80 ? "bg-success" : "bg-warning",
                    )}
                    style={{ width: `${v}%` }}
                  />
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[9px] leading-relaxed text-muted-foreground">
            Measured on policies old enough to reach each duration.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Registry ────────────────────────────────────────────────────────────────

// ── The sale, as one record ─────────────────────────────────────────────────

/**
 * One deal, exported, because six screens have to agree about it.
 *
 * The whole claim these screens make is that a sale entered once shows up
 * everywhere without being retyped. If the policy number on the Book screen
 * were a different literal from the one on the Finances screen, the screenshots
 * would be quietly making the opposite claim. So there is one object and the
 * screens read from it — including the launch video in `video/`, which welds a
 * card onto these rows and needs the text underneath to match.
 *
 * Magnitudes come from `src/lib/demo-seed.server.ts`, whose standard is worth
 * repeating: "$10-25k face is what final expense actually looks like. A $2M
 * policy in this book would tell an owner nobody checked."
 */
export const DEAL = {
  client: "Willie Jenkins",
  initials: "WJ",
  city: "Houston, TX",
  age: 71,
  agent: "Priya Raman",
  agentInitials: "PR",
  upline: "Denise Okafor",
  carrier: "Mutual of Omaha",
  product: "Final Expense",
  policyNo: "MUT-4481203",
  face: 15000,
  monthly: 99.99,
  annual: 1199.88,
  effective: "Mar 3, 2026",
  sale: "Feb 18, 2026",
  draftDay: "3rd of the month",
  anniversary: "Mar 3, 2027",
  /** Agent 80 → year one 80% of annual; nine months of it advanced at 75%. */
  level: 80,
  advance: 720,
  trail: 80,
  /** Manager 105 over Agent 80. The override is the 25-point spread. */
  overrideSpread: 25,
  override: 225,
} as const;

/** `money()` rounds to whole dollars; premiums are the one place cents matter. */
const cents = (n: number) => money(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PipelineScreen() {
  const cols: {
    stage: string;
    tone: "muted" | "warning" | "success";
    leads: {
      n: string;
      i: string;
      score: number;
      where: string;
      prem: number;
      sold?: boolean;
    }[];
  }[] = [
    {
      stage: "New / Cold",
      tone: "muted",
      leads: [
        { n: "Consuelo Guerrero", i: "CG", score: 24, where: "Tulsa, OK · Age 66", prem: 48 },
        { n: "Harold Odell", i: "HO", score: 18, where: "Waco, TX · Age 74", prem: 62 },
      ],
    },
    {
      stage: "Callback",
      tone: "warning",
      leads: [
        {
          n: DEAL.client,
          i: DEAL.initials,
          score: 82,
          where: `${DEAL.city} · Age ${DEAL.age}`,
          prem: DEAL.monthly,
          sold: true,
        },
        { n: "Doris Boudreaux", i: "DB", score: 41, where: "Norman, OK · Age 69", prem: 55 },
      ],
    },
    {
      stage: "Almost There",
      tone: "success",
      leads: [{ n: "Ernest Vasquez", i: "EV", score: 91, where: "Dallas, TX · Age 63", prem: 84 }],
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="info">Pipeline · 5</Pill>
        <Pill tone="muted">Sold · 40</Pill>
        <span className="ml-auto text-[9px] text-text-dim">
          Track every lead from first touch to sold.
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {cols.map((c) => (
          <div key={c.stage} className="rounded-lg border border-border bg-surface-2/30 p-1.5">
            <div className="mb-1.5 flex items-center gap-1.5 px-0.5">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  c.tone === "muted" && "bg-text-dim",
                  c.tone === "warning" && "bg-warning",
                  c.tone === "success" && "bg-success",
                )}
              />
              <span className="truncate text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {c.stage}
              </span>
              <span className="tnum ml-auto text-[9px] text-text-dim">{c.leads.length}</span>
            </div>

            <div className="space-y-1.5">
              {c.leads.map((l) => (
                <div key={l.n} className="rounded-md border border-border bg-card p-2">
                  <div className="flex items-center gap-1.5">
                    <Avatar initials={l.i} className="h-5 w-5 text-[8px]" />
                    <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-foreground">
                      {l.n}
                    </span>
                    <span className="tnum text-[9px] text-muted-foreground">{l.score}%</span>
                  </div>
                  <div className="mt-1 truncate text-[9px] text-text-dim">{l.where}</div>
                  <div className="tnum mt-0.5 text-[9px] text-muted-foreground">
                    {cents(l.prem)}/mo
                  </div>
                  {l.sold && (
                    <div className="mt-1.5 flex items-center justify-center gap-1 rounded bg-primary px-1.5 py-1 text-[9px] font-semibold text-gold-foreground">
                      <DollarSign className="h-2.5 w-2.5" /> Mark Sold
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One labelled input, at screenshot scale. `value` empty renders a placeholder. */
function Field({
  label,
  value,
  placeholder,
  tone,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  tone?: "gold" | "success";
}) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[9px] font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 truncate rounded-md border px-2 py-1 text-[10px]",
          tone === "success"
            ? "border-success/30 bg-success/[0.06] text-success"
            : tone === "gold"
              ? "border-primary/30 bg-primary/[0.05] text-gold-bright"
              : "border-border bg-surface-2/50",
          value ? "text-foreground" : "text-text-dim",
          tone && "font-semibold",
        )}
      >
        {value ?? placeholder}
      </div>
    </div>
  );
}

function PostDealScreen() {
  return (
    <div className="space-y-2.5">
      <div className="rounded-lg border border-border p-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Client Information
        </span>
        <div className="mt-2 grid grid-cols-2 gap-2 @xl/frame:grid-cols-4">
          <Field label="First Name *" value="Willie" />
          <Field label="Last Name *" value="Jenkins" />
          <Field label="Phone Number *" value="(713) 555-0148" />
          <Field label="Date of Birth *" value="04 / 09 / 1954" />
        </div>
      </div>

      <div className="rounded-lg border border-border p-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Policy Details
        </span>
        <div className="mt-2 grid grid-cols-2 gap-2 @xl/frame:grid-cols-4">
          <Field label="Carrier *" value={DEAL.carrier} />
          <Field label="Product Sold *" value={DEAL.product} />
          <Field label="Policy Number *" value={DEAL.policyNo} />
          <Field label="Effective Date *" value={DEAL.effective} />
          <Field label="Face Amount *" value={money(DEAL.face)} />
          <Field label="Monthly Premium *" value={cents(DEAL.monthly)} />
          <Field label="Policy Status *" value="Submitted" />
          <Field label="Annual Premium" value={`${cents(DEAL.annual)} / year`} tone="success" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[9px] text-text-dim">
            {DEAL.carrier}&rsquo;s products, from the comp grid.
          </span>
          <span className="ml-auto rounded-md bg-primary px-3 py-1.5 text-[10px] font-semibold text-gold-foreground">
            Post Deal
          </span>
        </div>
      </div>
    </div>
  );
}

function BookScreen() {
  const rows = [
    {
      c: DEAL.client,
      ca: DEAL.carrier,
      p: DEAL.product,
      no: DEAL.policyNo,
      eff: DEAL.effective,
      ann: DEAL.annual,
      st: ["info", "Submitted"],
    },
    {
      c: "Gloria Delgado",
      ca: "Americo",
      p: "Mortgage Protection",
      no: "AME-2207184",
      eff: "Jan 12, 2026",
      ann: 1044,
      st: ["success", "Active"],
    },
    {
      c: "Ernest Pham",
      ca: "Foresters",
      p: "Whole Life",
      no: "FOR-9910447",
      eff: "Dec 4, 2025",
      ann: 1380,
      st: ["success", "Active"],
    },
    {
      c: "Mildred Castillo",
      ca: DEAL.carrier,
      p: DEAL.product,
      no: "MUT-4470912",
      eff: "Nov 21, 2025",
      ann: 852,
      st: ["warning", "Lapse pending"],
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 @xl/frame:grid-cols-4">
        <Tile label="Total Policies" value="53" delta="+1 today" tone="success" />
        <Tile label="Total Annual Premium" value={money(63480)} delta="+$1,200" tone="success" />
        <Tile label="Active Rate" value="94%" delta="49 active" tone="muted" />
        <Tile label="Avg Policy Size" value={money(1198)} delta="Per year" tone="muted" />
      </div>

      <Table
        cols={["Client Name", "Carrier", "Product", "Policy #", "Effective", "Annual", "Status"]}
      >
        {rows.map((r) => (
          <Row key={r.no}>
            <Cell grow={2} className="text-foreground">
              {r.c}
            </Cell>
            <Cell className="text-muted-foreground">{r.ca}</Cell>
            <Cell className="text-muted-foreground">{r.p}</Cell>
            <Cell className="tnum text-muted-foreground">{r.no}</Cell>
            <Cell className="tnum hidden text-muted-foreground @xl/frame:block">{r.eff}</Cell>
            <Cell className="tnum font-semibold text-success">{money(r.ann)}</Cell>
            <Cell>
              <Pill tone={r.st[0] as "success" | "warning" | "info"}>{r.st[1]}</Pill>
            </Cell>
          </Row>
        ))}
      </Table>

      <div className="tnum flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-border bg-surface-2/30 px-3 py-2 text-[9px] text-muted-foreground">
        <span>
          Effective <span className="text-foreground">{DEAL.effective}</span>
        </span>
        <span>
          Draft <span className="text-foreground">{DEAL.draftDay}</span>
        </span>
        <span>
          Anniversary <span className="text-foreground">{DEAL.anniversary}</span>
        </span>
        <span className="text-text-dim">Kept from the day it is written.</span>
      </div>
    </div>
  );
}

function LeaderboardScreen({ scope }: { scope: ScreenScope }) {
  const board = [
    { r: 1, n: "Tanya Bright", i: "TB", alp: 52800, pol: 44, avg: 1200, up: true },
    { r: 2, n: "Curtis Nolan", i: "CN", alp: 41200, pol: 33, avg: 1248, up: true },
    { r: 3, n: DEAL.upline, i: "DO", alp: 28900, pol: 24, avg: 1204, up: false },
    {
      r: 4,
      n: DEAL.agent,
      i: DEAL.agentInitials,
      alp: 19600,
      pol: 16,
      avg: 1225,
      up: true,
      you: true,
    },
    { r: 5, n: "Dwayne Ellis", i: "DE", alp: 18300, pol: 15, avg: 1220, up: false },
    { r: 6, n: "Sofia Marchetti", i: "SM", alp: 14750, pol: 12, avg: 1229, up: true },
    { r: 7, n: "Grady Lawson", i: "GL", alp: 11400, pol: 9, avg: 1267, up: false },
  ];
  const rows = scope === "agency" ? board : board.filter((b) => b.you);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        {(["Mine", "Team", "Agency", "Total IMO"] as const).map((t) => {
          const on = scope === "agency" ? t === "Agency" : t === "Mine";
          return (
            <span
              key={t}
              className={cn(
                "rounded-md px-2 py-1 text-[9px] font-semibold",
                on ? "bg-primary/15 text-primary" : "text-text-dim",
              )}
            >
              {t}
            </span>
          );
        })}
      </div>

      <div className="rounded-lg border border-primary/30 bg-primary/[0.05] px-3 py-2">
        <div className="tnum text-xl font-bold leading-none text-gold-bright" style={display}>
          {money(scope === "agency" ? 248400 : 19600)} ALP
        </div>
        <div className="tnum mt-1 text-[9px] text-muted-foreground">
          {scope === "agency"
            ? "14 agents producing · 186 policies written · Avg $1,335/policy"
            : "16 policies written · Avg $1,225/policy · +1 today"}
        </div>
      </div>

      <Table cols={["Rank", "Agent", "ALP", "Policies", "Avg/Policy", "Trend"]}>
        {rows.map((b) => (
          <Row key={b.n}>
            <Cell grow={2}>
              <span className="flex items-center gap-1.5">
                {b.r === 1 ? (
                  <Trophy className="h-3 w-3 shrink-0 text-primary" />
                ) : (
                  <span className="tnum w-3 shrink-0 text-center text-[10px] text-text-dim">
                    {b.r}
                  </span>
                )}
                <Avatar initials={b.i} className="h-5 w-5 text-[8px]" />
                <span
                  className={cn(
                    "truncate",
                    b.you ? "font-semibold text-primary" : "text-foreground",
                  )}
                >
                  {b.n}
                </span>
                {b.you && <Pill tone="info">You</Pill>}
              </span>
            </Cell>
            <Cell className="tnum hidden text-muted-foreground @xl/frame:block">{b.i}</Cell>
            <Cell className="tnum font-semibold text-foreground">{money(b.alp)}</Cell>
            <Cell className="tnum text-muted-foreground">{b.pol}</Cell>
            <Cell className="tnum hidden text-muted-foreground @xl/frame:block">
              {money(b.avg)}
            </Cell>
            <Cell className={b.up ? "text-success" : "text-text-dim"}>
              {b.up ? <ArrowUp className="h-3 w-3" /> : "—"}
            </Cell>
          </Row>
        ))}
      </Table>
    </div>
  );
}

function FinancesScreen() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 @xl/frame:grid-cols-4">
        <Tile label="Direct YTD" value={money(38940)} delta="Advance + trail paid" tone="muted" />
        <Tile
          label="Override Pending"
          value={money(6210)}
          delta="From downline production"
          tone="success"
        />
        <Tile
          label="Trail Pending"
          value={money(4880)}
          delta="Months 10–12 deferred"
          tone="muted"
        />
        <Tile label="Renewal Pending" value={money(2340)} delta="Years 2+ renewals" tone="muted" />
      </div>

      <div className="rounded-lg border border-border">
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Scheduled Payouts
          </span>
          <span className="ml-auto text-[9px] text-text-dim">Feb 18, 2026</span>
        </div>
        <div className="divide-y divide-border-soft">
          {[
            {
              who: DEAL.client,
              type: ["info", "Advance"],
              amt: DEAL.advance,
              meta: `${DEAL.carrier} · ${DEAL.policyNo} · ${DEAL.level}% · Yr 1`,
            },
            {
              who: DEAL.client,
              type: ["success", "Override"],
              amt: DEAL.override,
              meta: `${DEAL.carrier} · ${DEAL.policyNo} · ${DEAL.overrideSpread}% · via ${DEAL.agent}`,
            },
            {
              who: "Gloria Delgado",
              type: ["muted", "Trail"],
              amt: DEAL.trail,
              meta: "Americo · AME-2207184 · Mo 10 of 12",
            },
          ].map((r, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-[2]">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[11px] text-foreground">{r.who}</span>
                  <Pill tone={r.type[0] as "info" | "success" | "muted"}>{r.type[1]}</Pill>
                </span>
                <span className="tnum mt-0.5 block truncate text-[9px] text-text-dim">
                  {r.meta}
                </span>
              </span>
              <span className="tnum shrink-0 text-[11px] font-semibold text-foreground">
                {money(r.amt)}
              </span>
              <Pill tone="muted">Projected</Pill>
            </div>
          ))}
        </div>
      </div>

      <div className="tnum rounded-lg border border-border bg-surface-2/30 px-3 py-2 text-[9px] text-muted-foreground">
        Year one {money(960)} · {DEAL.level}% of {money(1200)} · advance {money(DEAL.advance)} ·
        months 10/11/12 at {money(DEAL.trail)} · override to {DEAL.upline} on the{" "}
        {DEAL.overrideSpread}-point spread
      </div>
    </div>
  );
}

function NovaScreen() {
  const cards: { t: string; d: string; st: ["success" | "info" | "muted", string] }[] = [
    { t: "Client welcome", d: "SMS drafted for your review", st: ["info", "Ready"] },
    { t: "Draft reminder", d: `Bank draft · ${DEAL.draftDay}`, st: ["muted", "Scheduled"] },
    {
      t: "Policy anniversary",
      d: `Review + referral · ${DEAL.anniversary}`,
      st: ["muted", "Scheduled"],
    },
    { t: "Lapse follow-up", d: "Watching from day one", st: ["success", "Active"] },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/70">
          <Sparkles className="h-4 w-4 text-gold-foreground" />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-foreground" style={display}>
              Nova AI
            </span>
            <Pill tone="info">Beta</Pill>
          </span>
          <span className="mt-0.5 flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> online
          </span>
        </span>
        <span className="tnum ml-auto hidden text-[9px] text-text-dim @xl/frame:block">
          {DEAL.client} · {DEAL.policyNo}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {cards.map((c) => (
          <div key={c.t} className="rounded-lg border border-border bg-surface-2/30 p-2.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-foreground">
                {c.t}
              </span>
              <Pill tone={c.st[0]}>{c.st[1]}</Pill>
            </div>
            <div className="mt-1 truncate text-[9px] text-muted-foreground">{c.d}</div>
          </div>
        ))}
      </div>

      <div className="text-[9px] text-text-dim">
        Nova drafts; you approve. Every message it writes is kept with the policy.
      </div>
    </div>
  );
}

/**
 * Three entries, not fifteen.
 *
 * The registry used to carry a `caption` per screen — the one-line claim the
 * screenshot was evidence for — because ProductTour rendered a caption under
 * each tab. The bands write their own copy, so the field went with the tour
 * rather than sitting here as documentation nobody renders.
 */
const SCREENS: Record<
  ScreenKey,
  {
    label: string | ((scope: ScreenScope) => string);
    /** Sidebar entry to light up. */
    nav?: string;
    render: (scope: ScreenScope) => React.ReactNode;
  }
> = {
  contracting: { label: "Contracting", nav: "Contracting", render: () => <ContractingScreen /> },
  commissions: { label: "Commissions", nav: "Commissions", render: () => <CommissionsScreen /> },
  retention: { label: "Retention", nav: "Retention", render: () => <RetentionScreen /> },
  grid: { label: "My Comp Grid", nav: "Agents", render: () => <GridScreen /> },
  pipeline: { label: "Pipeline", nav: "Pipeline", render: () => <PipelineScreen /> },
  postDeal: { label: "Post a Deal", nav: "Post a Deal", render: () => <PostDealScreen /> },
  book: { label: "Book of Business", nav: "Book of Business", render: () => <BookScreen /> },
  leaderboard: {
    // The application does the same: a producer with no downline gets "My
    // Production", and the board only calls itself a board once it has a field.
    label: (scope) => (scope === "agency" ? "Leaderboard" : "My Production"),
    nav: "Leaderboard",
    render: (scope) => <LeaderboardScreen scope={scope} />,
  },
  finances: { label: "Finances", nav: "Finances", render: () => <FinancesScreen /> },
  nova: { label: "Nova AI", nav: "Nova", render: () => <NovaScreen /> },
};

/** A single screen with its chrome, ready to drop anywhere on the page. */
export function Screen({
  screen,
  className,
  scope = "mine",
}: {
  screen: ScreenKey;
  className?: string;
  /** Read by `leaderboard` only; the others render the same either way. */
  scope?: ScreenScope;
}) {
  const s = SCREENS[screen];
  return (
    <AppFrame
      title={typeof s.label === "function" ? s.label(scope) : s.label}
      active={s.nav}
      className={className}
    >
      {s.render(scope)}
    </AppFrame>
  );
}
