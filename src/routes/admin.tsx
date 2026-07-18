import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, FileSignature, Building2, Percent,
  LifeBuoy, Settings, BarChart3, Bell, ChevronRight, Cloud,
  ArrowLeftRight, ShieldCheck, GitMerge, Menu, X, Upload, Download, CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.session.user.id)
      .in("role", ["super_admin", "agency_owner", "admin", "manager"])
      .maybeSingle();
    if (!roleRow) throw redirect({ to: "/dashboard" });
  },
  component: AdminLayout,
});

const adminNav = [
  { title: "Overview",         url: "/admin",              icon: LayoutDashboard },
  { title: "Agents",           url: "/admin/agents",       icon: Users },
  { title: "Contracts",        url: "/admin/contracts",    icon: FileSignature },
  { title: "Commission Grids", url: "/admin/commissions",  icon: Percent },
  { title: "Carriers",         url: "/admin/carriers",     icon: Building2 },
  { title: "Support Tickets",  url: "/admin/support",      icon: LifeBuoy },
  { title: "Announcements",    url: "/admin/announcements", icon: Bell },
  { title: "Analytics",        url: "/admin/analytics",    icon: BarChart3 },
  { title: "Hierarchy",        url: "/admin/hierarchy",    icon: ArrowLeftRight },
  { title: "Roles",            url: "/admin/roles",        icon: ShieldCheck },
  { title: "Subscriptions",    url: "/admin/subscriptions", icon: CreditCard },
  { title: "Settings",         url: "/admin/settings",     icon: Settings },
  { title: "Migration",        url: "/admin/migration",    icon: GitMerge },
  { title: "AgentLink Import", url: "/admin/csv-import",   icon: Upload },
  { title: "Import Requests",  url: "/admin/import-requests", icon: Download },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  return (
    <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
      {adminNav.map((item) => {
        const active = path === item.url || (item.url !== "/admin" && path.startsWith(item.url));
        return (
          <Link
            key={item.url}
            to={item.url}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
              active
                ? "bg-gold-glow text-gold-bright font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-2"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.title}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarHeader() {
  return (
    <div className="h-14 flex items-center gap-2 px-4 border-b border-border shrink-0">
      <Cloud className="h-5 w-5 text-primary" />
      <span className="font-bold tracking-tight">Agent Cloud</span>
      <span className="ml-auto text-[10px] font-semibold uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded">Admin</span>
    </div>
  );
}

function BackLink({ onClick }: { onClick?: () => void }) {
  return (
    <div className="p-3 border-t border-border shrink-0">
      <Link
        to="/dashboard"
        onClick={onClick}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
      >
        <ChevronRight className="h-4 w-4 rotate-180" />
        Back to Agent View
      </Link>
    </div>
  );
}

function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-card">
      {/* Desktop sidebar */}
      <aside className="w-60 shrink-0 border-r border-border hidden md:flex flex-col">
        <SidebarHeader />
        <NavItems />
        <BackLink />
      </aside>

      {/* Mobile sheet drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64 bg-card border-r border-border flex flex-col">
          <SidebarHeader />
          <NavItems onNavigate={() => setMobileOpen(false)} />
          <BackLink onClick={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 h-14 px-4 border-b border-border bg-background sticky top-0 z-30">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            className="shrink-0"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-primary" />
            <span className="font-bold text-sm">Agent Cloud</span>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-primary bg-primary/10 px-1.5 py-0.5 rounded">Admin</span>
          </div>
        </div>

        <Outlet />
      </div>
    </div>
  );
}
