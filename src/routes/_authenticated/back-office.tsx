import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/back-office")({
  component: BackOfficeLayout,
});

const TABS = [
  { label: "Recruiting Tracker", url: "/back-office/recruiting-tracker" },
  { label: "Licensing", url: "/back-office/licensing" },
  { label: "Compliance", url: "/back-office/compliance" },
  { label: "Support Tickets", url: "/back-office/support" },
];

function BackOfficeLayout() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Briefcase className="h-7 w-7" /> Back Office</h1>
        <p className="text-muted-foreground mt-1">Operations, licensing, compliance, and support.</p>
      </div>
      <div className="border-b flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
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
