export const SUPPORT_INBOX = "support@useagentcloud.com";
export const ASSISTANT_NAME = "Allison";
export const SIGNATURE = "Allison\nAgent Cloud Support";

/** Allison waits a random 3–5 minutes before replying so it feels human. */
export function replyDelayMs(rand: number = Math.random()): number {
  const r = Math.min(Math.max(rand, 0), 0.999999);
  return Math.round(3 * 60_000 + r * 2 * 60_000);
}

const ESCALATE_PATTERNS: [RegExp, string][] = [
  [/\b(refund|chargeback|money back|dispute)\b/i, "Refund or billing dispute"],
  [/\b(charged twice|double charged|overcharged|unauthori[sz]ed charge)\b/i, "Billing problem"],
  [/\b(can'?t (log|sign) ?in|locked out|hacked|delete my account)\b/i, "Account access"],
  [/\b(lawyer|attorney|sue|legal action|complaint to)\b/i, "Legal"],
  [/\b(custom (price|pricing|contract)|discount|enterprise deal)\b/i, "Pricing negotiation"],
];

/** Topics Allison must always hand to a human, regardless of the AI's opinion. */
export function forcedEscalation(text: string): string | null {
  for (const [re, reason] of ESCALATE_PATTERNS) if (re.test(text)) return reason;
  return null;
}

export const ESCALATION_REPLY = (name?: string | null) =>
  `Hi${name ? ` ${name.split(" ")[0]}` : ""},\n\nThanks for helping me understand the situation. I've emailed Kaeden the full picture, including the project involved and suggested next steps. The team will follow up with you directly.\n\n${SIGNATURE}`;
