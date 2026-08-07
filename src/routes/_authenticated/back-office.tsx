import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Briefcase, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMyAccess } from "@/hooks/use-my-access";

export const Route = createFileRoute("/_authenticated/back-office")({
  component: BackOfficeLayout,
});

/**
 * `adminOnly` marks a tab whose route refuses non-administrators.
 *
 * This shell is not all one access level, which is why it has no guard of its
 * own: Client Marketing is offered to every agency member under Tools, while
 * Recruiting Funnels is `agency-admin` + `mgr_access_recruiting` in the nav.
 * Guarding the shell would have locked ordinary agents out of a page they are
 * meant to have. So the tabs hide individually and each route refuses on its
 * own — see require-agency-admin.tsx.
 */
const ADVANCED_MARKET_TABS = [
  { label: "Case Design", url: "/back-office/case-design", adminOnly: true },
  { label: "Advanced Desk", url: "/back-office/advanced-desk", adminOnly: true },
];

const MARKETING_TABS = [
  { label: "Recruiting Funnels", url: "/back-office/recruiting-funnels", adminOnly: true },
  { label: "Client Marketing", url: "/back-office/client-marketing" },
  { label: "Marketing Tracker", url: "/back-office/marketing-tracker" },
];

function BackOfficeLayout() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { access } = useMyAccess();
  const isAdmin =
    Boolean(access?.canSeeAgency) ||
    Boolean((access?.permissions as any)?.mgr_access_recruiting);

  const isMarketing = MARKETING_TABS.some((t) => path.startsWith(t.url));
  const all = isMarketing ? MARKETING_TABS : ADVANCED_MARKET_TABS;
  // Offering a tab that answers with a refusal is worse than not offering it.
  const tabs = all.filter((t) => !t.adminOnly || isAdmin);
  const title = isMarketing ? "Marketing" : "Advanced Market";
  const subtitle = isMarketing
    ? "Recruiting funnels, client marketing, and pipeline trackers."
    : "Case design and the advanced concierge desk.";
  const Icon = isMarketing ? Megaphone : Briefcase;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Icon className="h-7 w-7" /> {title}</h1>
        <p className="text-muted-foreground mt-1">{subtitle}</p>
      </div>
      <div className="border-b flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <Link key={t.url} to={t.url} className={cn(
            "px-4 py-2 text-sm border-b-2 -mb-px transition-colors whitespace-nowrap",
            path === t.url ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
          )}>{t.label}</Link>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
