import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem,
} from "@/components/ui/command";
import {
  LayoutDashboard, KanbanSquare, FilePlus, Calendar, Phone, Sparkles,
  BookOpen, Wallet, Percent, BarChart3, Trophy, Target,
  Users, UserPlus, FileSignature, ArrowLeftRight, Building2, GraduationCap,
  Bell, Megaphone, Newspaper, IdCard, Globe,
} from "lucide-react";

export const OPEN_COMMAND_PALETTE = "open-command-palette";

type Cmd = { title: string; url: string; icon: React.ComponentType<{ className?: string }>; group: string };

const COMMANDS: Cmd[] = [
  { group: "Workspace", title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { group: "Workspace", title: "Pipeline", url: "/pipeline", icon: KanbanSquare },
  { group: "Workspace", title: "Post a Deal", url: "/post-deal", icon: FilePlus },
  { group: "Workspace", title: "Calendar", url: "/calendar", icon: Calendar },
  { group: "Workspace", title: "My Phone", url: "/phone", icon: Phone },
  { group: "Workspace", title: "Nova AI", url: "/ai-assistant", icon: Sparkles },
  { group: "Business", title: "Book of Business", url: "/book-of-business", icon: BookOpen },
  { group: "Business", title: "Finances", url: "/finances", icon: Wallet },
  { group: "Business", title: "Commission Grids", url: "/contracting/commission-grids", icon: Percent },
  { group: "Business", title: "Analytics", url: "/analytics", icon: BarChart3 },
  { group: "Business", title: "Leaderboard", url: "/leaderboard", icon: Trophy },
  { group: "Business", title: "Challenges", url: "/challenges", icon: Target },
  { group: "Agency", title: "Team", url: "/team", icon: Users },
  { group: "Agency", title: "Invite Agent", url: "/contracting/invite", icon: UserPlus },
  { group: "Agency", title: "My Contracts", url: "/contracting", icon: FileSignature },
  { group: "Agency", title: "Transfer Requests", url: "/contracting/transfers", icon: ArrowLeftRight },
  { group: "Agency", title: "Carriers", url: "/contracting/carriers", icon: Building2 },
  { group: "Agency", title: "Annuity Training", url: "/contracting/annuity-training", icon: GraduationCap },
  { group: "Updates", title: "Notifications", url: "/notifications", icon: Bell },
  { group: "Updates", title: "Announcements", url: "/announcements", icon: Megaphone },
  { group: "Updates", title: "News Feed", url: "/news-feed", icon: Newspaper },
  { group: "Account", title: "Producer Profile", url: "/account/producer-profile", icon: IdCard },
  { group: "Account", title: "My Landing Page", url: "/account/my-landing-page", icon: Globe },
];

const GROUP_ORDER = ["Workspace", "Business", "Agency", "Updates", "Account"];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_COMMAND_PALETTE, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_COMMAND_PALETTE, onOpen);
    };
  }, []);

  const go = (url: string) => {
    setOpen(false);
    navigate({ to: url as string });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, jump anywhere…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {GROUP_ORDER.map((group) => (
          <CommandGroup key={group} heading={group}>
            {COMMANDS.filter((c) => c.group === group).map((c) => (
              <CommandItem key={c.url} value={`${c.title} ${c.group}`} onSelect={() => go(c.url)}>
                <c.icon className="h-4 w-4 text-muted-foreground" />
                <span>{c.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
