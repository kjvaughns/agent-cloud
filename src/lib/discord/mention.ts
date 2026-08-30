/**
 * Who an announcement pings in Discord.
 *
 * Two facts drive everything here. A webhook embed cannot ping: Discord only
 * resolves mentions in the top-level `content`, so a notice that needs to
 * ping has to carry `@everyone` outside the embed. And `allowed_mentions`
 * decides what is *permitted* to resolve, independent of what the text says —
 * so an announcement body that happens to contain the literal text
 * "@everyone" can never ping on its own. Both together mean the ping is
 * exactly what the owner asked for and nothing else.
 */

export const MENTIONS = ["none", "here", "everyone"] as const;
export type Mention = (typeof MENTIONS)[number];

/** What the composer can ask for: the channel's own default, or an override. */
export const POST_MENTIONS = ["default", ...MENTIONS] as const;
export type PostMention = (typeof POST_MENTIONS)[number];

export const MENTION_LABELS: Record<Mention, string> = {
  none: "No ping",
  here: "Ping @here (online members)",
  everyone: "Ping @everyone",
};

/**
 * The per-post choice wins; "default" falls back to the channel's setting.
 * An unknown value from an older row reads as no ping — silence is the safe
 * failure for something that notifies a whole server.
 */
export function resolveMention(post: string | null | undefined, channel: string | null | undefined): Mention {
  const pick = (v: string | null | undefined): Mention | null =>
    (MENTIONS as readonly string[]).includes(v ?? "") ? (v as Mention) : null;
  if (post && post !== "default") return pick(post) ?? "none";
  return pick(channel) ?? "none";
}

/** `@everyone` / `@here` as Discord parses them, or nothing at all. */
export function mentionPrefix(mention: Mention): string {
  if (mention === "everyone") return "@everyone";
  if (mention === "here") return "@here";
  return "";
}

/**
 * The webhook body for one announcement.
 *
 * `allowed_mentions.parse` lists only the kind being asked for, and is an
 * empty array when no ping was asked for — which is what stops a body
 * containing "@everyone" from pinging by accident.
 */
export function announcementPayload(opts: {
  title: string;
  text: string;
  mention: Mention;
  color: number;
}) {
  const prefix = mentionPrefix(opts.mention);
  return {
    ...(prefix ? { content: prefix } : {}),
    embeds: [{
      title: opts.title.slice(0, 256),
      description: opts.text || "(no content)",
      color: opts.color,
    }],
    allowed_mentions: { parse: opts.mention === "none" ? [] : [opts.mention] },
  };
}
