import { requireSession } from "@/lib/require-session";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, FileSignature, Building2, Percent,
  LifeBuoy, Settings, BarChart3, Bell, ChevronRight, Cloud,
  ArrowLeftRight, ShieldCheck, GitMerge, Menu, X, Upload, Download, CreditCard, Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export const Route = createFileRoute("/admin")({
  ssr: false,
  /**
   * Agent Cloud staff, not an agency.
   *
   * This allowed `agency_owner`, `admin` and `manager` in, which meant
   * promoting somebody to Manager inside an agency handed them the platform
   * operator's portal — the shared carrier catalogue, the default commission
   * grids, every tenant's support tickets, the database migration runner. An
   * ordinary promotion was a privilege escalation.
   *
   * `admin.functions.ts` already worked this out and wrote it down:
   * "`admin` and `agency_owner` are agency-level roles in this schema —
   * is_org_admin() grants on both — so requireAdmin is 'runs *an* agency', not
   * 'runs Agent Cloud'." Its `requirePlatformAdmin` asks the narrow question.
   * The route guard was still asking the wide one.
   *
   * `super_admin` is the only role that means this platform. `.limit(1)`
   * rather than `.maybeSingle()` because a user legitimately holds several
   * roles and maybeSingle() errors on more than one row.
   */
  beforeLoad: async () => {
    const session = await requireSession();
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "super_admin")
      .limit(1);
    if (!roleRows?.length) throw redirect({ to: "/dashboard" });
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
  { title: "DB Migrations",    url: "/admin/migrations",   icon: Database },
  { title: "Book Import", url: "/admin/csv-import",   icon: Upload },
  { title: "Import Requests",  url: "/admin/import-requests", icon: Download },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  return (
    <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
      {adminNav.map((item) => {
        const active = path === item.url || (item.url !== "/admin" && path.startsWith(item.url + "/"));
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
