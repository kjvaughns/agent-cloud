import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/contracting")({
  component: ContractingLayout,
});

const TABS = [
  { to: "/contracting", label: "My Contracts" },
  { to: "/contracting/invite", label: "Invite Agent" },
  { to: "/contracting/transfers", label: "Transfers" },
  { to: "/contracting/commission-grids", label: "Commission Grids" },
  { to: "/contracting/annuity-training", label: "Annuity Training" },
  { to: "/contracting/carriers", label: "Carriers" },
];

function ContractingLayout() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  return (
    <div className="flex flex-col">
      <div className="border-b bg-card px-6 pt-5">
        <h1 className="text-2xl font-bold tracking-tight">Contracting</h1>
        <p className="text-sm text-muted-foreground">Carrier appointments, agent invites, commissions and training.</p>
        <div className="flex gap-1 mt-4 overflow-x-auto">
          {TABS.map((t) => {
            const active = path === t.to;
            return (
              <Link key={t.to} to={t.to} className={cn(
                "px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              )}>{t.label}</Link>
            );
          })}
        </div>
      </div>
      <Outlet />
    </div>
  );
}
