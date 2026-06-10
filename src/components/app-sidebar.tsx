import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useRole } from "@/hooks/use-role";
import { useOrganization } from "@/hooks/use-organization";
import {
  LayoutDashboard, KanbanSquare, Calendar, Phone, Sparkles, Users,
  BookOpen, BarChart3, Wallet, FileSignature, FolderOpen,
  Megaphone, Newspaper, Bell, FilePlus, Cloud, UserPlus, ArrowLeftRight,
  Percent, GraduationCap, Building2, BookText, ScrollText, IdCard,
  Library, Briefcase as BriefcaseIcon, ClipboardList, Globe, Megaphone as MegaIcon,
  Target, Calculator, Wrench, PhoneIncoming, LifeBuoy, HelpCircle,
  ChevronDown, Briefcase, Trophy, ShieldCheck,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarSeparator, useSidebar,
} from "@/components/ui/sidebar";

const groups = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Notifications", url: "/notifications", icon: Bell },
      { title: "Announcements", url: "/announcements", icon: Megaphone },
      { title: "News Feed", url: "/news-feed", icon: Newspaper },
      { title: "Post a Deal", url: "/post-deal", icon: FilePlus },
    ],
  },
  {
    label: "Workspace",
    items: [
      { title: "Pipeline", url: "/pipeline", icon: KanbanSquare },
      { title: "Calendar", url: "/calendar", icon: Calendar },
      { title: "My Phone", url: "/phone", icon: Phone },
      { title: "AI Assistant", url: "/ai-assistant", icon: Sparkles },
    ],
  },
  {
    label: "My Business",
    items: [
      { title: "Team", url: "/team", icon: Users },
      { title: "Book of Business", url: "/book-of-business", icon: BookOpen },
      { title: "Business Analytics", url: "/analytics", icon: BarChart3 },
      { title: "Leaderboard", url: "/leaderboard", icon: Trophy },
      { title: "Finances", url: "/finances", icon: Wallet },
      { title: "Challenges", url: "/challenges", icon: Target },
    ],
  },
  {
    label: "Contracting",
    items: [
      { title: "My Contracts", url: "/contracting", icon: FileSignature },
      { title: "Invite Agent", url: "/contracting/invite", icon: UserPlus },
      { title: "Transfer Requests", url: "/contracting/transfers", icon: ArrowLeftRight },
      { title: "Commission Grids", url: "/contracting/commission-grids", icon: Percent },
      { title: "Annuity Training", url: "/contracting/annuity-training", icon: GraduationCap },
      { title: "Carriers", url: "/contracting/carriers", icon: Building2 },
    ],
  },
  {
    label: "Resources",
    items: [
      { title: "New Agent Guide", url: "/resources/new-agent-guide", icon: BookText },
      { title: "Agent Handbook", url: "/resources/agent-handbook", icon: Library },
      { title: "Scripts", url: "/resources/scripts", icon: ScrollText },
      { title: "State Licenses", url: "/resources/state-licenses", icon: IdCard },
      { title: "Agent Academy", url: "/resources/agent-academy", icon: GraduationCap },
    ],
  },
  {
    label: "Back Office",
    items: [
      { title: "Case Design", url: "/back-office/case-design", icon: ClipboardList },
      { title: "Advanced Desk", url: "/back-office/advanced-desk", icon: BriefcaseIcon },
      { title: "Recruiting Funnels", url: "/back-office/recruiting-funnels", icon: Globe },
      { title: "Recruiting Tracker", url: "/back-office/recruiting-tracker", icon: Briefcase },
      { title: "Client Marketing", url: "/back-office/client-marketing", icon: MegaIcon },
    ],
  },
  {
    label: "Tools",
    items: [
      { title: "Needs Analysis", url: "/tools/needs-analysis", icon: Calculator },
      { title: "Toolkits", url: "/tools/quoter", icon: Wrench },
      { title: "Leads", url: "/tools/leads", icon: Target },
      { title: "Inbound Calls", url: "/tools/inbound-calls", icon: PhoneIncoming },
    ],
  },
];

const accountItems = [
  { title: "Help Center", url: "/account/help", icon: LifeBuoy },
  { title: "FAQ", url: "/account/faq", icon: HelpCircle },
  { title: "Producer Profile", url: "/account/producer-profile", icon: IdCard },
  { title: "My Landing Page", url: "/account/my-landing-page", icon: Globe },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const sidebarCollapsed = state === "collapsed";
  const { isAdmin, isManager, isAgencyOwner } = useRole();
  const { org } = useOrganization();
  const path = useRouterState({ select: (r) => r.location.pathname });

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("nav-groups") ?? "{}");
    } catch {
      return {};
    }
  });

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      localStorage.setItem("nav-groups", JSON.stringify(next));
      return next;
    });
  };

  const renderItem = (it: { title: string; url: string; icon: React.ComponentType<{ className?: string }> }) => {
    const active = path === it.url || (it.url !== "/contracting" && path.startsWith(it.url + "/"));
    return (
      <SidebarMenuItem key={it.url}>
        <SidebarMenuButton
          asChild
          isActive={active}
          tooltip={it.title}
          className={cn(
            "data-[active=true]:bg-primary/12 data-[active=true]:text-foreground data-[active=true]:font-semibold",
            "data-[active=true]:relative data-[active=true]:before:absolute data-[active=true]:before:left-0",
            "data-[active=true]:before:top-1.5 data-[active=true]:before:bottom-1.5 data-[active=true]:before:w-[3px]",
            "data-[active=true]:before:rounded-r data-[active=true]:before:bg-primary",
            "[&[data-active=true]_svg]:text-primary transition-colors",
          )}
        >
          <Link to={it.url}>
            <it.icon className="h-4 w-4" />
            <span>{it.title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="h-screen">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 px-2 py-2.5">
          {org?.logo_url ? (
            <img
              src={org.logo_url}
              alt={org.name}
              className="h-8 w-8 shrink-0 rounded-lg object-contain border border-border"
            />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded-lg bg-primary grid place-items-center text-primary-foreground shadow-sm">
              <Cloud className="h-4 w-4" />
            </div>
          )}
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <div
                className="font-bold truncate text-sidebar-foreground leading-tight"
                style={{ fontFamily: "var(--font-heading, 'Bebas Neue', sans-serif)", letterSpacing: "0.05em", fontSize: "1.1rem" }}
              >
                {org?.name ?? "Agent Cloud"}
              </div>
              {org?.tagline ? (
                <div className="text-[10px] text-muted-foreground truncate leading-tight">{org.tagline}</div>
              ) : (
                <div className="text-[10px] text-sidebar-foreground/50 leading-none mt-0.5 tracking-wide uppercase">by APEX</div>
              )}
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g) => (
          <SidebarGroup key={g.label}>
            {!sidebarCollapsed && (
              <SidebarGroupLabel
                className="flex items-center justify-between cursor-pointer select-none hover:text-foreground transition-colors"
                onClick={() => toggleGroup(g.label)}
              >
                {g.label}
                <ChevronDown
                  className={cn(
                    "h-3 w-3 transition-transform duration-200",
                    collapsedGroups[g.label] && "-rotate-90",
                  )}
                />
              </SidebarGroupLabel>
            )}
            {(!collapsedGroups[g.label] || sidebarCollapsed) && (
              <SidebarGroupContent>
                <SidebarMenu>{g.items.map(renderItem)}</SidebarMenu>
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        ))}

        <SidebarSeparator />

        <SidebarGroup>
          {!sidebarCollapsed && <SidebarGroupLabel>Account</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{accountItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {(isAdmin || isManager) && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Admin Portal" className="text-[#C9A227] hover:text-[#C9A227] hover:bg-[#C9A227]/10">
                      <Link to="/admin">
                        <ShieldCheck className="h-4 w-4" />
                        <span>Admin Portal</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {isAgencyOwner && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild tooltip="Agency Settings">
                        <Link to={"/back-office/organization" as any}>
                          <Building2 className="h-4 w-4" />
                          <span>Agency Settings</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
