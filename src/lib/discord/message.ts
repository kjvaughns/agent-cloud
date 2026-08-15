/**
 * What a Discord message may contain, decided by an allowlist.
 *
 * ── Why an allowlist and not care ──
 *
 * The current senders do not leak client data. They avoid it by each having
 * been written carefully, which holds exactly until somebody adds a field to a
 * payload because it would be nice to see. A Discord webhook posts into a
 * channel an agency does not control the membership of, and the brief lists
 * what must never reach one: client and insured names, phone numbers, email
 * addresses, policy numbers, dates of birth, addresses, beneficiaries and
 * private notes.
 *
 * So the fields are enumerated per event type, the builders cannot see
 * anything else, and `piiProblems` scans the finished text for the shapes that
 * should never appear. Three layers, because the first two are conventions and
 * the third catches a value that arrives inside a field that was allowed —
 * an agency named "Smith Family Insurance" is fine, an announcement body
 * pasted full of a client's phone number is not.
 *
 * Masking the webhook URL is deliberately NOT here. `discord.functions.ts`
 * has done it since the integration was built, and its version keeps the
 * numeric channel id, which is more use to an owner telling two rows apart
 * than a tail would be. A second masker would be a second thing to keep
 * right.
 */

/** The three the brief names. Nothing else may be selected. */
export const DISCORD_EVENTS = ["sales", "announcements", "new_agents"] as const;
export type DiscordEvent = (typeof DISCORD_EVENTS)[number];

export const EVENT_LABEL: Record<DiscordEvent, string> = {
  sales: "Sales",
  announcements: "Announcements",
  new_agents: "New Agents",
};

export const EVENT_PURPOSE: Record<DiscordEvent, string> = {
  sales: "Posts when a deal is submitted. No client details.",
  announcements: "Posts agency announcements as they are published.",
  new_agents: "Posts when somebody joins the agency.",
};

/**
 * The columns each event type is allowed to read.
 *
 * Kept as data rather than as the shape of a function argument so a test can
 * assert the list itself. A forbidden field added to a builder shows up here
 * as a diff, not as a subtle behaviour change nobody reviews.
 */
export const ALLOWED_FIELDS: Record<DiscordEvent, readonly string[]> = {
  sales: ["agentName", "carrier", "productCategory", "annualPremium", "teamName", "at"],
  announcements: ["title", "body", "at"],
  new_agents: ["agentName", "position", "welcome", "at"],
};

export type SalesFacts = {
  agentName: string;
  carrier: string;
  /** A category — "Final Expense" — never a specific plan a client bought. */
  productCategory: string | null;
  annualPremium: number;
  teamName: string | null;
  at: string;
};

export type AnnouncementFacts = { title: string; body: string; at: string };

export type NewAgentFacts = {
  agentName: string;
  position: string | null;
  welcome: string | null;
  at: string;
};

const money = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * A coarse category for a specific plan name.
 *
 * A channel hears "Final Expense", not "Golden Eagle FE 10-Pay Plan B" — the
 * specific plan a named client bought is a detail about that client, and the
 * category is all a sales feed needs to be useful.
 */
export function productCategory(product: string | null | undefined): string | null {
  const p = (product ?? "").toLowerCase();
  if (!p.trim()) return null;
  if (/final\s*expense|\bfex\b|burial/.test(p)) return "Final Expense";
  if (/\biul\b|indexed universal/.test(p)) return "IUL";
  if (/\bul\b|universal life/.test(p)) return "Universal Life";
  if (/whole\s*life|\bwl\b/.test(p)) return "Whole Life";
  if (/\bterm\b/.test(p)) return "Term Life";
  if (/annuit/.test(p)) return "Annuity";
  if (/medicare|med\s*supp|advantage/.test(p)) return "Medicare";
  if (/accident|hospital|critical|cancer|health/.test(p)) return "Accident & Health";
  if (/mortgage\s*protect/.test(p)) return "Mortgage Protection";
  return "Life";
}

/**
 * A sale, with nobody's client in it.
 *
 * The insured is absent by construction: this function is not given them. That
 * is the point of taking a narrow fact type rather than a policy row — a
 * builder handed the whole policy would eventually render a field off it.
 */
export function buildSalesMessage(f: SalesFacts): string {
  const bits = [`**${f.agentName}** submitted a deal`];
  if (f.teamName) bits.push(`on ${f.teamName}`);
  const detail = [f.carrier, f.productCategory].filter(Boolean).join(" · ");
  return `${bits.join(" ")}\n${detail} — ${money(f.annualPremium)} annual premium`;
}

export function buildAnnouncementMessage(f: AnnouncementFacts): string {
  return `**${f.title}**\n${f.body}`;
}

export function buildNewAgentMessage(f: NewAgentFacts): string {
  const who = f.position ? `**${f.agentName}** joined as ${f.position}` : `**${f.agentName}** joined`;
  return f.welcome ? `${who}\n${f.welcome}` : who;
}

/**
 * Shapes that must never appear in a message, whatever field carried them.
 *
 * Deliberately conservative and deliberately not clever. A false positive
 * costs one blocked message and a line in the ledger saying why; a false
 * negative posts somebody's phone number into a channel with an unknown
 * membership. The asymmetry decides the tuning.
 */
const FORBIDDEN: { name: string; re: RegExp }[] = [
  { name: "an email address", re: /[\w.+-]+@[\w-]+\.[\w.]{2,}/ },
  // Ten digits in a row, or the usual separated forms. Written to miss a
  // premium like 1,200 and to catch 555-123-4567 and (555) 123 4567.
  { name: "a phone number", re: /(?:\+?\d[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/ },
  { name: "a phone number", re: /\b\d{10}\b/ },
  { name: "a social security number", re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: "a date of birth", re: /\b(?:dob|date of birth)\b/i },
  { name: "a policy number", re: /\bpolicy\s*(?:#|no\.?|number)\s*[:\s]*\S+/i },
  { name: "a beneficiary", re: /\bbeneficiar(?:y|ies)\b/i },
  { name: "a street address", re: /\b\d+\s+[A-Za-z][A-Za-z\s]{2,}\s(?:st|street|ave|avenue|rd|road|blvd|lane|ln|drive|dr)\b/i },
];

/**
 * What is wrong with this message, or an empty list.
 *
 * Returns reasons rather than a boolean so the delivery ledger can record why
 * a send was refused. "Blocked" with no reason is indistinguishable from a
 * broken integration.
 */
export function piiProblems(text: string): string[] {
  const seen = new Set<string>();
  for (const { name, re } of FORBIDDEN) {
    if (re.test(text)) seen.add(name);
  }
  return [...seen].map((n) => `The message appears to contain ${n}, so it was not sent.`);
}

/** Is this safe to post? */
export function isSafeToSend(text: string): boolean {
  return piiProblems(text).length === 0;
}

/**
 * A stable identity for one event, so a retry cannot post it twice.
 *
 * Built from what the event IS rather than when it was sent: two sends of the
 * same sale to the same channel are one event, and a timestamp in here would
 * make every retry look new.
 */
export function eventKey(integrationId: string, event: DiscordEvent, subjectId: string): string {
  return `${integrationId}:${event}:${subjectId}`;
}

/** Which events a saved bot is configured for, in the brief's order. */
export function eventsFor(row: {
  post_deals?: boolean | null;
  post_announcements?: boolean | null;
  post_new_agents?: boolean | null;
}): DiscordEvent[] {
  const out: DiscordEvent[] = [];
  if (row.post_deals) out.push("sales");
  if (row.post_announcements) out.push("announcements");
  if (row.post_new_agents) out.push("new_agents");
  return out;
}

/** A bot with no events selected sends nothing, and should say so. */
export function eventSummary(events: DiscordEvent[]): string {
  if (events.length === 0) return "No events selected — this bot will not post anything.";
  if (events.length === DISCORD_EVENTS.length) return "All events";
  return events.map((e) => EVENT_LABEL[e]).join(", ");
}
