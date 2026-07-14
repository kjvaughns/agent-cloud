import { Bell, Moon, Sun, LogOut, User, Globe, ShieldCheck, Search, FilePlus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { listNotifications } from "@/lib/notifications.functions";
import { OPEN_COMMAND_PALETTE } from "@/components/command-palette";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function TopBar() {
  const { theme, toggle } = useTheme();
  const { user, signOut } = useAuth();
  const { isAdmin, isManager } = useRole();
  const navigate = useNavigate();
  const listFn = useServerFn(listNotifications);

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });

  const items = notifications ?? [];
  const unreadCount = items.filter((n: any) => !n.read).length;

  const firstName = (user?.user_metadata?.full_name || user?.email || "").toString().split(/[ @]/)[0];
  const initials = (user?.user_metadata?.full_name || user?.email || "AC")
    .toString().split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const openPalette = () => window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE));

  return (
    <header className="h-[60px] border-b border-border bg-background/95 backdrop-blur flex items-center px-3 gap-2 sticky top-0 z-30">
      <SidebarTrigger />

      {/* Greeting + date + attention */}
      <div className="min-w-0 hidden sm:block">
        <div className="flex items-center gap-2 leading-tight">
          <span className="font-display font-semibold text-[15px] truncate" style={{ fontFamily: "var(--font-display)" }}>
            {greeting()}{firstName ? `, ${firstName}` : ""}
          </span>
          {unreadCount > 0 && (
            <span className="hidden md:inline-flex items-center gap-1 text-xs text-warning">
              <AlertTriangle className="h-3 w-3" />
              {unreadCount} need{unreadCount === 1 ? "s" : ""} attention
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground leading-none">{today}</div>
      </div>

      <div className="flex-1" />

      {/* ⌘K search trigger */}
      <button
        onClick={openPalette}
        className="hidden md:flex items-center gap-2 h-9 rounded-lg border border-border bg-surface-2 px-3 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors min-w-[200px]"
        aria-label="Search"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="pointer-events-none rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium tnum">⌘K</kbd>
      </button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={openPalette} aria-label="Search">
        <Search className="h-4 w-4" />
      </Button>

      {(isAdmin || isManager) && (
        <Button asChild variant="outline" size="sm" className="hidden lg:inline-flex gap-1.5">
          <Link to="/admin">
            <ShieldCheck className="h-3.5 w-3.5" />
            Admin
          </Link>
        </Button>
      )}

      {/* Notifications */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <Badge className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] rounded-full">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {items.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">No notifications</div>
          ) : (
            items.slice(0, 5).map((n: any) => (
              <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-0.5 py-2">
                <div className="flex w-full items-center justify-between gap-2">
                  <span className={`font-medium text-sm ${!n.read ? "text-foreground" : "text-muted-foreground"}`}>{n.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </span>
                </div>
                {n.description && <span className="text-xs text-muted-foreground">{n.description}</span>}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link to="/notifications">View all</Link></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="icon" onClick={toggle} aria-label="Theme">
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      {/* Primary CTA */}
      <Button asChild size="sm" className="hidden sm:inline-flex gap-1.5">
        <Link to="/post-deal"><FilePlus className="h-4 w-4" /> Post a Deal</Link>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full">
            <Avatar className="h-7 w-7"><AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback></Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link to="/account/producer-profile"><User className="h-4 w-4 mr-2" /> Producer Profile</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/account/my-landing-page"><Globe className="h-4 w-4 mr-2" /> My Landing Page</Link></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={async () => { await signOut(); navigate({ to: "/login" }); }}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
