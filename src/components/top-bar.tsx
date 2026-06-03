import { Bell, Moon, Phone, Sun, MessageSquare, LogOut, User, Globe } from "lucide-react";
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
import { Link, useNavigate } from "@tanstack/react-router";

const NOTIFICATIONS = [
  { title: "Policy effective tomorrow", desc: "Maria Lopez · Mutual of Omaha", time: "2h" },
  { title: "Lapse pending", desc: "James Carter · Foresters · follow up", time: "5h" },
  { title: "New contract active", desc: "American Amicable issued writing #AA-4821", time: "1d" },
];

export function TopBar() {
  const { theme, toggle } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const initials = (user?.user_metadata?.full_name || user?.email || "AC")
    .toString().split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="h-12 border-b border-border bg-background flex items-center px-2 gap-1 sticky top-0 z-30">
      <SidebarTrigger />
      <div className="flex-1" />

      <Button variant="ghost" size="icon" aria-label="Phone" asChild><Link to="/phone" search={{ tab: "phone" }}><Phone className="h-4 w-4" /></Link></Button>
      <Button variant="ghost" size="icon" aria-label="SMS" asChild><Link to="/phone" search={{ tab: "sms" }}><MessageSquare className="h-4 w-4" /></Link></Button>

      {/* Notifications */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
            <Bell className="h-4 w-4" />
            <Badge className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] rounded-full">{NOTIFICATIONS.length}</Badge>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {NOTIFICATIONS.map((n, i) => (
            <DropdownMenuItem key={i} className="flex flex-col items-start gap-0.5 py-2">
              <div className="flex w-full items-center justify-between">
                <span className="font-medium text-sm">{n.title}</span>
                <span className="text-xs text-muted-foreground">{n.time}</span>
              </div>
              <span className="text-xs text-muted-foreground">{n.desc}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link to="/notifications">View all</Link></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="icon" onClick={toggle} aria-label="Theme">
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
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
