/**
 * A key reads the agency's numbers, and nothing else.
 *
 *   npx tsx scripts/api-keys-check.ts
 *
 * ── What this is ──
 *
 * "Let's create the API feature so my upline can get access to our sales
 * numbers... so my upline can add my team's sales numbers to his website."
 *
 * The agency OWNER issues a key and hands it over. The upline needs no account
 * here, which is the whole convenience of it — and the reason the credential
 * has to be the entire boundary. There is no `auth.uid()` behind these
 * endpoints and no RLS to fall back on: if `authorizeKey` says yes, the data
 * goes out. So every branch of it is checked here.
 *
 * ── The line this feature must not cross ──
 *
 * Numbers, never people. An upline putting an agency's board on a public page
 * must not be putting its clients there too — in insurance that is a
 * compliance problem rather than an untidiness, and it is the same rule that
 * already governs what the Discord announcer sends. The last section asserts
 * the endpoint cannot name a client even by accident.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  parseBearer, authorizeKey, normalizeScopes,
  keyPrefixOf, maskKey, API_SCOPES, API_REFUSAL,
  type ApiKeyRow,
} from "../src/lib/api/keys";
import { generateApiKey, hashApiKey } from "../src/lib/api/keys.server";

const ROOT = join(import.meta.dirname, "..");

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── The key itself ──────────────────────────────────────────────────────────

const a = generateApiKey();
const b = generateApiKey();

check("a key is recognisably ours", a.raw.startsWith("ac_live_"), true);
check("…and long enough to be unguessable", a.raw.length >= 48, true);
check("two keys are not the same key", a.raw === b.raw, false);
check("the hash is what gets stored, not the key", a.hash === a.raw, false);
check("…and it is deterministic, or no lookup could ever match",
  hashApiKey(a.raw), a.hash);
check("a different key hashes differently", hashApiKey(b.raw) === a.hash, false);
check("the stored prefix is a prefix of the key", a.raw.startsWith(a.prefix), true);
check("…and is far too short to be usable", a.prefix.length < a.raw.length / 2, true);
check("the mask shows the prefix and hides the rest",
  maskKey(a.prefix).startsWith(a.prefix) && !maskKey(a.prefix).includes(a.raw.slice(-8)), true);
check("keyPrefixOf agrees with what generate stored", keyPrefixOf(a.raw), a.prefix);

// ── Getting the credential off the request ─────────────────────────────────

check("a bearer token is read", parseBearer("Bearer abc123"), "abc123");
// HTTP clients disagree about the case of the word, and a key refused over
// that is a support ticket rather than a security boundary.
check("…whatever case the word is in", parseBearer("bearer abc123"), "abc123");
check("…and with extra whitespace", parseBearer("  Bearer   abc123  "), "abc123");
check("a missing header is nothing", parseBearer(null), null);
check("an empty header is nothing", parseBearer(""), null);
check("a bare token without the scheme is refused", parseBearer("abc123"), null);
check("…and so is a different scheme", parseBearer("Basic abc123"), null);
check("…and Bearer with nothing after it", parseBearer("Bearer   "), null);

// ── The decision ────────────────────────────────────────────────────────────

const live = (over: Partial<ApiKeyRow> = {}): ApiKeyRow => ({
  id: "k1", organization_id: "org1", scopes: ["production:read"], revoked_at: null, ...over,
});

check("a live key with the scope is allowed",
  authorizeKey(live(), "production:read").ok, true);
check("a key nobody has heard of is refused",
  authorizeKey(null, "production:read"), { ok: false, refusal: "unknown_key" });
check("a revoked key is refused",
  authorizeKey(live({ revoked_at: "2026-08-01T00:00:00Z" }), "production:read"),
  { ok: false, refusal: "revoked" });
check("…and revocation beats having the scope",
  authorizeKey(live({ revoked_at: "2026-08-01T00:00:00Z", scopes: [...API_SCOPES] }), "production:read").ok,
  false);
check("a key without the scope is refused",
  authorizeKey(live(), "producers:read"), { ok: false, refusal: "missing_scope" });
check("a key with no scopes at all is refused",
  authorizeKey(live({ scopes: [] }), "production:read").ok, false);
check("…and a null scopes column does not throw",
  authorizeKey(live({ scopes: null }), "production:read").ok, false);
check("the narrow key still reads totals",
  authorizeKey(live({ scopes: ["production:read"] }), "production:read").ok, true);
check("the wide key reads both",
  [authorizeKey(live({ scopes: [...API_SCOPES] }), "production:read").ok,
   authorizeKey(live({ scopes: [...API_SCOPES] }), "producers:read").ok],
  [true, true]);

// An unknown key and a revoked one are DIFFERENT reasons on the same status:
// the caller learns nothing either way, and the owner's usage log can tell
// "somebody is guessing" from "the key I withdrew is still wired up".
check("a bad credential says 401", API_REFUSAL.unknown_key.status, 401);
check("…as does a revoked one", API_REFUSAL.revoked.status, 401);
check("…and the two are indistinguishable to the caller",
  API_REFUSAL.unknown_key.message, API_REFUSAL.revoked.message);
check("a scope refusal is 403, not 401", API_REFUSAL.missing_scope.status, 403);

// ── Scopes offered at creation ─────────────────────────────────────────────

check("an unknown scope cannot be granted",
  normalizeScopes(["production:read", "clients:read", "*"]), ["production:read"]);
check("both real scopes survive", normalizeScopes([...API_SCOPES]), [...API_SCOPES]);
// A key that can read nothing looks broken rather than restricted.
check("an empty request still yields a usable key", normalizeScopes([]), ["production:read"]);
check("…as does rubbish", normalizeScopes("nonsense"), ["production:read"]);
check("there is no scope that reads client detail",
  API_SCOPES.some((s) => /client|policy|book/i.test(s)), false);

// ── The wiring ──────────────────────────────────────────────────────────────

const AUTHN = strip(read("src/lib/api/authenticate.server.ts"));
const KEYS = strip(read("src/lib/api/keys.ts"));
const PROD = strip(read("src/routes/api/v1/production.ts"));
const FNS = strip(read("src/lib/api-keys.functions.ts"));
const MIG = read("supabase/migrations/20260818160000_agency-api-keys.sql");

check("the key is looked up by hash, never by value", /\.eq\("key_hash", hashApiKey\(token\)\)/.test(AUTHN), true);
check("…so the raw key is never in a query", /\.eq\("key_hash", token\)/.test(AUTHN), false);
check("refusals are logged as well as successes", /record\(request, endpoint, status,/.test(AUTHN), true);
check("the endpoint is rate limited before the key is read",
  PROD.indexOf("guardPublicEndpoint") < PROD.indexOf("authenticateApiRequest"), true);

// The numbers must be the same numbers the dashboard shows.
check("production is tallied by the shared function", /tallyByAgent\(/.test(PROD), true);
check("…and read through the shared source", /selectProduction</.test(PROD), true);
check("…so nothing about production is decided in the endpoint",
  /countsAsProduction|annual_premium\s*\)/.test(PROD), false);
check("a failed read is an error, not a published zero",
  /return apiError\("server_error", "Could not read production\."\)/.test(PROD), true);

// The line the feature must not cross.
for (const forbidden of ["client_id", "policy_number", "face_amount", "date_of_birth"]) {
  check(`the endpoint never selects ${forbidden}`, PROD.includes(forbidden), false);
}
check("the per-agent breakdown is behind its own scope",
  /includes\("producers:read"\)/.test(PROD), true);

// Issuing is the owner's decision and leaves a trail.
check("only the owner may issue a key", (FNS.match(/assertOrgOwner/g) ?? []).length >= 3, true);
check("creating a key is audited", /"api_key_created"/.test(FNS), true);
check("revoking is audited too", /"api_key_revoked"/.test(FNS), true);
check("revocation reads the write back rather than assuming it",
  /if \(!touched\?\.length\) throw new Error/.test(FNS), true);
check("…and cannot touch another agency's key",
  /\.eq\("organization_id", orgId\)/.test(FNS), true);
check("the raw key is returned exactly once, from creation only",
  (FNS.match(/key: raw/g) ?? []).length, 1);

check("the table stores a hash, not a key", /key_hash text not null unique/.test(MIG), true);
check("…and no column could hold the key itself", /key_value|key_raw|secret text/.test(MIG), false);
check("keys are owner-only at the database boundary too",
  /using \(public\.is_org_owner\(organization_id\)\)/.test(MIG), true);
check("revocation is a timestamp, so usage history survives it",
  /revoked_at timestamptz/.test(MIG), true);

// The split exists because the settings panel imports the scope labels, and a
// Node built-in in the browser bundle fails the build outright.
check("the browser-safe half imports no Node built-in", /node:crypto/.test(KEYS), false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
