import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/**
 * Contracting Operations sub-navigation.
 *
 * A rail rather than a second sidebar: this module has twelve surfaces, and
 * twelve more entries in the main sidebar would bury everything else an agency
 * does. Scrolls horizontally on a phone instead of wrapping into four rows.
 */

export const CONTRACTING_TABS = [
  { label: "Overview", to: "/contracting-ops" },
  { label: "Contract Requests", to: "/contracting-ops/requests" },
  { label: "Carrier Directory", to: "/contracting-ops/carriers" },
  { label: "Writing Numbers", to: "/contracting-ops/writing-numbers" },
  { label: "Compensation", to: "/contracting-ops/compensation" },
  { label: "Hierarchies", to: "/contracting-ops/hierarchies" },
  { label: "Licensing", to: "/contracting-ops/licensing" },
  { label: "Hierarchy Changes", to: "/contracting-ops/hierarchy-changes" },
  { label: "Ready to Sell", to: "/contracting-ops/ready-to-sell" },
  { label: "Documents", to: "/contracting-ops/documents" },
  { label: "Templates", to: "/contracting-ops/templates" },
  { label: "Import", to: "/contracting-ops/import" },
  { label: "Staff Queue", to: "/contracting-ops/queue" },
  { label: "Settings", to: "/contracting-ops/settings" },
] as const;

export function ContractingNav() {
  const path = useRouterState({ select: (r) => r.location.pathname });

  return (
    <nav
      aria-label="Contracting Operations"
      className={cn(
        "flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "[mask-image:linear-gradient(to_right,black_calc(100%-40px),transparent)]",
      )}
    >
      {CONTRACTING_TABS.map((t) => {
        // Overview owns the exact root only; every other tab also matches its
        // own detail pages.
        const active = t.to === "/contracting-ops"
          ? path === t.to
          : path === t.to || path.startsWith(t.to + "/");
        return (
          <Link
            key={t.to}
            to={t.to}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
              active
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
