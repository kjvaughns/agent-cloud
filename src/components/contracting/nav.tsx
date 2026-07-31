import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/**
 * Contracting Operations navigation.
 *
 * Fourteen destinations in one horizontal scroller was a filing cabinet: half
 * the tabs sat off-screen and finding one meant dragging a rail rather than
 * reading a list. Same destinations, grouped by the question being asked —
 * what needs doing, who is ready, how the agency is configured — and shown as
 * a vertical rail on desktop where there is room for it.
 *
 * On a phone the rail becomes a select. A grouped list is worth a lot on a wide
 * screen and worth nothing on a narrow one, where it only pushes the content
 * below the fold.
 */

export type NavItem = { label: string; to: string };
export type NavGroup = { label: string; items: NavItem[] };

export const CONTRACTING_OVERVIEW: NavItem = { label: "Overview", to: "/contracting-ops" };

export const CONTRACTING_GROUPS: NavGroup[] = [
  {
    label: "Work",
    items: [
      { label: "Contract Requests", to: "/contracting-ops/requests" },
      { label: "Staff Queue", to: "/contracting-ops/queue" },
      { label: "Hierarchy Changes", to: "/contracting-ops/hierarchy-changes" },
      // Carrier reports arriving for Nova to sort. It was only reachable from
      // a card inside Settings, which is not where anybody would look for
      // incoming paperwork.
      { label: "Document Intake", to: "/intake" },
    ],
  },
  {
    label: "Producers",
    items: [
      { label: "Ready to Sell", to: "/contracting-ops/ready-to-sell" },
      { label: "Licensing", to: "/contracting-ops/licensing" },
      { label: "Documents", to: "/contracting-ops/documents" },
    ],
  },
  {
    label: "Carriers & pay",
    items: [
      { label: "Carrier Setup", to: "/contracting-ops/carriers" },
      { label: "Compensation", to: "/contracting-ops/compensation" },
      { label: "Writing Numbers", to: "/contracting-ops/writing-numbers" },
      { label: "Hierarchies", to: "/contracting-ops/hierarchies" },
    ],
  },
  {
    label: "Setup",
    items: [
      { label: "Templates", to: "/contracting-ops/templates" },
      { label: "Import", to: "/contracting-ops/import" },
      { label: "Settings", to: "/contracting-ops/settings" },
    ],
  },
];

const ALL_ITEMS = [CONTRACTING_OVERVIEW, ...CONTRACTING_GROUPS.flatMap((g) => g.items)];

function isActive(path: string, to: string) {
  // Overview owns the exact root only; everything else also matches its own
  // detail pages.
  return to === "/contracting-ops" ? path === to : path === to || path.startsWith(to + "/");
}

export function ContractingNav() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const current = ALL_ITEMS.find((i) => isActive(path, i.to)) ?? CONTRACTING_OVERVIEW;

  return (
    <>
      {/* Phone: one control, no scrolling. */}
      <div className="lg:hidden">
        <label htmlFor="contracting-nav" className="sr-only">Contracting section</label>
        <select
          id="contracting-nav"
          value={current.to}
          onChange={(e) => navigate({ to: e.target.value })}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-medium"
        >
          <option value={CONTRACTING_OVERVIEW.to}>{CONTRACTING_OVERVIEW.label}</option>
          {CONTRACTING_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((i) => <option key={i.to} value={i.to}>{i.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Desktop: a grouped rail that stays put while the content scrolls. */}
      <nav aria-label="Contracting Operations" className="hidden lg:block">
        <div className="sticky top-4 space-y-4">
          <RailLink item={CONTRACTING_OVERVIEW} active={isActive(path, CONTRACTING_OVERVIEW.to)} />
          {CONTRACTING_GROUPS.map((g) => (
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
