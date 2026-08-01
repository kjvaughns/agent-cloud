import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@/hooks/use-server-fn";
import { getScopeCapabilities } from "@/lib/scope.functions";
import {
  NO_SCOPE_CAPABILITIES, availableScopes, defaultScope, normalizeScope,
  type Scope, type ScopeCapabilities,
} from "@/lib/scope";

/**
 * What this person may look at. Answered once and cached for the session —
 * the upline chain does not change while somebody is using the app, and every
 * scoped page asks.
 */
export function useScopeCapabilities(): { caps: ScopeCapabilities; ready: boolean } {
  const fn = useServerFn(getScopeCapabilities);
  const { data, isPending } = useQuery({
    queryKey: ["scope", "capabilities"],
    queryFn: () => fn(),
    staleTime: Infinity,
  });
  return { caps: data ?? NO_SCOPE_CAPABILITIES, ready: !isPending };
}

/**
 * Bind the current scope to the URL.
 *
 * Absent means default, and the default is never written on arrival. Writing
 * it eagerly costs a visible flash — the page renders at `mine`, capabilities
 * arrive, it rewrites to `agency` — plus one wasted fetch of the wrong rows.
 * So the parameter only appears once somebody has actually chosen something.
 *
 * `replace: true` because a scope toggle is a change of view, not a
 * destination; without it the back button walks through every switch instead
 * of leaving the page.
 *
 * Scope is deliberately per-page and never persisted. Sticky scope across
 * pages means somebody opens Money expecting their own paycheque and is shown
 * their team's.
 */
export function useScope(): {
  scope: Scope;
  setScope: (next: Scope) => void;
  caps: ScopeCapabilities;
  /** False until capabilities land — hold scoped queries until then. */
  ready: boolean;
  options: Scope[];
} {
  const { caps, ready } = useScopeCapabilities();
  const navigate = useNavigate();
  // strict: false — this reads whichever route is mounted, so one hook serves
  // every scoped page without each one threading its own Route through.
  const search = useSearch({ strict: false }) as Record<string, unknown>;

  const scope = normalizeScope(search.scope, caps);

  const setScope = (next: Scope) => {
    // Absent means default, so the parameter is dropped only when the choice
    // *is* the default. Dropping it for "mine" would read back as the widest
    // scope on the next render and bounce the toggle straight back.
    const omit = next === defaultScope(caps);
    navigate({
      to: ".",
      replace: true,
      // The router types search per route; this hook is route-agnostic on
      // purpose, so one implementation serves every scoped page. Each of those
      // routes declares `scope` in its own validateSearch.
      search: ((prev: Record<string, unknown>) => ({
        ...prev, scope: omit ? undefined : next,
      })) as any,
    });
  };

  return { scope, setScope, caps, ready, options: availableScopes(caps) };
}
