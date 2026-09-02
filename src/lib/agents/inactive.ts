/**
 * Previous agents — the people whose business is on the books but who never
 * signed up.
 *
 * An imported policy written by one of them sits on the importer's agent id
 * with the producer's email in `assigned_to_email`. They are not a separate
 * category of thing to the people using the portal: they are agents, they wrote
 * the business, and their production belongs in the agency's totals. The only
 * difference is that there is no account behind them yet — so they appear
 * everywhere a real agent does, marked inactive.
 *
 * They get a synthetic id derived from the email so that lists, filters and
 * boards can key on them exactly like a profile id. `isInactiveAgentId` is the
 * guard every caller needs before passing an id to something expecting a uuid.
 */

export const INACTIVE_ID_PREFIX = "inactive:";

export function inactiveAgentId(email: string): string {
  return `${INACTIVE_ID_PREFIX}${email.trim().toLowerCase()}`;
}

export function isInactiveAgentId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(INACTIVE_ID_PREFIX);
}

export function inactiveAgentEmail(id: string): string {
  return id.slice(INACTIVE_ID_PREFIX.length);
}

/** Roster names for a set of producer emails, falling back to the email. */
export async function inactiveAgentNames(
  supabase: any,
  emails: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const wanted = Array.from(new Set(emails.map((e) => e.toLowerCase()))).filter(Boolean);
  if (!wanted.length) return out;
  const { data } = await supabase
    .from("pending_agents")
    .select("email, first_name, last_name")
    .in("email", wanted);
  for (const p of ((data ?? []) as any[])) {
    const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    if (p.email && full) out.set(String(p.email).toLowerCase(), full);
  }
  for (const e of wanted) if (!out.has(e)) out.set(e, e);
  return out;
}
