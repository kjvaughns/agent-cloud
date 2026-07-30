import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useRole } from "@/hooks/use-role";
import { useMyAccess, canSeeNavItem } from "@/hooks/use-my-access";
import { useOrganization } from "@/hooks/use-organization";
import { BrandLogo } from "@/components/brand-logo";
import {
  LayoutDashboard, KanbanSquare, Calendar, Phone, Sparkles, Users,
  BookOpen, BarChart3, Wallet, FileSignature, FolderOpen,
  Megaphone, Newspaper, Bell, FilePlus, UserPlus, ArrowLeftRight,
  Percent, GraduationCap, Building2, BookText, ScrollText, IdCard,
  Library, Briefcase as BriefcaseIcon, ClipboardList, Globe, Megaphone as MegaIcon,
  Target, Calculator, Wrench, PhoneIncoming, LifeBuoy, HelpCircle,
  ChevronDown, Briefcase, Trophy, ShieldCheck, Heart, UploadCloud, Settings, Bot,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarSeparator, useSidebar,
} from "@/components/ui/sidebar";

import { audienceFor, navFor, ACCOUNT_PAGES, type Page } from "@/lib/navigation";

type NavItem = { title: string; url: string; icon: React.ComponentType<{ className?: string }>; external?: boolean };

const asNavItem = (p: Page): NavItem => ({ title: p.label, url: p.path, icon: p.icon });

export function AppSidebar() {
  const { state } = useSidebar();
  const sidebarCollapsed = state === "collapsed";
  const { isAdmin, isManager, isAgencyOwner } = useRole();
  const { access } = useMyAccess();
  const { org } = useOrganization();
  const path = useRouterState({ select: (r) => r.location.pathname });

  // The sidebar is composed for this person rather than filtered from one
  // shared menu. A solo agent gets a five-item product, not the agency product
  // with twenty-six things missing.
  const audience = audienceFor({
    role: access?.role ?? null,
    isSolo: Boolean(access?.isSolo),
    isOwner: Boolean(access?.isOwner),
    canManage: Boolean((access as any)?.canManageRoles),
  });
  const groups = navFor(audience, (access?.permissions ?? {}) as Record<string, unknown>)
    .map((g, i) => ({ label: g.label || (i === 0 ? "" : "More"), items: g.items.map(asNavItem) }));
  const accountItems = ACCOUNT_PAGES.map(asNavItem);

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("nav-groups") ?? "null") ?? {};
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

  const renderItem = (it: NavItem) => {
    const active = !it.external && (path === it.url || (it.url !== "/contracting" && path.startsWith(it.url + "/")));
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
          {it.external ? (
            <a href={it.url} target="_blank" rel="noopener noreferrer">
              <it.icon className="h-4 w-4" />
              <span>{it.title}</span>
            </a>
          ) : (
            <Link to={it.url}>
              <it.icon className="h-4 w-4" />
              <span>{it.title}</span>
            </Link>
          )}
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
            <BrandLogo size={32} />
          )}
          {!sidebarCollapsed && (() => {
            const isAgency = !!org?.slug && org.slug !== "apex";
            const bigName = isAgency ? org!.name : "Agent Cloud";
            const smallLine = "by Agent Cloud";
            return (
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-sidebar-foreground leading-tight"
                  style={{ fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "-0.02em", fontSize: "1.05rem" }}
                >
                  {bigName}
                </div>
                <div className="text-[10px] text-sidebar-foreground/50 leading-none mt-0.5 tracking-wide uppercase truncate">
                  {smallLine}
                </div>
              </div>
            );
          })()}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g, gi) => (
          <SidebarGroup key={g.label || `group-${gi}`}>
            {!sidebarCollapsed && g.label && (
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
                <SidebarMenu>{g.items.filter((it) => it.external || canSeeNavItem(it.url, access)).map(renderItem)}</SidebarMenu>
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        ))}

        <SidebarSeparator />

        <SidebarGroup>
          {!sidebarCollapsed && <SidebarGroupLabel>Account</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>{accountItems.filter((it) => canSeeNavItem(it.url, access)).map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Admin Portal" className="text-primary hover:text-primary hover:bg-primary/10">
                      <Link to="/admin">
                        <ShieldCheck className="h-4 w-4" />
                        <span>Admin Portal</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
