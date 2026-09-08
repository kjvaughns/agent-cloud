import { useQuery } from "@tanstack/react-query";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useServerFn } from "@/hooks/use-server-fn";
import { useScope } from "@/hooks/use-scope";
import { useRole } from "@/hooks/use-role";
import { listScopeAgents } from "@/lib/scope.functions";
import { SCOPE_DESCRIPTIONS, SCOPE_LABELS, type Scope } from "@/lib/scope";

/**
 * Mine / Team / Agency.
 *
 * **Renders nothing when there is only one answer.** That is the point of the
 * component rather than an edge case in it: every scoped page drops this in
 * unconditionally, and it stays invisible for the people — most people — who
 * only ever see their own work. No page grows an `{isManager && ...}` branch,
 * and nobody is shown a control with one option in it.
 *
 * Pills rather than a dropdown. Two or three options that somebody switches
 * between constantly should be visible and one click away; a select hides the
 * alternatives and costs two. Built on ToggleGroup so arrow keys and
 * `aria-pressed` come for free.
 */
export function ScopeToggle({ className, exclude }: { className?: string; exclude?: Scope[] }) {
  const { scope, setScope, options: allOptions } = useScope();
  const { role } = useRole();
  // Some surfaces are deliberately narrower than the person's widest scope —
  // client records never roll up across agency boundaries, for instance.
  const options = exclude?.length ? allOptions.filter((s) => !exclude.includes(s)) : allOptions;

  if (options.length < 2) {

    /*
     * Silent is right for an agent and wrong for a manager.
     *
     * Rendering nothing when there is one answer is this component's whole
     * design, and for the people who only ever see their own work it is
     * correct — a control with one option in it is worse than no control.
     *
     * A manager is the exception, and it is the one the audit hit: somebody
     * told they now manage a team, looking at four pages where the Mine /
     * Team / Agency pills are absent rather than disabled, with nothing on
     * screen to say why. The cause is almost never a permission — scope comes
     * from my_scopes(), which counts the downline — so the honest sentence
     * names the empty downline rather than pointing at the Roles page.
     *
     * `role === "manager"` exactly, not useRole().isManager, which folds in
     * owners and admins. Those have an agency scope and never land here.
     */
    if (role === "manager") {
      return (
        <p className={cn("text-xs text-muted-foreground", className)}>
          No agents are assigned to you yet, so there is nothing to switch between. Your agency
          owner can assign them from the Team page.
        </p>
      );
    }
    return null;
  }

  return (
    <ToggleGroup
      type="single"
      value={scope}
      // Radix fires an empty string when somebody clicks the active pill.
      // Ignoring it keeps one option always selected — there is no such thing
      // as "no scope".
      onValueChange={(v) => { if (v) setScope(v as Scope); }}
      aria-label="Whose records to show"
      className={cn("gap-1.5", className)}
    >
      {options.map((s) => (
        <ToggleGroupItem
          key={s}
          value={s}
          title={SCOPE_DESCRIPTIONS[s]}
          className={cn(
            "h-auto rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
            "bg-surface-2 text-muted-foreground border-border hover:text-foreground",
            "data-[state=on]:bg-gold-glow data-[state=on]:text-gold-bright data-[state=on]:border-primary/40",
          )}
        >
          {SCOPE_LABELS[s]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * Narrow a team or agency view to one person.
 *
 * Separate from the scope toggle because they answer different questions —
 * how wide am I looking, and which one person am I looking at. Book of
 * Business used to encode both in a single select, which is why it had a
 * scope value called "agent" that behaved unlike the other two.
 *
 * Hidden in `mine` scope, where there is nobody else to pick.
 */
export function ScopeAgentFilter({
  value, onChange, className, extra,
}: {
  value?: string;
  onChange: (agentId?: string) => void;
  className?: string;
  /**
   * People who belong in this list without having an account — previous agents
   * whose book is still on ours. They are listed with everybody else rather
   * than in a filter of their own.
   */
  extra?: { id: string; label: string }[];
}) {
  const { scope } = useScope();
  const fn = useServerFn(listScopeAgents);
  const { data: agents } = useQuery({
    queryKey: ["scope", "agents", scope],
    queryFn: () => fn({ data: { scope } }),
    enabled: scope !== "mine",
    staleTime: 5 * 60_000,
  });

  const others = (agents ?? []).filter((a) => a.id);
  const extras = extra ?? [];
  if (scope === "mine" || others.length + extras.length < 2) return null;

  return (
    <Select value={value ?? "all"} onValueChange={(v) => onChange(v === "all" ? undefined : v)}>
      <SelectTrigger className={cn("h-9 w-[190px]", className)}>
        <SelectValue placeholder="Everyone" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Everyone</SelectItem>
        {others.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {[a.first_name, a.last_name].filter(Boolean).join(" ") || "Unnamed"}
            {(a as any).inactive ? " (Inactive)" : ""}
          </SelectItem>
        ))}
        {extras.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
