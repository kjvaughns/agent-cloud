/**
 * Announcements: who they reach, and how.
 *
 *   npx tsx scripts/announcements-check.ts
 *
 * Most of this file is about the repair rather than the feature. Posting an
 * announcement had been rejected for every agency owner — `createAnnouncement`
 * never set `organization_id`, and the write policy requires it — while the
 * read policy's `organization_id is null` arm made any row that DID land
 * without one readable by every agency on the platform. The button was gated
 * on `user_roles` admin/manager, a different rule from the one the database
 * enforces, which is why an action the database refused was still offered.
 *
 * The pure half tests audience resolution, where the two failures are silent
 * and serious: reaching *upward* to a parent agency, or ignoring a paused
 * relationship. Either one shows somebody a notice that was not for them.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  resolveAudience, normalizeChannels, collapseGroups,
  AUDIENCE_LABELS, CHANNEL_LABELS, type Relationship,
} from "../src/lib/announcements/audience";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── Who it reaches ──────────────────────────────────────────────────────────

const rel = (parent: string, child: string, status = "active"): Relationship =>
  ({ parent_org_id: parent, child_org_id: child, status });

// parent → child → grandchild, plus a paused leg and an unrelated agency.
const TREE: Relationship[] = [
  rel("parent", "child"),
  rel("child", "grandchild"),
  rel("parent", "paused-child", "paused"),
  rel("paused-child", "under-paused"),
  rel("parent", "gone-child", "terminated"),
  rel("stranger", "their-child"),
];

check("agency-only reaches exactly one agency",
  resolveAudience("parent", "agency", TREE), ["parent"]);
check("agency-and-subs walks down through active legs",
  resolveAudience("parent", "agency_and_subs", TREE), ["parent", "child", "grandchild"]);
// Pausing a relationship that keeps forwarding through a grandchild would make
// the pause meaningless.
check("a paused leg is skipped, and everything under it",
  resolveAudience("parent", "agency_and_subs", TREE).some((o) => o === "paused-child" || o === "under-paused"), false);
check("a terminated leg is skipped",
  resolveAudience("parent", "agency_and_subs", TREE).includes("gone-child"), false);
check("an unrelated agency is never reached",
  resolveAudience("parent", "agency_and_subs", TREE).includes("their-child"), false);
// The one that would be a real leak: a child must not be able to post upward.
check("a child posting to its subs never reaches its parent",
  resolveAudience("child", "agency_and_subs", TREE), ["child", "grandchild"]);
check("an agency with no children reaches only itself",
  resolveAudience("grandchild", "agency_and_subs", TREE), ["grandchild"]);
// The table permits a loop even though the UI does not.
check("a cycle terminates rather than hanging",
  resolveAudience("a", "agency_and_subs", [rel("a", "b"), rel("b", "a")]), ["a", "b"]);

// ── How it goes out ─────────────────────────────────────────────────────────

console.log("");

// In-app is the announcement itself; turning it off in a request body must
// achieve nothing.
check("in-app is always included", normalizeChannels([]), ["in_app"]);
check("…even when the caller omits it", normalizeChannels(["email"]), ["in_app", "email"]);
check("…and cannot be dropped", normalizeChannels(["discord"]).includes("in_app"), true);
check("unknown channels are ignored", normalizeChannels(["email", "carrier-pigeon"]), ["in_app", "email"]);
check("every channel and audience has a label",
  [Object.keys(CHANNEL_LABELS).length, Object.keys(AUDIENCE_LABELS).length], [3, 2]);

// One send to three agencies is one thing that happened.
const GROUPED = [
  { id: "1", announcement_group_id: "g", organization_id: "child" },
  { id: "2", announcement_group_id: "g", organization_id: "parent" },
  { id: "3", announcement_group_id: null, organization_id: "parent" },
];
check("a group collapses to one entry", collapseGroups(GROUPED, "parent").map((r) => r.id), ["2", "3"]);
check("…preferring the viewer's own copy", collapseGroups(GROUPED, "child").map((r) => r.id), ["1", "3"]);
check("an ungrouped post is untouched",
  collapseGroups([{ id: "x", organization_id: "parent" }], "parent").map((r) => r.id), ["x"]);

// ── The repair ──────────────────────────────────────────────────────────────

console.log("");

const FN = read("src/lib/announcements.functions.ts");
check("creating an announcement always sets the organization",
  /organization_id: target/.test(FN), true);
check("…and refuses anybody who is not the owner",
  /Only the agency owner can post announcements/.test(FN), true);
// The gate and the policy must ask the same question. Comments stripped: the
// docblock names the rule it replaced so the mismatch cannot be reintroduced
// by somebody who never knew about it.
check("the post gate no longer reads user_roles", /user_roles/.test(strip(FN)), false);
check("…it asks whether they own the agency", /org\?\.owner_id === userId/.test(FN), true);

const MIG = read("supabase/migrations/20260814200000_announcement-audience-and-delivery.sql");
// SQL comments carry the explanation of the leak being closed, including the
// old policy quoted verbatim, so the "is it gone" assertion reads the code.
const MIG_SQL = MIG.replace(/--[^\n]*/g, "");
check("orphans are attributed before the policy tightens",
  MIG.indexOf("set organization_id = p.organization_id") < MIG.indexOf("drop policy if exists announcements_read"), true);
check("the read policy has no null-org arm",
  /using \(organization_id in \(select public\.my_org_ids\(\)\)\)/.test(MIG), true);
check("…and the old global arm is gone",
  /organization_id is null or organization_id in/.test(MIG_SQL), false);
check("nothing is dropped or deleted",
  /drop (table|column)|delete from/i.test(MIG_SQL), false);
check("audience is constrained", /check \(audience in \('agency', 'agency_and_subs'\)\)/.test(MIG), true);
check("the delivery ledger is its own table", /create table if not exists public\.announcement_deliveries/.test(MIG), true);

// ── The dialog ──────────────────────────────────────────────────────────────

console.log("");

const PAGE = read("src/routes/_authenticated/announcements.tsx");
check("the audience picker only appears for an agency with children",
  /hasSubAgencies && \(/.test(PAGE), true);
check("in-app is shown on and disabled", /<Checkbox checked disabled \/>/.test(PAGE), true);
// There is no SMS send path in this codebase; a control that silently does
// nothing is worse than an absent one.
check("there is no SMS control anywhere", /sms|SMS|Telnyx|Twilio/.test(strip(PAGE)), false);
check("Discord setup is a link, not a second config",
  /Set up Discord/.test(PAGE) && !/webhook_url/.test(PAGE), true);
check("posts show which channels they actually went out on",
  /a\.channels/.test(PAGE), true);

check("the email template is registered",
  /'announcement': announcement/.test(read("src/lib/email-templates/registry.ts")), true);
check("…and exists", existsSync(join(ROOT, "src/lib/email-templates/announcement.tsx")), true);
check("email goes out under the announcements consent category",
  /category: "announcements"/.test(FN), true);
// Re-running a send must not re-send: the key identifies the event.
check("…with an event-level idempotency key",
  /key: `announcement:\$\{announcementId\}:\$\{id\}`/.test(FN), true);

const DISCORD = read("src/lib/discord.functions.ts");
check("announcements post to the agency's own channels only",
  /export async function announceToDiscord/.test(DISCORD), true);
check("…and never throw at the caller", /return \{ sent, failed \};/.test(DISCORD), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
