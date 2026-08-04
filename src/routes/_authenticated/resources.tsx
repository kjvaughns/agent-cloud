import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { BookOpen, ScrollText, GraduationCap, IdCard, Compass, Pencil } from "lucide-react";
import { PageShell, HeroBand } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { useNavContext } from "@/hooks/use-my-access";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/resources")({
  component: ResourcesLayout,
});

const TABS = [
  { label: "New Agent Guide", url: "/resources/new-agent-guide", icon: Compass },
  { label: "Agent Handbook", url: "/resources/agent-handbook", icon: BookOpen },
  { label: "Scripts", url: "/resources/scripts", icon: ScrollText },
  { label: "Licensing", url: "/licensing", icon: IdCard },
  { label: "Agent Academy", url: "/resources/agent-academy", icon: GraduationCap },
];

// Same first tab, different content behind it — see new-agent-guide.tsx. The
// label is the part that would otherwise read as somebody else's checklist.
const TAB_LABELS_STAFF: Record<string, string> = {
  "/resources/new-agent-guide": "Back Office Guide",
};

/**
 * Resources shell.
 *
 * Previously an ad-hoc `p-4 md:p-6` container with its own heading, while
 * every child also rendered a PageShell and a HeroBand — so each page showed
 * two stacked headers. The shell now owns the page header and the children
 * render only their content; PageShell is nesting-aware, so any inner shell
 * collapses instead of doubling the padding.
 */
function ResourcesLayout() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { canEditResources, audience } = useNavContext();
  // On the editor itself the button would point at the page you are on.
  const editing = path.startsWith("/resources/edit");

  return (
    <PageShell>
      <div className="max-w-[1200px] mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand
          title="Resources"
          subtitle={
            audience === "staff"
              ? "Where each part of the job lives, and what your agents are reading"
              : "Everything you need to sell, stay licensed, and get better at the job"
          }
          actions={
            // Shown to whoever maintains this content: the agency owner, plus
            // anyone granted "Manage resources" on the Roles page. Everyone
            // else never learns the button exists.
            canEditResources && !editing ? (
              <Button asChild variant="outline" size="sm">
                <Link to="/resources/edit">
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit resources
                </Link>
              </Button>
            ) : undefined
          }
        />

        <nav
          className="flex gap-1 overflow-x-auto rounded-[var(--radius)] border border-border bg-card p-1"
          aria-label="Resources"
        >
          {TABS.map((t) => {
            const active = path === t.url || path.startsWith(t.url + "/");
            return (
              <Link
                key={t.url}
                to={t.url}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-[calc(var(--radius)-4px)] px-3 py-2 text-sm font-medium transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                  active
                    ? "bg-gold-glow text-gold-bright"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <t.icon className="h-4 w-4" />
                {(audience === "staff" && TAB_LABELS_STAFF[t.url]) || t.label}
              </Link>
            );
          })}
        </nav>

        <Outlet />
      </div>
    </PageShell>
  );
}
