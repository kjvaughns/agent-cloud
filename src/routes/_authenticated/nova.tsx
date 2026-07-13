import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sophai")({
  component: SophaiLayout,
});

const TABS = [
  { label: "Settings", url: "/sophai/settings" },
  { label: "Activity", url: "/sophai/activity" },
];

function SophaiLayout() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Shield className="h-7 w-7 text-primary" /> Sophai</h1>
        <p className="text-muted-foreground mt-1">Your AI sales assistant: policy recovery, follow-ups, and engagement.</p>
      </div>
      <div className="border-b flex gap-1">
        {TABS.map((t) => (
          <Link key={t.url} to={t.url} className={cn(
            "px-4 py-2 text-sm border-b-2 -mb-px transition-colors",
            path === t.url ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
          )}>{t.label}</Link>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
