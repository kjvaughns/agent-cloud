/**
 * Integrations, as a catalogue.
 *
 * This tab used to render the Discord webhook form, which conflated two
 * different things: an outside service the agency connects, and the agency's
 * own workflow rules. Discord's rules live in Automations now, and this tab
 * says what each service does in Agent Cloud and whether it is actually here.
 *
 * Nothing on this page pretends. An integration that is not implemented says
 * Coming soon and offers no button that would do nothing.
 */

import { Panel } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Status = "available" | "coming-soon";

type Integration = {
  name: string;
  what: string;
  status: Status;
  /** Only for the ones that are really here. */
  action?: { label: string; tab: string };
};

const INTEGRATIONS: Integration[] = [
  {
    name: "Discord",
    what: "Posts sales, announcements and new agents into your agency's channels.",
    status: "available",
    action: { label: "Configure in Automations", tab: "automations" },
  },
  {
    name: "Google Calendar",
    what: "Two-way sync for appointments booked in Agent Cloud.",
    status: "coming-soon",
  },
  {
    name: "Zapier",
    what: "Send Agent Cloud events to thousands of other apps without code.",
    status: "coming-soon",
  },
  {
    name: "Make",
    what: "Visual automations built on Agent Cloud events and records.",
    status: "coming-soon",
  },
  {
    name: "Calendly",
    what: "Pull booked meetings into an agent's calendar and pipeline.",
    status: "coming-soon",
  },
  {
    name: "Slack",
    what: "The same agency notifications Discord gets, in Slack channels.",
    status: "coming-soon",
  },
  {
    name: "SureLC",
    what: "Send contracting invitations and read appointment status back.",
    status: "coming-soon",
  },
  {
    name: "NIPR",
    what: "Verify licences and appointments straight from the national registry.",
    status: "coming-soon",
  },
  {
    name: "Email Provider",
    what: "Send agency email from your own domain instead of ours.",
    status: "coming-soon",
  },
  {
    name: "API Access",
    what: "Read and write your agency's data from your own systems.",
    status: "coming-soon",
  },
];

export function IntegrationsCatalog({ onOpenTab }: { onOpenTab?: (tab: string) => void }) {
  return (
    <Panel
      title="Integrations"
      action={<span className="text-xs text-muted-foreground">1 available</span>}
    >
      <p className="text-sm text-muted-foreground">
        Outside services your agency can connect. Discord is live today; the rest are on the
        way, and nothing here will ask you to set up something that does not work yet.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {INTEGRATIONS.map((i) => (
          <div
            key={i.name}
            className="rounded-[var(--radius)] border border-border bg-surface-2 p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{i.name}</p>
              {i.status === "available" ? (
                <Badge variant="outline" className="border-success/40 text-success">Available</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">Coming soon</Badge>
              )}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{i.what}</p>
            {i.action && (
              <Button
                size="sm"
                variant="outline"
                className="mt-3 h-7 text-xs"
                onClick={() => onOpenTab?.(i.action!.tab)}
              >
                {i.action.label}
              </Button>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
