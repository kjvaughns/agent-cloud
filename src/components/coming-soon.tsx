import { Link } from "@tanstack/react-router";
import { PageShell, Panel, HeroBand } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";

/**
 * Premium coming-soon state for modules that aren't part of Phase 1 yet.
 * Actionable, not a dead end: points the user at what they can do today.
 */
export function ComingSoonPage({
  title,
  description,
  icon = "spark",
  actions,
}: {
  title: string;
  description: string;
  icon?: IconName;
  actions?: { label: string; to: string }[];
}) {
  const links = actions ?? [
    { label: "Back to Dashboard", to: "/dashboard" },
    { label: "Open Pipeline", to: "/pipeline" },
  ];
  return (
    <PageShell>
      <div className="max-w-2xl mx-auto flex flex-col gap-[var(--gap)]">
        <HeroBand title={title} />
        <Panel>
          <div className="py-12 text-center space-y-4">
            <div className="mx-auto h-14 w-14 rounded-full bg-gold-glow grid place-items-center text-gold-bright">
              <Icon name={icon} size={26} />
            </div>
            <div className="font-display font-bold text-lg" style={{ fontFamily: "var(--font-display)" }}>
              Coming soon
            </div>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">{description}</p>
            <div className="flex gap-2 justify-center flex-wrap pt-1">
              {links.map((a, i) => (
                <Button key={a.to} asChild variant={i === 0 ? "default" : "outline"}>
                  <Link to={a.to}>{a.label}</Link>
                </Button>
              ))}
            </div>
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
