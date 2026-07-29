import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { globalSearch, type SearchHit } from "@/lib/search.functions";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem,
} from "@/components/ui/command";
import {
  LayoutDashboard, KanbanSquare, FilePlus, Calendar, Phone, Sparkles,
  BookOpen, Wallet, Percent, BarChart3, Trophy, Target,
  Users, UserPlus, FileSignature, ArrowLeftRight, Building2, GraduationCap,
  Bell, Megaphone, Newspaper, IdCard, Globe,
  User, FileText, Briefcase, UserSearch, Loader2, ListTodo,
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
  { group: "Workspace", title: "Tasks", url: "/tasks", icon: ListTodo },
  { group: "Business", title: "Book of Business", url: "/book-of-business", icon: BookOpen },
  { group: "Business", title: "Finances", url: "/finances", icon: Wallet },
  { group: "Business", title: "Comp Grids", url: "/contracting", icon: Percent },
  { group: "Business", title: "Analytics", url: "/analytics", icon: BarChart3 },
  { group: "Business", title: "Leaderboard", url: "/leaderboard", icon: Trophy },
  { group: "Business", title: "Challenges", url: "/challenges", icon: Target },
  { group: "Agency", title: "Team", url: "/team", icon: Users },
  { group: "Agency", title: "Invite Agent", url: "/contracting/invite", icon: UserPlus },
  { group: "Agency", title: "Contracts", url: "/contracting", icon: FileSignature },
  { group: "Agency", title: "Carriers", url: "/contracting/carriers", icon: Building2 },
  { group: "Updates", title: "Notifications", url: "/notifications", icon: Bell },
  { group: "Updates", title: "Announcements", url: "/announcements", icon: Megaphone },
  { group: "Updates", title: "News Feed", url: "/news-feed", icon: Newspaper },
  { group: "Account", title: "Producer Profile", url: "/account/producer-profile", icon: IdCard },
  { group: "Account", title: "My Landing Page", url: "/account/my-landing-page", icon: Globe },
];

const GROUP_ORDER = ["Workspace", "Business", "Agency", "Updates", "Account"];

const HIT_ICON: Record<SearchHit["type"], React.ComponentType<{ className?: string }>> = {
  client: User,
  policy: FileText,
  agent: Briefcase,
  prospect: UserSearch,
};

const HIT_GROUP: Record<SearchHit["type"], string> = {
  client: "Clients",
  policy: "Policies",
  agent: "Agents",
  prospect: "Prospects",
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const navigate = useNavigate();
  const searchFn = useServerFn(globalSearch);

  // Debounce so a query only fires once typing settles.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 220);
    return () => clearTimeout(t);
  }, [term]);

  const records = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () => searchFn({ data: { q: debounced } }),
    enabled: open && debounced.length >= 2,
    staleTime: 30_000,
  });

  // Reset the term when the palette closes so it opens clean.
  useEffect(() => { if (!open) { setTerm(""); setDebounced(""); } }, [open]);

  const hits = records.data?.hits ?? [];
  const hitGroups = Array.from(new Set(hits.map((h) => h.type)));

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
      <CommandInput
        placeholder="Search clients, policies, agents, or jump to a page…"
        value={term}
        onValueChange={setTerm}
      />
      <CommandList>
        <CommandEmpty>
          {debounced.length >= 2 && records.isFetching ? "Searching…" : "No results found."}
        </CommandEmpty>

        {/* Real records first — they are what someone typing a name wants. */}
        {hitGroups.map((type) => (
          <CommandGroup key={type} heading={HIT_GROUP[type]}>
            {hits.filter((h) => h.type === type).map((h) => {
              const Icon = HIT_ICON[h.type];
              return (
                <CommandItem
                  key={`${h.type}-${h.id}`}
                  value={`${h.title} ${h.subtitle ?? ""} ${h.type}`}
                  onSelect={() => go(h.href)}
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span>{h.title}</span>
                  {h.subtitle && (
                    <span className="ml-auto text-xs text-muted-foreground truncate max-w-[45%]">
                      {h.subtitle}
                    </span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}

        {debounced.length >= 2 && records.isFetching && hits.length === 0 && (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Searching records…
          </div>
        )}

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
