import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/resources")({
  component: ResourcesLayout,
});

const TABS = [
  { label: "New Agent Guide", url: "/resources/new-agent-guide" },
  { label: "Agent Handbook", url: "/resources/agent-handbook" },
  { label: "Scripts", url: "/resources/scripts" },
  { label: "State Licenses", url: "/resources/state-licenses" },
  { label: "Agent Academy", url: "/resources/agent-academy" },
];

function ResourcesLayout() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><FolderOpen className="h-7 w-7" /> Resources</h1>
        <p className="text-muted-foreground mt-1">Guides, scripts, licensing, and Agent Academy.</p>
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
