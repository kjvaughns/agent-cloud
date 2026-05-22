import { Bell, Moon, Phone, Sun, MessageSquare, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { Link, useNavigate } from "@tanstack/react-router";

export function TopBar() {
  const { theme, toggle } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const initials = (user?.user_metadata?.full_name || user?.email || "AC")
    .toString().split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="h-12 border-b bg-card flex items-center px-2 gap-1 sticky top-0 z-30">
      <SidebarTrigger />
      <div className="flex-1" />
      <Button variant="ghost" size="icon" aria-label="Phone" asChild><Link to="/phone"><Phone className="h-4 w-4" /></Link></Button>
      <Button variant="ghost" size="icon" aria-label="SMS" asChild><Link to="/phone"><MessageSquare className="h-4 w-4" /></Link></Button>
      <Button variant="ghost" size="icon" aria-label="Notifications" asChild>
        <Link to="/notifications"><Bell className="h-4 w-4" /></Link>
      </Button>

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
          <DropdownMenuItem><User className="h-4 w-4 mr-2" /> Profile</DropdownMenuItem>
          <DropdownMenuItem onClick={async () => { await signOut(); navigate({ to: "/login" }); }}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
