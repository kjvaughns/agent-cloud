/** How a sale announces itself in Discord. Pure so the test send previews exactly what deals post. */
export const DEAL_STYLES = ["classic", "celebrate", "minimal"] as const;
export type DealStyle = (typeof DEAL_STYLES)[number];

export const DEAL_STYLE_LABEL: Record<DealStyle, { label: string; sample: string }> = {
  classic: { label: "Classic", sample: "💰 New Deal Posted — Jordan just wrote $1,200 of annual premium." },
  celebrate: { label: "Hype", sample: "🔥🎉 JORDAN JUST CLOSED $1,200 AP! Let's go team!" },
  minimal: { label: "Minimal", sample: "Jordan · Mutual of Omaha · $1,200 AP" },
};

export type DealFacts = {
  agentName: string; carrier: string; product: string;
  annual: string; monthly: string; face: string;
};

export function asDealStyle(v: unknown): DealStyle {
  return (DEAL_STYLES as readonly string[]).includes(String(v)) ? (v as DealStyle) : "classic";
}

export function buildDealEmbed(style: DealStyle, f: DealFacts, color: number) {
  const ts = new Date().toISOString();
  if (style === "minimal") {
    return { description: `**${f.agentName}** · ${f.carrier} · ${f.annual} AP`, color, timestamp: ts };
  }
  if (style === "celebrate") {
    return {
      title: `🔥🎉 ${f.agentName.toUpperCase()} JUST CLOSED ${f.annual} AP!`,
      description: `${f.carrier} · ${f.product} — let's go team! 🚀`,
      color, timestamp: ts, footer: { text: "Agent Cloud" },
    };
  }
  return {
    title: "💰 New Deal Posted",
    description: `**${f.agentName}** just wrote ${f.annual} of annual premium.`,
    color,
    fields: [
      { name: "Agent", value: f.agentName, inline: true },
      { name: "Carrier", value: f.carrier, inline: true },
      { name: "Product", value: f.product, inline: true },
      { name: "Annual Premium", value: f.annual, inline: true },
      { name: "Monthly", value: f.monthly, inline: true },
      { name: "Face Amount", value: f.face, inline: true },
    ],
    timestamp: ts, footer: { text: "Agent Cloud" },
  };
}
