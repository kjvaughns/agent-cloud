import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMyAccess } from "@/hooks/use-my-access";
import { cn } from "@/lib/utils";

/**
 * Agency Admin navigation.
 *
 * The same shape as the Contracting Operations rail: a grouped vertical list
 * on desktop, one select on a phone. Grouped by the question being asked —
 * who is in the agency, how it is configured, what it sends — rather than by
 * which release added the page.
 *
 * Only the pages that live under /agency are here. The Overview links out to
 * Team, Reports, Retention and the rest; putting those in the rail would mean
 * the rail vanishes the moment you use it, which is worse than not having one.
 */

export type NavItem = { label: string; to: string; adminOnly?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

export const AGENCY_OVERVIEW: NavItem = { label: "Overview", to: "/agency" };

export const AGENCY_GROUPS: NavGroup[] = [
  {
    label: "People",
    items: [
      { label: "Roles & permissions", to: "/agency/team", adminOnly: true },
    ],
  },
  {
    label: "How it runs",
    items: [
      { label: "Automations", to: "/agency/automations", adminOnly: true },
      { label: "Emails", to: "/agency/emails", adminOnly: true },
    ],
  },
  {
    label: "Setup",
    items: [
      { label: "Agency settings", to: "/agency/settings", adminOnly: true },
      { label: "What people use", to: "/agency/usage", adminOnly: true },
    ],
  },
];

function isActive(path: string, to: string) {
  // Overview owns the exact root only; everything else also matches its own
  // detail pages.
  return to === "/agency" ? path === to || path === "/agency/" : path === to || path.startsWith(to + "/");
}

export function AgencyNav() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const { access } = useMyAccess();

  // Hidden rather than shown disabled — a rail full of things you cannot open
  // is a list of things to feel locked out of.
  const canManage = Boolean((access as any)?.canManageRoles) || Boolean(access?.isOwner);
  const groups = AGENCY_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || canManage) }))
    .filter((g) => g.items.length > 0);

  const all = [AGENCY_OVERVIEW, ...groups.flatMap((g) => g.items)];
  const current = all.find((i) => isActive(path, i.to)) ?? AGENCY_OVERVIEW;

  return (
    <>
      {/* Phone: one control, no scrolling. */}
      <div className="lg:hidden">
        <label htmlFor="agency-nav" className="sr-only">Agency section</label>
        <select
          id="agency-nav"
          value={current.to}
          onChange={(e) => navigate({ to: e.target.value })}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-medium"
        >
          <option value={AGENCY_OVERVIEW.to}>{AGENCY_OVERVIEW.label}</option>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((i) => <option key={i.to} value={i.to}>{i.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Desktop: a grouped rail that stays put while the content scrolls. */}
      <nav aria-label="Agency Admin" className="hidden lg:block">
        <div className="sticky top-4 space-y-4">
          <RailLink item={AGENCY_OVERVIEW} active={isActive(path, AGENCY_OVERVIEW.to)} />
          {groups.map((g) => (
            <div key={g.label}>
              <p className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-dim">
                {g.label}
              </p>
              <div className="mt-1 space-y-0.5">
                {g.items.map((i) => (
                  <RailLink key={i.to} item={i} active={isActive(path, i.to)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}

function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "block rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
        active
          ? "bg-primary/12 font-semibold text-foreground"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {item.label}
    </Link>
  );
}
