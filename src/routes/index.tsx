import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  
  ArrowRight,
  LayoutDashboard,
  KanbanSquare,
  Users,
  Phone,
  Sparkles,
  BarChart3,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SmoothAreaChart } from "@/components/ui/area-chart";
import { Icon, type IconName } from "@/components/ui/icon";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agent Cloud — The operating system for life insurance agencies" },
      {
        name: "description",
        content:
          "A command-center dashboard, drag-and-drop pipeline, built-in phone & SMS, commissions, downline analytics, and Nova — an AI assistant with retention automations. Join the waitlist.",
      },
      { property: "og:title", content: "Agent Cloud — The operating system for life insurance agencies" },
      {
        property: "og:description",
        content:
          "One cloud to run your book, your team, and your commissions. Join the Agent Cloud waitlist.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const display = { fontFamily: "var(--font-display)" } as const;

function LandingPage() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/public/waitlist-count")
      .then((r) => r.json())
      .then((d) => setCount(d.count ?? 0))
      .catch(() => setCount(null));
  }, []);

  return (
    <div className="dark min-h-screen bg-background text-foreground antialiased">
      <TopNav />
      <Hero count={count} />
      <LogoBar />
      <FeatureGrid />
      <PipelineSection />
      <ContractingSection />
      <DownlineSection />
      <NovaSection />
      <AnalyticsSection />
      <WaitlistBand onCount={setCount} />
      <Footer />
    </div>
  );
}

function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <BrandLogo size={36} />

          <div className="flex flex-col leading-none">
            <span className="text-xl font-bold tracking-[0.14em] text-foreground" style={display}>
              AGENT CLOUD
            </span>
            <span className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Insurance OS</span>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#pipeline" className="hover:text-foreground transition-colors">Pipeline</a>
          <a href="#downline" className="hover:text-foreground transition-colors">Downline</a>
          <a href="#nova" className="hover:text-foreground transition-colors">Nova AI</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden sm:inline-flex text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2"
          >
            Sign in
          </Link>
          <a href="#waitlist">
            <Button size="sm">
              Join waitlist <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero({ count }: { count: number | null }) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-70"
        style={{
          background:
            "radial-gradient(700px 400px at 15% 0%, color-mix(in srgb, var(--gold) 15%, transparent), transparent 60%), radial-gradient(600px 380px at 90% 10%, var(--gold-glow), transparent 60%)",
        }}
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Now taking early access
          </div>
          <h1
            className="mt-6 font-bold tracking-tight text-5xl sm:text-6xl md:text-7xl leading-[0.98] text-foreground"
            style={display}
          >
            Your entire insurance <br className="hidden sm:block" />
            business. <span className="text-primary">One cloud.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            A command-center dashboard, drag-and-drop pipeline, built-in phone & SMS, commissions,
            downline analytics, and an AI assistant that actually knows your book — built for life
            insurance agents and the agencies that lead them.
          </p>
          <div className="mt-8">
            <HeroWaitlist />
          </div>
          <div className="mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <div className="flex -space-x-2">
              {["var(--gold)", "var(--surface-2)", "var(--gold-dim)"].map((c, i) => (
                <span key={i} className="h-6 w-6 rounded-full border-2 border-background" style={{ backgroundColor: c }} />
              ))}
            </div>
            <span>
              {count === null ? "Loading…" : <><b className="tnum text-foreground">{count.toLocaleString()}</b> agents on the waitlist</>}
            </span>
          </div>
        </div>

        <DashboardMock />
      </div>
    </section>
  );
}

function HeroWaitlist() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      const res = await fetch("/api/public/waitlist-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: "Friend",
          last_name: "of Agent Cloud",
          email,
          source: "landing_hero",
        }),
      });
      if (!res.ok) throw new Error("failed");
      setDone(true);
      toast.success("You're on the waitlist");
    } catch {
      toast.error("Couldn't join — try again");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <span>You're on the list. Check your inbox soon.</span>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-md flex-col sm:flex-row items-stretch gap-2">
      <Input
        type="email"
        required
        placeholder="you@agency.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-11"
      />
      <Button type="submit" disabled={loading} className="h-11">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Join waitlist <ArrowRight className="ml-1.5 h-4 w-4" /></>}
      </Button>
    </form>
  );
}

const MOCK_NAV: Array<{ label: string; items: Array<{ icon: IconName; label: string; active?: boolean }> }> = [
  {
    label: "Production",
    items: [
      { icon: "grid", label: "Dashboard", active: true },
      { icon: "flow", label: "Pipeline" },
      { icon: "book", label: "Book of Business" },
      { icon: "coin", label: "Finances" },
      { icon: "chart", label: "Analytics" },
    ],
  },
  {
    label: "Agency",
    items: [
      { icon: "users", label: "Team" },
      { icon: "trophy", label: "Leaderboard" },
      { icon: "doc", label: "Contracts" },
    ],
  },
  {
    label: "Enablement",
    items: [{ icon: "folder", label: "Resources" }],
  },
  {
    label: "Tools",
    items: [
      { icon: "phone", label: "Phone" },
      { icon: "calendar", label: "Calendar" },
      { icon: "nova", label: "Nova AI" },
    ],
  },
];

const MOCK_TREND = [12, 16, 14, 19, 22, 20, 26, 31, 28, 36, 41, 39, 46, 52, 49, 58, 63, 67];

function DashboardMock() {
  const kpis = [
    { label: "Today ALP", value: "$4,250", delta: "+$1,180", up: true },
    { label: "Week ALP", value: "$18,750", delta: "+12.4%", up: true },
    { label: "Active Policies", value: "142", delta: "+3 today", up: true },
    { label: "Team ALP", value: "$284K", delta: "-2.1% MoM", up: false },
  ];
  return (
    <div className="mt-14 relative mx-auto max-w-6xl">
      <div className="rounded-2xl border border-border shadow-2xl shadow-primary/10 bg-card overflow-hidden">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 bg-surface-2/60">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
          </div>
          <span className="ml-2 text-xs text-muted-foreground">agent-cloud.app / dashboard</span>
        </div>

        <div className="grid md:grid-cols-[200px_1fr] min-h-[420px]">
          {/* Sidebar strip */}
          <aside className="hidden md:flex flex-col gap-3 border-r border-border p-3 bg-sidebar/60">
            {MOCK_NAV.map((group) => (
              <div key={group.label}>
                <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-text-dim">{group.label}</p>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((it) => (
                    <div
                      key={it.label}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] ${
                        it.active ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground"
                      }`}
                    >
                      <Icon name={it.icon} size={14} />
                      {it.label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </aside>

          {/* Main */}
          <div className="p-4 md:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Good morning</p>
                <h3 className="text-2xl font-bold tracking-tight" style={display}>Dashboard</h3>
              </div>
              <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-border-soft bg-surface-2 px-2 py-1 text-[10.5px] text-muted-foreground">
                <Icon name="search" size={12} /> Jump anywhere <kbd className="rounded border border-border px-1 text-[9px] text-foreground">⌘K</kbd>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_230px]">
              {/* Hero band */}
              <div className="rounded-xl border border-border bg-background overflow-hidden">
                <div className="grid sm:grid-cols-[minmax(0,240px)_1fr]">
                  <div className="grid grid-cols-2 sm:border-r border-border">
                    {kpis.map((k, i) => (
                      <div
                        key={k.label}
                        className={`flex flex-col justify-center p-3 min-h-[76px] ${i < 2 ? "border-b border-border" : ""} ${i % 2 === 0 ? "border-r border-border" : ""}`}
                      >
                        <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{k.label}</p>
                        <p className="tnum mt-1 text-lg font-bold tracking-tight text-foreground" style={display}>{k.value}</p>
                        <p className={`tnum mt-0.5 flex items-center gap-1 text-[10.5px] font-semibold ${k.up ? "text-success" : "text-destructive"}`}>
                          <Icon name={k.up ? "up" : "down"} size={11} /> {k.delta}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="p-4 min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-muted-foreground" style={display}>
                      Month-to-date ALP
                    </p>
                    <div className="mt-1 flex items-baseline gap-2.5">
                      <span className="tnum text-3xl md:text-4xl font-bold tracking-tight text-gold-bright" style={display}>
                        $67,200
                      </span>
                      <span className="tnum inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                        <Icon name="up" size={12} /> +18.2%
                      </span>
                    </div>
                    <div className="mt-2.5">
                      <SmoothAreaChart data={MOCK_TREND} h={96} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Nova rail */}
              <div className="rounded-xl border border-border bg-background p-3 flex flex-col gap-2.5">
                <p className="text-xs font-semibold text-destructive">Needs attention</p>
                <div className="flex items-center gap-2 rounded-lg border border-border-soft bg-surface-2 px-2.5 py-2">
                  <span className="text-destructive shrink-0"><Icon name="alert" size={14} /></span>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-foreground">Policy TA-88214 · R. Cole</p>
                    <p className="tnum text-[10px] text-muted-foreground">22 days unpaid · $84/mo</p>
                  </div>
                </div>
                <div className="mt-auto rounded-lg border border-primary/25 bg-primary/5 p-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                    <Icon name="nova" size={13} /> Nova
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-foreground">
                    3 warm leads have gone quiet. Want me to draft follow-up texts?
                  </p>
                  <div className="mt-2 flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-[10.5px] text-muted-foreground">
                    Ask Nova anything…
                    <span className="ml-auto text-primary"><Icon name="send" size={12} /></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogoBar() {
  const carriers = ["Mutual of Omaha", "Transamerica", "AHL", "Foresters", "GTL", "Prudential", "Royal Neighbors"];
  return (
    <section className="border-y border-border/60 bg-surface-2/50 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="text-center text-xs uppercase tracking-[0.24em] text-muted-foreground mb-5">
          Built around the carriers you already write
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {carriers.map((c) => (
            <span key={c} className="text-lg font-bold tracking-[0.12em] text-muted-foreground" style={display}>
              {c}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureGrid() {
  const items = [
    {
      icon: LayoutDashboard,
      title: "Command-center Dashboard",
      desc: "ALP, goal pace, leaderboard, commissions, and at-risk policies — one live screen that runs your morning.",
    },
    {
      icon: KanbanSquare,
      title: "Pipeline",
      desc: "A drag-and-drop kanban that speaks life insurance — temperature, stage, and follow-ups that never slip.",
    },
    {
      icon: Sparkles,
      title: "Nova AI",
      desc: "An assistant plus retention automations: birthday cards, policy-anniversary touches, and lapse follow-ups on autopilot.",
    },
    {
      icon: Phone,
      title: "Built-in Phone & SMS",
      desc: "Click-to-dial, texting, and voicemail drops from any device — every touch logged straight to the client.",
    },
  ];
  return (
    <section id="features" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHead
          eyebrow="Four tools that run your day"
          title="One platform. No more tab-hopping."
          copy="Stop stitching together five CRMs, three spreadsheets, and a Google Doc. Agent Cloud is the single home for your book — and when you need to move fast, the ⌘K command palette takes you anywhere in a keystroke."
        />
        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {items.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-6 hover:border-primary/50 transition-colors">
              <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary grid place-items-center">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-xl font-bold tracking-tight text-foreground" style={display}>{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionHead({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs uppercase tracking-[0.24em] text-primary font-semibold">{eyebrow}</p>
      <h2 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight text-foreground" style={display}>{title}</h2>
      <p className="mt-4 text-muted-foreground">{copy}</p>
    </div>
  );
}

function PipelineSection() {
  return (
    <FeatureSection
      id="pipeline"
      eyebrow="Pipeline"
      title="A CRM that speaks life insurance."
      copy="Warm, hot, cold. Quoted, submitted, issued, in force. Beneficiaries, riders, replacements — every field an agent actually needs, none of the SaaS bloat."
      bullets={[
        "Drag-and-drop kanban + list view with temperature and stage filters",
        "Auto-imports from AgentLink, PDB, and CSV",
        "Attach quotes, needs analysis, and voice notes",
        "One-click hand-off from lead to sold policy",
      ]}
      right={<PipelineMock />}
    />
  );
}

function ContractingSection() {
  return (
    <FeatureSection
      id="contracting"
      eyebrow="Contracting & Commissions"
      title="Know exactly what you're getting paid — before it hits the bank."
      copy="Agent Cloud calculates commissions the way real IMOs do: writing-agent rate, uplines, advances, chargebacks, and renewals. GTL and AHL exceptions are built in."
      bullets={[
        "Live commission grids per carrier and level",
        "Advance + renewal schedules generated on issue",
        "Override chain walks your full downline",
        "One-click carrier contracting with SureLC + AgentLink",
      ]}
      right={<CommissionMock />}
      reverse
    />
  );
}

function DownlineSection() {
  return (
    <FeatureSection
      id="downline"
      eyebrow="Downline Command Center"
      title="Run your agency like the top 1%."
      copy="See your entire hierarchy in one view — production, activity, contracting status, and licensing gaps — filtered by any level, any date range."
      bullets={[
        "Personal vs team production, cleanly partitioned",
        "Recruiting funnels and pending-agent tracker",
        "Announcements, challenges, and leaderboards",
        "White-label agency branding on every screen",
      ]}
      right={<DownlineMock />}
    />
  );
}

function NovaSection() {
  return (
    <FeatureSection
      id="nova"
      eyebrow="Nova AI"
      title="An assistant that actually knows your book."
      copy="Nova reads your pipeline, your policies, your carrier grids, and your calendar — then does the work. Draft the SMS, price the case, brief the meeting, and keep every client warm without you lifting a finger."
      bullets={[
        "Daily briefing every morning",
        "Automations manager — flip on birthday cards, policy-anniversary notes, and lapse follow-ups",
        "Custom client touches: define the moment once, Nova runs it forever",
        "Quote and case-design recommendations",
        "Nurture drafts that sound like you, not like AI",
      ]}
      right={<NovaMock />}
      reverse
    />
  );
}

function AnalyticsSection() {
  return (
    <FeatureSection
      id="analytics"
      eyebrow="Analytics"
      title="Every number, always current."
      copy="ALP, sale size, close rate, activity, retention. Roll it up by agent, by team, by carrier, by state — export or leave it in the dashboard."
      bullets={[
        "Real-time dashboards for agents and leaders",
        "Book-of-business snapshots and trend lines",
        "Carrier-level production and lapse tracking",
        "AI insights that flag what's changed this week",
      ]}
      right={<AnalyticsMock />}
    />
  );
}

function FeatureSection({
  id,
  eyebrow,
  title,
  copy,
  bullets,
  right,
  reverse,
}: {
  id: string;
  eyebrow: string;
  title: string;
  copy: string;
  bullets: string[];
  right: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <section id={id} className="py-24 border-t border-border/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className={`grid gap-12 lg:grid-cols-2 lg:items-center ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-primary font-semibold">{eyebrow}</p>
            <h2 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight text-foreground" style={display}>{title}</h2>
            <p className="mt-4 text-muted-foreground">{copy}</p>
            <ul className="mt-6 space-y-3">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-foreground">{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>{right}</div>
        </div>
      </div>
    </section>
  );
}

function PipelineMock() {
  const cols: Array<[string, string[]]> = [
    ["New", ["J. Rivera · Term", "M. Chen · IUL"]],
    ["Quoted", ["L. Patel · Final Exp", "D. Ortiz · IUL"]],
    ["Submitted", ["A. Kim · Term"]],
    ["Sold", ["R. Cole · IUL", "P. Vance · Final Exp"]],
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-lg shadow-primary/5">
      <div className="grid grid-cols-4 gap-2">
        {cols.map(([name, cards]) => (
          <div key={name} className="rounded-lg bg-surface-2/70 p-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 font-semibold">{name}</p>
            <div className="space-y-1.5">
              {cards.map((c) => (
                <div key={c} className="rounded-md border border-border-soft bg-background p-2 text-[11px] text-foreground">
                  {c}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommissionMock() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-lg shadow-primary/5">
      <div className="flex items-center justify-between mb-4">
        <p className="font-semibold text-foreground">Commission Schedule</p>
        <Wallet className="h-4 w-4 text-primary" />
      </div>
      <div className="space-y-2 text-sm">
        {[
          ["Advance (75%)", "Transamerica IUL", "$3,412.50", true],
          ["Renewal M13", "Mutual of Omaha", "$248.00", false],
          ["Override", "AHL FE", "$612.00", true],
          ["GTL Cap", "GTL Heritage", "$600.00", true],
        ].map(([label, carrier, amt, paid]) => (
          <div key={label as string} className="flex items-center justify-between rounded-lg border border-border-soft bg-surface-2 px-3 py-2">
            <div>
              <p className="text-foreground text-[13px] font-medium">{label}</p>
              <p className="text-[11px] text-muted-foreground">{carrier}</p>
            </div>
            <div className="text-right">
              <p className="tnum font-semibold text-foreground" style={display}>{amt}</p>
              <p className={`text-[10px] uppercase tracking-wider ${paid ? "text-success" : "text-warning"}`}>
                {paid ? "Paid" : "Pending"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DownlineMock() {
  const rows = [
    ["Samuel V.", "$182k", "42"],
    ["Kaeden J.", "$156k", "38"],
    ["Maria P.", "$121k", "31"],
    ["Chris D.", "$97k", "24"],
    ["Alex T.", "$68k", "18"],
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-lg shadow-primary/5">
      <div className="flex items-center justify-between mb-4">
        <p className="font-semibold text-foreground">Team Leaderboard · YTD</p>
        <Users className="h-4 w-4 text-primary" />
      </div>
      <div className="space-y-1.5">
        {rows.map(([name, alp, pols], i) => (
          <div key={name} className="flex items-center gap-3 rounded-lg border border-border-soft bg-surface-2 px-3 py-2">
            <div className={`tnum h-6 w-6 rounded-full grid place-items-center text-[11px] font-bold ${i === 0 ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>
              {i + 1}
            </div>
            <span className="flex-1 text-sm text-foreground">{name}</span>
            <span className="tnum text-sm text-foreground font-semibold w-16 text-right" style={display}>{alp}</span>
            <span className="tnum text-xs text-muted-foreground w-10 text-right">{pols} pol</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NovaMock() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-lg shadow-primary/5 space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <div className="h-8 w-8 rounded-full bg-primary/10 text-primary grid place-items-center">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Nova</p>
          <p className="text-[11px] text-muted-foreground">Daily briefing · 8:02 AM</p>
        </div>
      </div>
      <div className="rounded-lg border border-border-soft bg-surface-2 p-3 text-sm text-foreground leading-relaxed">
        You have <b className="tnum">2 policies</b> issued overnight worth <b className="tnum">$4,120</b> in advance commission. Three warm leads
        went cold this week — want me to draft nurture texts?
      </div>
      <div className="space-y-1.5">
        {[
          ["Birthday cards", true],
          ["Policy anniversary notes", true],
          ["Lapse follow-ups", true],
        ].map(([label, on]) => (
          <div key={label as string} className="flex items-center justify-between rounded-lg border border-border-soft bg-surface-2 px-3 py-2">
            <span className="text-xs text-foreground">{label}</span>
            <span className={`relative h-4 w-7 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}>
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-background ${on ? "right-0.5" : "left-0.5"}`} />
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="text-xs">Draft texts</Button>
        <Button size="sm" className="text-xs">Show issued</Button>
      </div>
    </div>
  );
}

function AnalyticsMock() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-lg shadow-primary/5">
      <div className="flex items-center justify-between mb-4">
        <p className="font-semibold text-foreground">Production · last 12 months</p>
        <BarChart3 className="h-4 w-4 text-primary" />
      </div>
      <div className="flex items-end gap-1.5 h-40">
        {[30, 45, 38, 52, 60, 48, 72, 66, 78, 85, 92, 100].map((h, i) => (
          <div key={i} className="flex-1 rounded-t bg-primary/80" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 text-center text-[11px] text-muted-foreground">
        <div><b className="tnum text-foreground text-sm block" style={display}>$1.24M</b>ALP</div>
        <div><b className="tnum text-foreground text-sm block" style={display}>312</b>Policies</div>
        <div><b className="tnum text-foreground text-sm block" style={display}>63%</b>Close rate</div>
      </div>
    </div>
  );
}

function WaitlistBand({ onCount }: { onCount: (n: number) => void }) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    persona: "solo" as "solo" | "agency_owner" | "recruit" | "other",
  });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/public/waitlist-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source: "landing_cta" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "failed");
      setDone(true);
      if (typeof data.count === "number") onCount(data.count);
      toast.success("You're on the waitlist");
    } catch (err: any) {
      toast.error(err?.message || "Couldn't join — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="waitlist" className="py-24 border-t border-border/60 bg-gradient-to-b from-primary/5 to-background">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="rounded-3xl border border-primary/30 bg-card p-8 md:p-12 shadow-xl shadow-primary/10">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold">
              <ShieldCheck className="h-3.5 w-3.5" /> Early access
            </div>
            <h2 className="mt-4 text-4xl md:text-5xl font-bold tracking-tight" style={display}>Join the Agent Cloud waitlist</h2>
            <p className="mt-3 text-muted-foreground">
              Get early access, launch updates, and a founder-tier discount when we open the doors.
            </p>
          </div>

          {done ? (
            <div className="mt-8 rounded-2xl border border-primary/40 bg-primary/5 p-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-primary mx-auto" />
              <h3 className="mt-2 text-2xl font-bold tracking-tight" style={display}>You're on the list</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                We'll email you as soon as your invite is ready. Check your inbox for a confirmation.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fn">First name</Label>
                <Input id="fn" required value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ln">Last name</Label>
                <Input id="ln" required value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="em">Email</Label>
                <Input id="em" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ph">Phone (optional)</Label>
                <Input id="ph" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr">I am a…</Label>
                <select
                  id="pr"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.persona}
                  onChange={(e) => setForm({ ...form, persona: e.target.value as any })}
                >
                  <option value="solo">Solo agent</option>
                  <option value="agency_owner">Agency owner</option>
                  <option value="recruit">New / recruit</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={loading} className="w-full h-11">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Join waitlist <ArrowRight className="ml-1.5 h-4 w-4" /></>}
                </Button>
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  No spam. Unsubscribe anytime. We'll only email you about Agent Cloud.
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BrandLogo size={24} rounded="rounded-md" />

          <span className="font-bold tracking-[0.14em] text-foreground" style={display}>AGENT CLOUD</span>
          <span className="tnum">© {new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground">Features</a>
          <Link to="/login" className="hover:text-foreground">Sign in</Link>
          <a href="mailto:hello@useagentcloud.com" className="hover:text-foreground">Contact</a>
        </div>
      </div>
    </footer>
  );
}
