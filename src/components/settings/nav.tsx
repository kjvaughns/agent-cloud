import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMyAccess } from "@/hooks/use-my-access";
import { cn } from "@/lib/utils";

/**
 * Settings navigation.
 *
 * The third hub to use this shape, after Contracting Operations and Agency: a
 * grouped vertical rail on desktop, one select on a phone.
 *
 * Settings used to navigate by tabs, which worked while there were four of
 * them. Once agency configuration moved in there were ten, and the pages
 * reached directly by URL had no frame at all — you could land on Automations
 * with no way back except the browser. One pattern across all three hubs beats
 * two navigation systems in one of them.
 */

export type NavItem = { label: string; to: string; adminOnly?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

export const SETTINGS_GROUPS: NavGroup[] = [
  {
    label: "You",
    items: [
      { label: "Billing", to: "/settings/billing" },
      { label: "Notifications", to: "/settings/notifications" },
      { label: "Security", to: "/settings/security" },
      { label: "Nova Pro", to: "/settings/nova-pro" },
    ],
  },
  {
    label: "Your agency",
    items: [
      { label: "Agency settings", to: "/settings/agency", adminOnly: true },
      { label: "Roles & permissions", to: "/settings/roles", adminOnly: true },
      { label: "Automations", to: "/settings/automations", adminOnly: true },
      { label: "Emails", to: "/settings/emails", adminOnly: true },
      { label: "White label", to: "/settings/white-label", adminOnly: true },
    ],
  },
  {
    label: "Support",
    items: [
      { label: "Support desk", to: "/settings/support", adminOnly: true },
      { label: "Integrations", to: "/settings/integrations", adminOnly: true },
      { label: "What people use", to: "/settings/usage", adminOnly: true },
    ],
  },
];

function isActive(path: string, to: string) {
  return path === to || path.startsWith(to + "/");
}

export function SettingsNav() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const { access } = useMyAccess();

  // Hidden rather than shown disabled, the same as the other two rails.
  const canManage = Boolean((access as any)?.canManageRoles) || Boolean(access?.isOwner);
  const groups = SETTINGS_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || canManage) }))
    .filter((g) => g.items.length > 0);

  const all = groups.flatMap((g) => g.items);
  const current = all.find((i) => isActive(path, i.to)) ?? all[0];

  return (
    <>
      {/* Phone: one control, no scrolling. */}
      <div className="lg:hidden">
        <label htmlFor="settings-nav" className="sr-only">Settings section</label>
        <select
          id="settings-nav"
          value={current?.to ?? ""}
          onChange={(e) => navigate({ to: e.target.value })}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm font-medium"
        >
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((i) => <option key={i.to} value={i.to}>{i.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Desktop: a grouped rail that stays put while the content scrolls. */}
      <nav aria-label="Settings" className="hidden lg:block">
        <div className="sticky top-4 space-y-4">
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
