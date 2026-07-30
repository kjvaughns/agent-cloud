import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { globalSearch, type SearchHit } from "@/lib/search.functions";
import { useMyAccess } from "@/hooks/use-my-access";
import { audienceFor, reachableFor } from "@/lib/navigation";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem,
} from "@/components/ui/command";
import {
  User, FileText, Briefcase, UserSearch, Loader2,
} from "lucide-react";

export const OPEN_COMMAND_PALETTE = "open-command-palette";



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

  // Every page this person may open — including the ones their sidebar
  // deliberately leaves out. This is what makes a five-item sidebar safe
  // rather than restrictive.
  const { access } = useMyAccess();
  const pages = reachableFor(
    audienceFor({
      role: access?.role ?? null,
      isSolo: Boolean(access?.isSolo),
      isOwner: Boolean(access?.isOwner),
      canManage: Boolean((access as any)?.canManageRoles),
    }),
    (access?.permissions ?? {}) as Record<string, unknown>,
  );
  const areas = [...new Set(pages.map((p) => p.area))];

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

        {areas.map((area) => (
          <CommandGroup key={area} heading={area}>
            {pages.filter((p) => p.area === area).map((p) => (
              <CommandItem key={p.path} value={`${p.label} ${p.area}`} onSelect={() => go(p.path)}>
                <p.icon className="h-4 w-4 text-muted-foreground" />
                <span>{p.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
