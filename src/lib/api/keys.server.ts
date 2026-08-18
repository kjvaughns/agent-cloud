/**
 * Making and hashing a key. Server only.
 *
 * Split from `keys.ts` because `node:crypto` cannot be bundled for the
 * browser, and the settings panel imports that module for its scope labels.
 * The same split `production/source.ts` and `source.server.ts` already make.
 */

import { createHash, randomBytes } from "node:crypto";
import { KEY_PREFIX, keyPrefixOf } from "@/lib/api/keys";

/**
 * SHA-256, hex. Not a password hash on purpose: a 256-bit random key has no
 * dictionary to attack, so the cost of bcrypt would buy nothing and would be
 * paid on every single API request.
 */
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** 32 random bytes behind a recognisable prefix. */
export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = KEY_PREFIX + randomBytes(32).toString("base64url");
  return { raw, prefix: keyPrefixOf(raw), hash: hashApiKey(raw) };
}
