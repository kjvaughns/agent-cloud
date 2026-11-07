import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@/hooks/use-server-fn";
import { getDiscordSettings } from "@/lib/discord.functions";
import { asDealStyle } from "@/lib/discord/deal-style";
import { SalesFeedQuick } from "@/components/settings/sales-feed-quick";
import { HubCard, HubLayout, PreviewCard, AdvancedDrawer } from "@/components/settings/hub-card";

function DiscordPreview() {
  const getFn = useServerFn(getDiscordSettings);
  const { data } = useQuery({ queryKey: ["discord"], queryFn: () => getFn() });
  const feed = (((data as any)?.webhooks ?? []) as any[]).find((w) => w.post_deals);
  const style = asDealStyle(feed?.message_style);
  return (
    <PreviewCard className="bg-ink text-ink-foreground">
      <div className="flex gap-3 p-4">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">AC</div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-semibold">Agent Cloud <span className="ml-1 rounded bg-primary/30 px-1 text-[9px] uppercase">bot</span></p>
          <div className="rounded-md border-l-4 border-primary bg-ink-foreground/10 p-3 text-xs">
            {style === "minimal" && <p><b>Jordan</b> · Mutual of Omaha · $1,200 AP</p>}
            {style === "celebrate" && <><p className="font-bold">🔥🎉 JORDAN JUST CLOSED $1,200 AP!</p><p className="mt-1 opacity-80">Mutual of Omaha · Final Expense — let's go team! 🚀</p></>}
            {style === "classic" && (
              <>
                <p className="font-bold">💰 New Deal Posted</p>
                <p className="mt-1 opacity-80"><b>Jordan</b> just wrote $1,200 of annual premium.</p>
                <div className="mt-2 grid grid-cols-2 gap-1.5 opacity-80">
                  <span>Carrier<br /><b>Mutual of Omaha</b></span><span>Product<br /><b>Final Expense</b></span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </PreviewCard>
  );
}

export function ConnectionsHub({ showFeed, integrations, advanced }: { showFeed: boolean; integrations: ReactNode; advanced: ReactNode }) {
  return (
    <HubLayout preview={showFeed ? <DiscordPreview /> : undefined}>
      {showFeed && (
        <HubCard title="Sales feed" blurb="Post wins to your team's Discord automatically.">
          <SalesFeedQuick />
        </HubCard>
      )}
      {integrations && (
        <HubCard title="Integrations" blurb="Tap a tool to connect it.">{integrations}</HubCard>
      )}
      <AdvancedDrawer label="Discord bots, events, thresholds & API keys">{advanced}</AdvancedDrawer>
    </HubLayout>
  );
}
