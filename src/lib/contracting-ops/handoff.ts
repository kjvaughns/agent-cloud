/**
 * Which door a contracting request leaves through, and the URL on the door.
 *
 * A carrier is reached through a *method* — SureLC, a portal, an invitation
 * link, an email address — and `org_carrier_methods` has held those as rows
 * since the contracting-ops module was built. What never existed was one
 * answer to "which method applies to this request": the packet builder picked
 * `is_default ?? first` and ignored `applies_to` entirely, even though that
 * column exists for exactly this decision, and it fell back to the legacy
 * `org_carriers` URL columns for some method kinds but not others. Three
 * callers, three approximations of the same rule.
 *
 * This module is that rule, once, as pure functions — no client, no tables —
 * so `scripts/handoff-check.ts` can hold it still. The server function and the
 * packet builder both call it; if they ever disagree again it will be because
 * somebody stopped calling this, which the check script also watches for.
 */

export type HandoffMethod = {
  id: string;
  method: string;
  /** Contract types this method serves. Empty means all of them. */
  applies_to: string[] | null;
  target_url: string | null;
  target_email: string | null;
  instructions: string | null;
  is_default: boolean | null;
  sort_order: number | null;
};

/** The legacy per-carrier URL columns a method row may not exist for yet. */
export type LegacyCarrierUrls = {
  surelc_url?: string | null;
  contracting_portal_url?: string | null;
  invitation_link?: string | null;
  contracting_email?: string | null;
};

/**
 * Pick the method for a request.
 *
 * An explicit `methodId` wins, but only if it is actually one of this
 * carrier's methods — an id from another carrier resolves to null rather than
 * being trusted, because the caller passing it is a browser.
 *
 * Otherwise: methods whose `applies_to` names this contract type, or is empty
 * (empty means "all types" — that is the column's documented contract, and
 * treating it as "no types" would turn every untouched row invisible).
 *
 * Among those, a method scoped *to this type* beats an unscoped default. That
 * ordering is the point of `applies_to` existing: "email for transfers,
 * SureLC for everything else" means SureLC is the default and the transfer
 * row is the exception — and an exception someone wrote deliberately must not
 * lose to the catch-all it was written to override. Then the default, then
 * `sort_order`.
 */
export function resolveHandoffMethod(
  methods: HandoffMethod[],
  contractType: string,
  methodId?: string | null,
): HandoffMethod | null {
  if (methodId) return methods.find((m) => m.id === methodId) ?? null;

  const scopedTo = (m: HandoffMethod) => (m.applies_to ?? []).includes(contractType);
  const applicable = methods.filter((m) => {
    const scope = m.applies_to ?? [];
    return scope.length === 0 || scope.includes(contractType);
  });

  applicable.sort((a, b) =>
    Number(scopedTo(b)) - Number(scopedTo(a)) ||
    Number(Boolean(b.is_default)) - Number(Boolean(a.is_default)) ||
    (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return applicable[0] ?? null;
}

/**
 * The legacy column that stands in for a missing method row.
 *
 * Kept as a named mapping rather than inline ?? chains because the old packet
 * code fell back for `carrier_portal` and forgot `surelc` and
 * `invitation_link` — a carrier whose SureLC link lived only on the old column
 * rendered a packet with no SureLC at all. One mapping, all four kinds.
 */
export function legacyFallbackUrl(
  carrier: LegacyCarrierUrls | null | undefined,
  method: string,
): string | null {
  if (!carrier) return null;
  switch (method) {
    case "surelc": return carrier.surelc_url ?? null;
    case "carrier_portal": return carrier.contracting_portal_url ?? null;
    case "invitation_link": return carrier.invitation_link ?? null;
    case "email": return carrier.contracting_email ? `mailto:${carrier.contracting_email}` : null;
    default: return null;
  }
}

/** The fields a target URL may ask to have filled in. */
export type HandoffAgentFields = {
  npn?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

const PLACEHOLDER = /\{(npn|first_name|last_name|email)\}/g;

/**
 * Substitute agent fields into a target URL.
 *
 * `https://surelc.example.com/apply?npn={npn}&email={email}` becomes a working
 * prefilled link — the teardown's `url_template` without a new column, because
 * a URL with no placeholders passes through untouched and every existing row
 * is a URL with no placeholders.
 *
 * Every value is URL-encoded: an agent named O'Brien or a `+`-tagged email
 * must not be able to change the URL's shape. A placeholder with no value is
 * removed rather than sent as the literal `{npn}`, which carriers' forms read
 * as an NPN of "{npn}". Unknown placeholders are left alone — they may be the
 * carrier's own templating, and guessing would corrupt a URL we do not
 * understand.
 */
export function buildHandoffUrl(template: string, agent: HandoffAgentFields): string {
  return template.replace(PLACEHOLDER, (_all, key: string) => {
    const value = (agent as Record<string, string | null | undefined>)[key];
    return value ? encodeURIComponent(value) : "";
  });
}

/** Only the host, for telemetry that must not duplicate the substituted URL. */
export function hostOf(url: string): string | null {
  try { return new URL(url).hostname; } catch { return null; }
}
