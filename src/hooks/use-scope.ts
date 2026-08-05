import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearch } from "@tanstack/react-router";
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
 * The last scope chosen on this page, if it is still one they may open.
 *
 * Keyed by pathname, so choosing Agency on Tasks says nothing about Finances.
 * Guarded for SSR and for browsers with storage disabled — a preference that
 * cannot be read is simply a page with no preference yet, never an error.
 */
const SCOPE_MEMORY_KEY = "scope-by-page";

function readRemembered(path: string, caps: ScopeCapabilities): Scope | null {
  if (typeof window === "undefined") return null;
  try {
    const all = JSON.parse(localStorage.getItem(SCOPE_MEMORY_KEY) ?? "{}") as Record<string, string>;
    const raw = all[path];
    if (!raw) return null;
    // Re-checked against capabilities every time: somebody whose downline was
    // reassigned must not keep landing on a Team view they can no longer open.
    return availableScopes(caps).includes(raw as Scope) ? (raw as Scope) : null;
  } catch {
    return null;
  }
}

function remember(path: string, next: Scope) {
  if (typeof window === "undefined") return;
  try {
    const all = JSON.parse(localStorage.getItem(SCOPE_MEMORY_KEY) ?? "{}") as Record<string, string>;
    all[path] = next;
    localStorage.setItem(SCOPE_MEMORY_KEY, JSON.stringify(all));
  } catch {
    // Storage disabled or full. The toggle still works for this visit.
  }
}
/**
 * Bind the current scope to the URL.
 *
 * Absent means default, and the default is never written on arrival — the
 * parameter appears only once somebody has actually chosen something, so a
 * clean URL stays clean.
 *
 * `replace: true` because a scope toggle is a change of view, not a
 * destination; without it the back button walks through every switch instead
 * of leaving the page.
 *
 * Scope is deliberately per-page. Sticky scope ACROSS pages means somebody
 * opens Money expecting their own paycheque and is shown their team's — that
 * reasoning stands and is why the remembered value below is keyed by path.
 * Within one page it is the opposite: a manager who works out of the Team view
 * every morning should not have to re-choose it every morning.
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
  const path = useLocation({ select: (l) => l.pathname });

  // The URL wins when it says something — a shared link means what it says.
  // Otherwise this page's remembered choice, and only then the default.
  const scope = search.scope != null
    ? normalizeScope(search.scope, caps)
    : (ready ? readRemembered(path, caps) ?? defaultScope(caps) : defaultScope(caps));

  const setScope = (next: Scope) => {
    remember(path, next);
    // Absent means default. With the remembered value read above, dropping the
    // parameter for the default is still right: the next render finds no
    // `?scope`, reads the memory, and lands on the same place.
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
