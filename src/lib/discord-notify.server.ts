// Server-only: post sale notifications to the Discord webhook.
// Failures are swallowed so a Discord outage never blocks a deal post.

type Payload = {
  agentName: string;
  carrier: string;
  product: string;
  face: number;
  annual: number;
  effective: string | null; // ISO date string yyyy-mm-dd
  dealNumberToday: number;
};

function formatDate(iso: string | null): string {
  if (!iso) return "TBD";
  // Treat as local noon to avoid off-by-one timezone slip
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

export async function postSaleToDiscord(p: Payload): Promise<void> {
  const url = process.env.DISCORD_SALES_WEBHOOK;
  if (!url) return;
  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
  };
  const content =
    `**On The Books:** ${p.agentName} — ${p.carrier} — ${p.product} — ` +
    `${fmtMoney(p.face)} for ${fmtMoney(p.annual)} — Effective ${formatDate(p.effective)} — ` +
    `Deal #${p.dealNumberToday} (${ordinal(p.dealNumberToday)} today)`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "Apex Money Printer", content }),
    });
    if (!res.ok) {
      console.warn("[discord] webhook returned", res.status, await res.text().catch(() => ""));
    }
  } catch (e) {
    console.warn("[discord] webhook failed:", (e as Error).message);
  }
}
