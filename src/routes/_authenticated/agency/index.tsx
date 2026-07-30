import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle, BarChart3, Bot, Building2, ClipboardList, FileSignature, Heart,
  Activity, IdCard, Mail, Palette, Percent, ShieldCheck, Target, Trophy, UploadCloud, UserPlus, Users, Wallet,
} from "lucide-react";
import { PageShell, Panel } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerFn } from "@/hooks/use-server-fn";
import { useMyAccess } from "@/hooks/use-my-access";
import { getContractingOverview } from "@/lib/contracting-ops.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agency/")({
  component: AgencyAdminPage,
  head: () => ({ meta: [{ title: "Agency Admin | Agent Cloud" }] }),
});

/**
 * Agency Admin.
 *
 * One place for everything an owner or admin runs, instead of a dozen entries
 * competing for space in the main sidebar. The sidebar now carries the surfaces
 * people work in every day; the things you configure once a quarter live here,
 * grouped by what they are rather than by which release added them.
 *
 * Cards carry a live count only where it is already being fetched for the
 * contracting overview. A hub that fires eight queries to render eight badges
 * is slower than the pages it links to.
 */

type Card = {
  title: string;
  body: string;
  to: string;
  icon: LucideIcon;
  /** Owner/admin only. Hidden rather than shown disabled. */
  adminOnly?: boolean;
};

type Section = { label: string; cards: Card[] };

const SECTIONS: Section[] = [
  {
    label: "People",
    cards: [
      { title: "Team", body: "Agents, managers and staff, their roles and their downline.", to: "/team", icon: Users },
      { title: "Roles & permissions", body: "Who can see and change what, per person.", to: "/agency/team", icon: ShieldCheck, adminOnly: true },
      { title: "Onboarding", body: "Invite a new agent and track their setup to first sale.", to: "/contracting/invite", icon: UserPlus },
      { title: "Leaderboard", body: "Production standings across the agency.", to: "/leaderboard", icon: Trophy },
      { title: "Challenges", body: "Run a contest and track who is winning it.", to: "/challenges", icon: Target },
    ],
  },
  {
    label: "Contracting & licensing",
    cards: [
      { title: "Contracting Operations", body: "Requests, carriers, writing numbers, licensing, hierarchy and Ready to Sell.", to: "/contracting-ops", icon: ClipboardList },
      { title: "Carrier directory", body: "Which carriers you use and how each takes submissions.", to: "/contracting-ops/carriers", icon: Building2 },
      { title: "Compensation", body: "What each carrier pays — levels, and the grids behind them.", to: "/contracting-ops/compensation", icon: Percent },
      { title: "Writing numbers", body: "Every number your producers hold, by carrier and state.", to: "/contracting-ops/writing-numbers", icon: IdCard },
      { title: "Licensing records", body: "PDB reviews, state licences and renewal dates.", to: "/contracting-ops/licensing", icon: FileSignature },
    ],
  },
  {
    label: "Operations",
    cards: [
      { title: "Retention", body: "At-risk policies worked before they lapse.", to: "/retention", icon: Heart },
      { title: "Document intake", body: "Paperwork arriving from agents and carriers.", to: "/intake", icon: UploadCloud },
      { title: "Automations", body: "Work that runs without somebody remembering to do it.", to: "/agency/automations", icon: Bot, adminOnly: true },
      { title: "Emails", body: "What the agency sends, and to whom.", to: "/agency/emails", icon: Mail, adminOnly: true },
      { title: "Reports", body: "Production, placement, persistency and operational health.", to: "/reports", icon: BarChart3 },
      { title: "What people use", body: "Which pages get opened and which never do. Read this before removing anything.", to: "/agency/usage", icon: Activity, adminOnly: true },
    ],
  },
  {
    label: "Agency setup",
    cards: [
      { title: "Agency settings", body: "Name, branding, notifications and defaults.", to: "/agency/settings", icon: Palette, adminOnly: true },
      { title: "Billing", body: "Plan, active users and invoices.", to: "/settings/billing", icon: Wallet, adminOnly: true },
      { title: "White label", body: "Your branding, your colours, your domain.", to: "/white-label", icon: Palette, adminOnly: true },
      { title: "Contracting settings", body: "PDB refresh interval, approval gates and request defaults.", to: "/contracting-ops/settings", icon: ClipboardList, adminOnly: true },
    ],
  },
];

function AgencyAdminPage() {
  const { access } = useMyAccess();
  const overviewFn = useServerFn(getContractingOverview);

  const { data, isLoading } = useQuery({
    queryKey: ["contracting-ops", "overview"],
    queryFn: () => overviewFn(),
  });

  const canManage = Boolean((access as any)?.canManageRoles) || Boolean(access?.isOwner);
  const m = data?.metrics;

  // Only things that actually need somebody today. An "attention" row that is
  // never empty stops being read.
  const attention = [
    { label: "Contracting requests overdue", value: m?.overdue ?? 0, to: "/contracting-ops/queue" },
    { label: "Requests not in good order", value: m?.nigo ?? 0, to: "/contracting-ops/requests" },
    { label: "Agents missing a PDB report", value: m?.missing_pdb ?? 0, to: "/contracting-ops/licensing" },
    { label: "Licences expiring soon", value: m?.expiring_licenses ?? 0, to: "/contracting-ops/licensing" },
    { label: "Hierarchy changes pending", value: m?.pending_hierarchy_changes ?? 0, to: "/contracting-ops/hierarchy-changes" },
  ].filter((a) => a.value > 0);

  return (
    <PageShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Agency Admin</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Everything you run the agency with, in one place. The day-to-day surfaces stay in the
            sidebar; what you set up once lives here.
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="h-20 rounded-xl" />
        ) : attention.length > 0 ? (
          <Panel title="Needs attention">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {attention.map((a) => (
                <Link
                  key={a.label}
                  to={a.to}
                  className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-2/40 px-3 py-2.5 transition-colors hover:border-primary/40"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{a.label}</span>
                  <span className="tnum text-sm font-bold text-foreground">{a.value}</span>
                </Link>
              ))}
            </div>
          </Panel>
        ) : null}

        {SECTIONS.map((section) => {
          const cards = section.cards.filter((c) => !c.adminOnly || canManage);
          if (cards.length === 0) return null;
          return (
            <section key={section.label}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {section.label}
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map((c) => (
                  <Link
                    key={c.to + c.title}
                    to={c.to}
                    className={cn(
                      "group flex items-start gap-3 rounded-xl border border-border bg-card p-4",
                      "transition-colors hover:border-primary/40",
                    )}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <c.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">{c.title}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {c.body}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
