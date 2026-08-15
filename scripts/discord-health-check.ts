/**
 * A Discord channel that stops delivering says so, and stops being hammered.
 *
 *   npx tsx scripts/discord-health-check.ts
 *
 * An agency can already connect several channels with their own event toggles.
 * Two things were missing, and both are the difference between a list of
 * webhooks and something an owner can run.
 *
 * **Nothing tracked repeated failure.** `last_error` records the most recent
 * one and nothing counts them. A webhook deleted in Discord returns 404
 * forever, so the product kept posting to it on every deal — one doomed
 * request per deal per channel, indefinitely — while the owner saw a stale
 * error message that never explained nothing had arrived for a fortnight.
 *
 * **Nothing said what an integration was for.** The only label was
 * `channel_label`, which answers "which Discord channel", not "what is this
 * for". An agency posting deals and new agents to the same channel through two
 * integrations saw two identical rows.
 *
 * The backoff is stored rather than derived, which is the opposite of the
 * choice made for announcement visibility — deliberately. "We have failed four
 * times in a row" cannot be worked out from the current time.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  backoffMinutes, nextRetryAt, inBackoff, shouldAttempt,
  healthState, healthDetail, successPatch, failurePatch,
  BACKOFF_MINUTES, BROKEN_AFTER, HEALTH_LABELS,
} from "../src/lib/discord/retry";

const ROOT = process.cwd();
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
const sql = (s: string) => s.replace(/--[^\n]*/g, "");

const NOW = new Date("2026-08-15T12:00:00Z");
const at = (mins: number) => new Date(NOW.getTime() + mins * 60_000).toISOString();

// ── The ladder ──────────────────────────────────────────────────────────────

// The first failure waits a minute: most are transient, and a channel that
// works again immediately should not sit out.
check("one failure rests a minute", backoffMinutes(1), 1);
check("the ladder climbs", [2, 3, 4].map(backoffMinutes), [5, 30, 120]);
// A permanently dead webhook settles at six tries a day rather than growing
// without bound and effectively never retrying.
check("…and then holds rather than growing forever",
  [5, 6, 40].map(backoffMinutes), [240, 240, 240]);
check("no failures means no wait", backoffMinutes(0), 0);
check("a nonsense count does not produce a nonsense wait", backoffMinutes(-3), 0);
check("the ladder is the one the module publishes",
  backoffMinutes(BACKOFF_MINUTES.length), BACKOFF_MINUTES[BACKOFF_MINUTES.length - 1]);

check("the next attempt is that far ahead",
  nextRetryAt(2, NOW), at(5));

// ── Resting, not disabled ───────────────────────────────────────────────────

console.log("");

check("a channel with a future retry is resting",
  inBackoff({ next_retry_at: at(10) }, NOW), true);
check("…and once the time passes it is not",
  inBackoff({ next_retry_at: at(-1) }, NOW), false);
// Never failed, or succeeded since.
check("a channel that has never failed is never resting",
  inBackoff({ next_retry_at: null }, NOW), false);
// Trying and failing again is recoverable; silently never posting is not.
check("an unreadable retry time does not silence a channel",
  inBackoff({ next_retry_at: "whenever" }, NOW), false);

check("a resting channel is skipped", shouldAttempt({ next_retry_at: at(10) }, NOW), false);
check("a healthy one is not", shouldAttempt({ next_retry_at: null }, NOW), true);
check("a channel turned off is skipped whatever its health",
  shouldAttempt({ enabled: false, next_retry_at: null }, NOW), false);
// The row is skipped, never disabled — it recovers by itself when the webhook
// works again, with no one having to notice and switch it back on.
check("nothing in the module disables a channel",
  /enabled: false/.test(strip(read("src/lib/discord/retry.ts"))), false);

// ── What the owner is told ──────────────────────────────────────────────────

console.log("");

check("a channel that has sent something is working",
  healthState({ last_success_at: at(-60), consecutive_failures: 0 }), "healthy");
check("one that never has says so",
  healthState({ consecutive_failures: 0 }), "never_used");
// One failure is usually Discord having a moment.
check("a single failure is retrying, not broken",
  healthState({ consecutive_failures: 1 }), "retrying");
check("several in a row is broken",
  healthState({ consecutive_failures: BROKEN_AFTER }), "broken");
check("a channel turned off reports that first",
  healthState({ enabled: false, consecutive_failures: 9 }), "off");
check("every state has a label",
  (["never_used", "healthy", "retrying", "broken", "off"] as const)
    .every((s) => Boolean(HEALTH_LABELS[s])), true);

// A red badge that does not say what to do is a red badge people learn to
// ignore. The commonest cause by far is the webhook being deleted in Discord.
check("a broken channel is told what usually causes it",
  /webhook being deleted in Discord/.test(healthDetail({ consecutive_failures: 4 }) ?? ""), true);
check("…and a working one is told nothing",
  healthDetail({ last_success_at: at(-5), consecutive_failures: 0 }), null);
check("a resting channel says when it will try again",
  /Next attempt/.test(healthDetail({ consecutive_failures: 4, next_retry_at: at(30) }, NOW) ?? ""), true);

// ── The two patches ─────────────────────────────────────────────────────────

console.log("");

const ok = successPatch(NOW);
check("a success clears the failure count", ok.consecutive_failures, 0);
check("…and the backoff", ok.next_retry_at, null);
check("…and the error text", [ok.last_error, ok.last_error_at], [null, null]);
check("…and stamps the success", ok.last_success_at, NOW.toISOString());

const bad = failurePatch(2, "404 Not Found", NOW);
check("a failure advances the count", bad.consecutive_failures, 3);
// Passing the previous count is what makes the ladder climb instead of
// restarting at one on every failure.
check("…and books the next attempt by the new count", bad.next_retry_at, at(30));
check("a first failure starts at one", failurePatch(0, "boom", NOW).consecutive_failures, 1);
check("…and a nonsense previous count still starts at one",
  failurePatch(-5, "boom", NOW).consecutive_failures, 1);
check("a long error is truncated rather than rejected",
  failurePatch(0, "x".repeat(900), NOW).last_error?.length, 500);

// ── The wiring ──────────────────────────────────────────────────────────────

console.log("");

const FNS = strip(read("src/lib/discord.functions.ts"));

check("every send path skips a resting channel",
  (FNS.match(/shouldAttempt\(/g) ?? []).length >= 3, true);
check("the outcomes are written from the shared patches",
  /\.update\(successPatch\(\)\)/.test(FNS) && /\.update\(failurePatch\(previousFailures, message\)\)/.test(FNS), true);
// Without the previous count the ladder restarts at one on every failure and
// never actually backs off.
check("…and a failure carries the count that came before it",
  (FNS.match(/consecutive_failures \?\? 0\)/g) ?? []).length >= 4, true);

// A skip because the channel is resting is a different fact from a skip
// because the event was not wanted.
check("a rested deal is recorded, not dropped silently",
  /skipReason: "in_backoff"/.test(FNS), true);

// The columns arrive with 20260815020000; naming them before they exist fails
// the whole write.
check("the marks fall back before the migration",
  (FNS.match(/if \(error\) \{\s*await supabaseAdmin/g) ?? []).length, 2);
check("the ledger drops the reason rather than the row",
  /if \(error\.code !== "42703"\) throw error;/.test(FNS), true);
check("naming a channel degrades to a clear refusal",
  /Naming a channel isn't available until the next update\./.test(FNS), true);

const UI = strip(read("src/components/discord-settings.tsx"));
check("the list titles each integration by what it is for",
  /w\.name \|\| w\.channel_label \|\| "Discord bot"/.test(UI), true);
check("…and offers a field to set it", /placeholder="Sales Bot"/.test(UI), true);
check("the health badge comes from the module",
  /healthState, healthDetail, HEALTH_LABELS/.test(UI), true);
// A row of green pills teaches an owner to stop reading them, which is exactly
// when the red one appears.
check("…and says nothing when a channel is fine",
  /if \(state === "healthy" \|\| state === "off"\) return null;/.test(UI), true);

// ── The migration ───────────────────────────────────────────────────────────

console.log("");

const MIG = sql(read("supabase/migrations/20260815020000_discord-named-integrations.sql"));
check("existing channels take the name they already had",
  /set name = coalesce\(nullif\(btrim\(channel_label\), ''\), 'Discord channel'\)/.test(MIG), true);
check("a failure count cannot go negative",
  /check \(consecutive_failures >= 0\)/.test(MIG), true);
check("the ledger can say why it skipped", /add column if not exists skip_reason text/.test(MIG), true);
check("the sender's lookup is indexed",
  /on public\.discord_integrations \(organization_id, enabled, next_retry_at\)/.test(MIG), true);
check("nothing is dropped or deleted",
  /drop (table|column)|delete from/i.test(MIG), false);
// Existing channels must behave exactly as they do today.
check("retry state starts clean",
  /consecutive_failures integer not null default 0/.test(MIG), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
