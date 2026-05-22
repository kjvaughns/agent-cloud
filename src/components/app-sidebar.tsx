import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, KanbanSquare, Calendar, Phone, Sparkles, Users,
  BookOpen, BarChart3, Wallet, FileSignature, FolderOpen, Briefcase,
  Megaphone, Newspaper, Bell, FilePlus, Cloud,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";

const groups = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Notifications", url: "/notifications", icon: Bell },
      { title: "Announcements", url: "/announcements", icon: Megaphone },
      { title: "News Feed", url: "/news-feed", icon: Newspaper },
    ],
  },
  {
    label: "Workspace",
    items: [
      { title: "Post a Deal", url: "/post-deal", icon: FilePlus },
      { title: "Pipeline", url: "/pipeline", icon: KanbanSquare },
      { title: "Calendar", url: "/calendar", icon: Calendar },
      { title: "Phone & SMS", url: "/phone", icon: Phone },
      { title: "AI Assistant", url: "/ai-assistant", icon: Sparkles },
      { title: "Team", url: "/team", icon: Users },
    ],
  },
  {
    label: "My Business",
    items: [
      { title: "Book of Business", url: "/book-of-business", icon: BookOpen },
      { title: "Analytics", url: "/analytics", icon: BarChart3 },
      { title: "Finances", url: "/finances", icon: Wallet },
    ],
  },
  {
    label: "Contracting",
    items: [
      { title: "Contracting", url: "/contracting", icon: FileSignature },
    ],
  },
  {
    label: "Resources",
    items: [
      { title: "Resources", url: "/resources/scripts", icon: FolderOpen },
    ],
  },
  {
    label: "Back Office",
    items: [
      { title: "Back Office", url: "/back-office/recruiting-tracker", icon: Briefcase },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="h-8 w-8 shrink-0 rounded-lg bg-primary grid place-items-center text-primary-foreground">
            <Cloud className="h-4 w-4" />
          </div>
          {!collapsed && <span className="font-bold tracking-tight">Agent Cloud</span>}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g) => (
          <SidebarGroup key={g.label}>
            {!collapsed && <SidebarGroupLabel>{g.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((it) => {
                  const active = path === it.url || path.startsWith(it.url + "/");
                  return (
                    <SidebarMenuItem key={it.url}>
                      <SidebarMenuButton asChild isActive={active} tooltip={it.title}>
                        <Link to={it.url}>
                          <it.icon className="h-4 w-4" />
                          <span>{it.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
