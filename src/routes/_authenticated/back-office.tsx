import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Briefcase, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/back-office")({
  component: BackOfficeLayout,
});

const ADVANCED_MARKET_TABS = [
  { label: "Case Design", url: "/back-office/case-design" },
  { label: "Advanced Desk", url: "/back-office/advanced-desk" },
];

const MARKETING_TABS = [
  { label: "Recruiting Funnels", url: "/back-office/recruiting-funnels" },
  { label: "Client Marketing", url: "/back-office/client-marketing" },
  { label: "Marketing Tracker", url: "/back-office/marketing-tracker" },
];

function BackOfficeLayout() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const isMarketing = MARKETING_TABS.some((t) => path.startsWith(t.url));
  const tabs = isMarketing ? MARKETING_TABS : ADVANCED_MARKET_TABS;
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
