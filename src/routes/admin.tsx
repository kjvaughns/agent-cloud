import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, FileSignature, Building2, Percent,
  LifeBuoy, Settings, BarChart3, Bell, ChevronRight, Cloud,
  ArrowLeftRight, ShieldCheck, GitMerge,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.session.user.id)
      .in("role", ["admin", "manager"])
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
  { title: "Settings",         url: "/admin/settings",     icon: Settings },
  { title: "Migration",        url: "/admin/migration",    icon: GitMerge },
];

function AdminLayout() {
  const path = useRouterState({ select: (r) => r.location.pathname });

  return (
    <div className="min-h-screen flex bg-[#0a0a0a]">
      <aside className="w-60 shrink-0 border-r border-white/10 flex flex-col">
        <div className="h-14 flex items-center gap-2 px-4 border-b border-white/10">
          <Cloud className="h-5 w-5 text-[#C9A227]" />
          <span className="font-bold text-white tracking-tight">Agent Cloud</span>
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-widest text-[#C9A227] bg-[#C9A227]/10 px-2 py-0.5 rounded">Admin</span>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {adminNav.map((item) => {
            const active = path === item.url || (item.url !== "/admin" && path.startsWith(item.url));
            return (
              <Link
                key={item.url}
                to={item.url}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-[#C9A227]/15 text-[#C9A227] font-medium"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.title}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/10">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
            Back to Agent View
          </Link>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 bg-background">
        <Outlet />
      </div>
    </div>
  );
}
