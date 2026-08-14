/**
 * A Discord switch does what it says.
 *
 *   npx tsx scripts/discord-channels-check.ts
 *
 * `discord_integrations` offered three per-channel switches. Two did nothing:
 *
 *   post_deals        honoured by announceDeal
 *   post_new_agents   stored, shown as "When someone joins the agency",
 *                     read by nothing anywhere in the product
 *   post_milestones   stored, shown as "Production milestones and streaks",
 *                     read by nothing — and there is no milestone or streak
 *                     concept in the product for it to describe
 *
 * An owner could turn either on and wait forever. That is worse than a
 * missing feature: a control that a person sets and that can never act is a
 * claim the product does not keep.
 *
 * Meanwhile agency announcements, which do send, honoured none of them. The
 * sender filtered on `enabled` alone, so a channel set up purely for deal
 * alerts also received every announcement, and the only way to stop that was
 * to turn the whole channel off. Those sends were also recorded nowhere, so
 * the Deliveries list an owner opens to ask "did that go out?" showed deals
 * and nothing else.
 *
 * New agents now send. Announcements have a switch and a record. Milestones
 * lose the control, and keep the column.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    pass++;
    console.log(`ok    ${name}`);
  } else {
    fail++;
    console.log(
      `FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`,
    );
  }
}

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripSql = (s: string) => s.replace(/--[^\n]*/g, "");
const strip = (s: string) =>
  s
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const DISCORD = strip(read("src/lib/discord.functions.ts"));
const UI = strip(read("src/components/discord-settings.tsx"));
const MIG = stripSql(read("supabase/migrations/20260814240000_discord-announcement-channel.sql"));

// ── Every switch on the screen has a sender ─────────────────────────────────

// The whole point. Each key offered in Settings must be read by something
// that actually posts.
const OFFERED = Array.from(UI.matchAll(/\["(post_[a-z_]+)",/g)).map((m) => m[1]);
check("the settings screen offers three switches", OFFERED.sort(),
  ["post_announcements", "post_deals", "post_new_agents"]);

for (const key of OFFERED) {
  check(`${key} is read by a sender`,
    new RegExp(`\\.eq\\("${key}", true\\)|${key} !== false`).test(DISCORD), true);
}

// The switch that never could: gone from the screen, gone from what the save
// accepts, still in the database.
check("the milestone switch is off the screen",
  /post_milestones/.test(UI), false);
check("…and cannot be set through the save path",
  /post_milestones: z\.boolean/.test(DISCORD), false);
check("…but the column is not dropped",
  /drop column|drop table/i.test(MIG), false);

// ── New agents actually send ────────────────────────────────────────────────

console.log("");

check("there is a sender for joins", /export async function announceNewAgent/.test(DISCORD), true);
check("…gated on the channel's own switch",
  /\.eq\("post_new_agents", true\)/.test(DISCORD), true);
// Same contract as the deal announcer: an account that exists must not be
// undone by a webhook being down.
check("…which never throws at its caller",
  /announceNewAgent\(profileId: string\): Promise<void> \{\s*try \{/.test(DISCORD), true);

const ONB = strip(read("src/lib/onboarding.functions.ts"));
check("the join path calls it", /void announceNewAgent\(newUserId\)/.test(ONB), true);
check("…without awaiting it", /await announceNewAgent/.test(ONB), false);

// A Discord server often has wide membership. The deal post withholds client
// identity for that reason and this withholds the same.
check("a join post carries a name and nothing else",
  /email|phone|npn/i.test(
    DISCORD.slice(DISCORD.indexOf("announceNewAgent"), DISCORD.indexOf("sendDiscordTest")),
  ),
  false);

// ── Announcements obey the channel, and leave a record ──────────────────────

console.log("");

check("announcements are filtered on the channel's switch",
  /h\.post_announcements !== false/.test(DISCORD), true);
// `!== false` rather than `=== true`: before the migration the column is
// absent, and every enabled channel must keep receiving announcements exactly
// as it does today.
check("…tolerantly, so nothing goes quiet in the pending window",
  /post_announcements === true/.test(DISCORD), false);
check("…reading the row with select(*) for the same reason",
  /\.from\("discord_integrations"\)\s*\.select\("\*"\)\s*\.eq\("organization_id", orgId\)/.test(DISCORD),
  true);

check("one recorder writes the ledger", /async function recordDelivery/.test(DISCORD), true);
check("…and an announcement is recorded through it",
  /eventType: "announcement"/.test(DISCORD), true);
check("…as is a join", /eventType: "agent_joined"/.test(DISCORD), true);
// A delivery that succeeded and failed to be logged is still a delivery.
check("recording a delivery cannot fail the delivery",
  /recordDelivery[\s\S]{0,600}catch \(e: any\) \{[\s\S]{0,200}console\.error/.test(DISCORD), true);

// ── The migration ───────────────────────────────────────────────────────────

console.log("");

check("the new switch defaults to on",
  /add column if not exists post_announcements boolean not null default true/i.test(MIG), true);
check("…so no existing channel goes quiet", /default true/i.test(MIG), true);
check("the schema cache is reloaded", /notify pgrst, 'reload schema'/.test(MIG), true);

// The window is short and the failure is visible rather than silent, but it
// should still read as English.
check("a save in the pending window explains itself",
  /42703/.test(DISCORD) && /announcements are still posted to every connected channel/.test(DISCORD),
  true);
// The switch must not claim "off" while announcements are in fact going out.
check("the toggle reads as on before the column exists",
  /checked=\{w\[key\] !== false\}/.test(UI), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
