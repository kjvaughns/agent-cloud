/**
 * API keys: their shape, and what one is allowed to do.
 *
 * ── Why a module ──
 *
 * "Is this key allowed to answer this request" is a decision with four
 * separate ways to say no — unknown, revoked, wrong scope, wrong agency — and
 * an endpoint that decides it inline ends up conflating them, which is how an
 * integration ends up with a 403 nobody can explain. Every branch here is a
 * named reason, and the HTTP layer turns reasons into statuses.
 *
 * Nothing in this file touches the database or the network, so all of it is
 * checked directly by scripts/api-keys-check.ts.
 *
 * Hashing and key generation live in `keys.server.ts` instead, because they
 * need `node:crypto` and this module is imported by the settings panel for its
 * scope labels — pulling a Node built-in into the browser bundle breaks the
 * build, which is how the split got made.
 */

/**
 * What a key may read.
 *
 * Two rather than one, because an owner sharing an agency total with a parent
 * has not necessarily agreed to name which of their agents wrote what. The
 * narrower key is the default the UI offers first.
 */
export const API_SCOPES = ["production:read", "producers:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const SCOPE_LABEL: Record<ApiScope, string> = {
  "production:read": "Agency totals — premium, policies and placed premium for a period",
  "producers:read": "Per-agent breakdown — each producer's name and their totals",
};

/**
 * `ac_live_` then 32 bytes of base64url.
 *
 * The prefix is there so a key found in a log or a config file is
 * recognisable as ours and can be searched for; `live` leaves room for a
 * `test` variant later without the two being confusable.
 */
export const KEY_PREFIX = "ac_live_";

/** The first characters, stored in clear so a key is identifiable in a list. */
export function keyPrefixOf(raw: string): string {
  return raw.slice(0, KEY_PREFIX.length + 6);
}

/**
 * What the owner sees in the list afterwards: enough to tell two keys apart,
 * and not enough to use either.
 */
export function maskKey(prefix: string): string {
  return `${prefix}${"•".repeat(12)}`;
}

/**
 * The credential out of an Authorization header.
 *
 * `Bearer` is matched case-insensitively because HTTP clients disagree about
 * it, and a key rejected over the case of the word "bearer" is a support
 * ticket rather than a security boundary.
 */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^bearer\s+(.+)$/i.exec(header.trim());
  const token = m?.[1]?.trim();
  return token ? token : null;
}

export type ApiKeyRow = {
  id: string;
  organization_id: string;
  scopes: string[] | null;
  revoked_at: string | null;
};

export type ApiRefusal = "no_credential" | "unknown_key" | "revoked" | "missing_scope";

export const API_REFUSAL: Record<ApiRefusal, { status: number; message: string }> = {
  no_credential: {
    status: 401,
    message: "Send your key as an Authorization: Bearer header.",
  },
  unknown_key: {
    // Deliberately the same wording as a revoked key would get if we were
    // careless — but a DIFFERENT reason, because the owner's usage log needs
    // to tell "somebody is guessing" from "the key I withdrew is still wired
    // up somewhere". The caller learns nothing either way.
    status: 401,
    message: "That key is not valid.",
  },
  revoked: {
    status: 401,
    message: "That key is not valid.",
  },
  missing_scope: {
    status: 403,
    message: "That key does not have access to this data.",
  },
};

/**
 * May this key answer a request needing `required`?
 *
 * Takes the row rather than fetching it, so the decision is testable without a
 * database and the endpoint keeps its one query where it can be seen.
 */
export function authorizeKey(
  row: ApiKeyRow | null | undefined,
  required: ApiScope,
): { ok: true; row: ApiKeyRow } | { ok: false; refusal: ApiRefusal } {
  if (!row) return { ok: false, refusal: "unknown_key" };
  if (row.revoked_at) return { ok: false, refusal: "revoked" };
  if (!(row.scopes ?? []).includes(required)) return { ok: false, refusal: "missing_scope" };
  return { ok: true, row };
}

/** Only scopes we actually serve, so a typo cannot create a key that grants nothing. */
export function normalizeScopes(input: unknown): ApiScope[] {
  const raw = Array.isArray(input) ? input : [];
  const kept = API_SCOPES.filter((s) => raw.includes(s));
  // A key with no scope can read nothing and would look broken rather than
  // restricted, so the narrowest useful grant is the floor.
  return kept.length ? kept : ["production:read"];
}
