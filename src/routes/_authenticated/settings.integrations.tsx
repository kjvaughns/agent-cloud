import { createFileRoute } from "@tanstack/react-router";
import { DiscordSettings } from "@/components/discord-settings";

// Same as Support Desk: tab-only until now, so it had no address.
export const Route = createFileRoute("/_authenticated/settings/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Agent Cloud" }] }),
  component: DiscordSettings,
});
