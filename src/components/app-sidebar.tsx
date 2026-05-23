import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, KanbanSquare, Calendar, Phone, Sparkles, Users,
  BookOpen, BarChart3, Wallet, FileSignature, FolderOpen, Briefcase,
  Megaphone, Newspaper, Bell, FilePlus, Cloud, UserPlus, ArrowLeftRight,
  Percent, GraduationCap, Building2, BookText, ScrollText, IdCard,
  Library, Briefcase as BriefcaseIcon, ClipboardList, Globe, Megaphone as MegaIcon,
  Shield, Activity, Target, Calculator, Quote, PhoneIncoming, LifeBuoy, HelpCircle,
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
      { title: "Sophai Settings", url: "/sophai/settings", icon: Shield },
      { title: "Sophai Activity", url: "/sophai/activity", icon: Activity },
    ],
  },
  {
    label: "My Business",
    items: [
      { title: "Team", url: "/team", icon: Users },
      { title: "Book of Business", url: "/book-of-business", icon: BookOpen },
      { title: "Analytics", url: "/analytics", icon: BarChart3 },
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
      { title: "Quoter", url: "/tools/quoter", icon: Quote },
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
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });

  const renderItem = (it: { title: string; url: string; icon: React.ComponentType<{ className?: string }> }) => {
    const active = path === it.url || (it.url !== "/contracting" && path.startsWith(it.url + "/"));
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
  };

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
              <SidebarMenu>{g.items.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarSeparator />

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Account</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{accountItems.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
