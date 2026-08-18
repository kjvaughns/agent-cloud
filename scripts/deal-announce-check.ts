/**
 * A deal that reaches no Discord channel says so.
 *
 *   npx tsx scripts/deal-announce-check.ts
 *
 * ── The defect ──
 *
 * "Post a deal isn't going to Discord — it's only posting my direct deals when
 * it should post my entire agency's deals."
 *
 * `announceDeal` returned on a null `policies.organization_id`. That column is
 * filled by `stamp_organization_id` from the agent's active membership, with
 * `profiles.organization_id` as a fallback — so an agent with neither gets a
 * null, and every deal they ever posted went nowhere. The owner's own deals
 * posted fine, because the owner has both. From the outside that is exactly
 * "it only announces my direct deals".
 *
 * ── Why the diagnostics are the fix, not decoration ──
 *
 * Four early returns wrote no ledger row, and the outer `catch` was completely
 * empty. So a deal that posted nowhere and a deal that was never posted left
 * the identical trace: nothing in `discord_deliveries`, nothing in the logs.
 * There was no observation that could distinguish the causes, which is why
 * this needed guessing at all.
 *
 * Every gate now leaves a row naming itself. The next time a deal goes quiet
 * the reason is a column, not a theory.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const DISCORD = strip(read("src/lib/discord.functions.ts"));
const POSTDEAL = strip(read("src/lib/post-deal.functions.ts"));

/** Just the body of `announceDeal`, so the other senders do not mask a gap. */
const ANNOUNCE = (() => {
  const start = DISCORD.indexOf("export async function announceDeal");
  const end = DISCORD.indexOf("export async function", start + 10);
  return DISCORD.slice(start, end > start ? end : undefined);
})();

check("announceDeal was found in the source", ANNOUNCE.length > 500, true);

// ── The null org no longer ends the story ───────────────────────────────────

check(
  "a missing org is resolved rather than returned on",
  /getMyOrgIds\(policy\.agent_id\)/.test(ANNOUNCE),
  true,
);
check(
  "…using the resolution the rest of the server uses, not a fifth copy",
  /from\("organization_memberships"\)/.test(ANNOUNCE),
  false,
);
check(
  "the policy row is repaired once the org is known",
  /\.update\(\{ organization_id: orgId \}\)/.test(ANNOUNCE),
  true,
);
check(
  "…and the repair cannot overwrite a real value",
  /\.is\("organization_id", null\)/.test(ANNOUNCE),
  true,
);
check(
  "nothing downstream still reads the unresolved column",
  /policy\.organization_id/.test(ANNOUNCE.replace(/let orgId[^\n]*\n/, "")),
  false,
);

// ── Every gate leaves a row ─────────────────────────────────────────────────

for (const reason of ["no_organization", "demo_org", "owner_feed_opt_out", "no_channels", "in_backoff"]) {
  check(`the ${reason} gate records a skip_reason`, ANNOUNCE.includes(`"${reason}"`), true);
}

// The count is the point: a `return` inside announceDeal that leaves no trace
// is the bug this file exists to stop coming back. A ledger row is the good
// outcome; a log is acceptable for the one gate where a row is impossible
// (`policy_id` is a foreign key, and that gate is "no such policy"). Silence
// is not.
const untraced = ANNOUNCE.split("\n").filter((line, i, all) => {
  if (!/^\s{4,6}return;$/.test(line)) return false;
  const before = all.slice(Math.max(0, i - 8), i).join("\n");
  return !/recordDelivery\(|console\.error\(/.test(before);
});
check("no gate returns without recording anything", untraced, []);

check(
  "a resting channel is not also logged as an unconfigured one",
  /if \(eligible\.length === 0\)/.test(ANNOUNCE),
  true,
);

// ── The failure is audible ──────────────────────────────────────────────────

check(
  "the outer catch logs rather than swallowing",
  /console\.error\("\[discord\] announceDeal failed"/.test(ANNOUNCE),
  true,
);
check(
  "…and leaves a failed row for the policy",
  /status: "failed", policyId, error:/.test(ANNOUNCE),
  true,
);
// Against the RAW source, not the stripped copy: the other catches in this
// file are deliberately empty of CODE but carry a comment saying why (a column
// that lands with a later migration, a log that must not itself throw).
// Stripping comments first would flag those as the bug and hide the real one,
// which was a catch with nothing in it at all.
check(
  "no catch swallows an error with nothing said about it",
  /catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(read("src/lib/discord.functions.ts")),
  false,
);

// ── The send survives the response ──────────────────────────────────────────
//
// Vercel can freeze the instance the moment the response is written, and the
// announcement makes six sequential round trips before the webhook fetch. A
// dangling promise here is a lost message, not a saved millisecond.

check("post a deal awaits the announcement", /await announceDeal\(policy\.id\)/.test(POSTDEAL), true);
check("…and no longer fires and forgets", /void announceDeal/.test(POSTDEAL), false);

// The contract that makes awaiting safe: announceDeal cannot throw.
check(
  "announceDeal still cannot throw into the deal path",
  /export async function announceDeal\(policyId: string\): Promise<void> \{\s*try \{/.test(ANNOUNCE),
  true,
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
