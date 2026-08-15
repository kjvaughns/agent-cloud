/**
 * An announcement can be drafted, scheduled, aimed, and allowed to expire.
 *
 *   npx tsx scripts/announcement-lifecycle-check.ts
 *
 * An announcement had exactly one life: written, and immediately visible to
 * every member of the agency, forever. An owner preparing Monday's message on
 * Friday had to remember to come back and paste it. A message that only
 * concerned managers went to every agent as well. And last quarter's bonus
 * deadline sat at the top of the feed until somebody deleted it — which
 * destroys the record of it ever having gone out.
 *
 * ── The decision worth checking hardest ──
 *
 * Visibility is DERIVED from `status`, `publish_at` and `expires_at`, never
 * stored. Nothing flips a flag when a schedule matures or an expiry passes.
 *
 * That is not a stylistic preference. A stored status is wrong for as long as
 * whatever updates it is down, and this repository has no scheduler it can
 * create: the single pg_cron job the product uses is applied through the
 * Supabase Management API by an external tool and calls an Edge Function that
 * does not exist in this repo. Deriving it means a scheduled announcement
 * appears on time because time passed.
 *
 * The rule is therefore written twice — here in TypeScript, and in the RLS
 * policy — and the two must agree. The wiring half below asserts that the
 * policy contains the same three clauses this module implements.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  displayState, isLive, reaches, isVisibleTo, validate, dueForDispatch,
  ANNOUNCEMENT_STATUSES, DISPLAY_LABELS,
} from "../src/lib/announcements/lifecycle";

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
const strip = (s: string) =>
  s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const sql = (s: string) => s.replace(/--[^\n]*/g, "");

// A fixed instant, so "next week" and "last month" can both be checked without
// waiting for either.
const NOW = new Date("2026-08-15T12:00:00Z");
const iso = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString();

// ── The four states ─────────────────────────────────────────────────────────

check("a plain announcement is live", displayState({ status: "published" }, NOW), "live");
check("a draft is a draft", displayState({ status: "draft" }, NOW), "draft");
check("a schedule in the future is scheduled",
  displayState({ status: "scheduled", publish_at: iso(7) }, NOW), "scheduled");
// The whole point: it becomes live because time passed, not because a job ran.
check("…and is live once its time has come",
  displayState({ status: "scheduled", publish_at: iso(-1) }, NOW), "live");
check("a past expiry is expired",
  displayState({ status: "published", expires_at: iso(-30) }, NOW), "expired");
check("…and a future one is not",
  displayState({ status: "published", expires_at: iso(30) }, NOW), "live");

// Expiry outranks a schedule: saying "scheduled" about something that will
// never appear is a promise the product will not keep.
check("a scheduled post that already expired is expired, not scheduled",
  displayState({ status: "scheduled", publish_at: iso(1), expires_at: iso(-1) }, NOW), "expired");
// But a draft is a draft whatever its dates say — it never went out at all,
// which is the opposite claim from "it went out and came down".
check("a draft with a past expiry is still a draft",
  displayState({ status: "draft", expires_at: iso(-1) }, NOW), "draft");

// A row written before this migration has no status at all.
check("a row from before the migration is live",
  displayState({}, NOW), "live");
check("…and so is one with a null status", displayState({ status: null }, NOW), "live");

check("every state has a label",
  (["draft", "scheduled", "live", "expired"] as const).every((s) => Boolean(DISPLAY_LABELS[s])), true);
check("the three storable statuses are the three the constraint allows",
  [...ANNOUNCEMENT_STATUSES], ["draft", "scheduled", "published"]);

// An unparseable date must not silently publish something.
check("a scheduled post with an unreadable date stays scheduled",
  displayState({ status: "scheduled", publish_at: "not a date" }, NOW), "scheduled");
check("…and one with no date at all does too",
  displayState({ status: "scheduled", publish_at: null }, NOW), "scheduled");

// ── Targeting ───────────────────────────────────────────────────────────────

console.log("");

const AGENT = { id: "agent", roles: ["agent"], uplineChain: ["manager", "owner"] };
const MANAGER = { id: "manager", roles: ["manager"], uplineChain: ["owner"] };
const OUTSIDER = { id: "other", roles: ["agent"], uplineChain: ["owner"] };

// Everything written before targeting existed carries an empty array and a
// null upline, and must keep reaching everybody.
check("no targeting reaches everybody",
  [reaches({}, AGENT), reaches({}, MANAGER), reaches({}, OUTSIDER)], [true, true, true]);
check("…as does an explicitly empty target",
  reaches({ target_roles: [], target_upline_id: null }, AGENT), true);

check("a role target reaches that role",
  reaches({ target_roles: ["manager"] }, MANAGER), true);
check("…and nobody else", reaches({ target_roles: ["manager"] }, AGENT), false);
check("…matching any of several roles",
  reaches({ target_roles: ["manager", "agent"] }, AGENT), true);

check("a team target reaches somebody in that downline",
  reaches({ target_upline_id: "manager" }, AGENT), true);
// An announcement to a manager's team that the manager cannot see is not what
// anybody means by it.
check("…including the person it is aimed through",
  reaches({ target_upline_id: "manager" }, MANAGER), true);
check("…and not somebody outside it",
  reaches({ target_upline_id: "manager" }, OUTSIDER), false);

// Both together is the intersection: somebody who is neither was not the
// intended reader either way.
check("role and team together must both match",
  reaches({ target_roles: ["manager"], target_upline_id: "manager" }, AGENT), false);
check("…and both matching reaches them",
  reaches({ target_roles: ["manager"], target_upline_id: "manager" }, MANAGER), true);

// Visibility is both halves.
check("a targeted post that has expired reaches nobody",
  isVisibleTo({ status: "published", expires_at: iso(-1), target_roles: ["manager"] }, MANAGER, NOW),
  false);
check("a live untargeted post reaches everybody",
  isVisibleTo({ status: "published" }, OUTSIDER, NOW), true);

// ── Refusing before the round trip ──────────────────────────────────────────

console.log("");

check("scheduling with no date is refused",
  validate({ status: "scheduled" }, NOW),
  "Choose when this should go out, or save it as a draft.");
// Almost always a mistyped year, and publishing immediately is the surprising
// reading of it.
check("a schedule in the past is refused",
  Boolean(validate({ status: "scheduled", publishAt: iso(-1) }, NOW)), true);
check("a schedule in the future is fine",
  validate({ status: "scheduled", publishAt: iso(1) }, NOW), null);
check("an expiry already in the past is refused",
  Boolean(validate({ status: "published", expiresAt: iso(-1) }, NOW)), true);
check("an expiry before the publish time is refused",
  validate({ status: "scheduled", publishAt: iso(5), expiresAt: iso(2) }, NOW),
  "This would expire before it goes out.");
check("publishing now with no dates is fine",
  validate({ status: "published" }, NOW), null);
check("a draft needs no dates at all", validate({ status: "draft" }, NOW), null);
check("an unreadable date is refused rather than ignored",
  Boolean(validate({ status: "scheduled", publishAt: "soon" }, NOW)), true);

// ── What is owed a send ─────────────────────────────────────────────────────

console.log("");

const ROWS = [
  { id: "due", status: "scheduled", publish_at: iso(-1) },
  { id: "not-yet", status: "scheduled", publish_at: iso(3) },
  { id: "already", status: "scheduled", publish_at: iso(-2) },
  { id: "expired", status: "scheduled", publish_at: iso(-5), expires_at: iso(-1) },
];
check("only a post whose time has come is due",
  dueForDispatch(ROWS, new Set(["already"]), NOW).map((r) => r.id), ["due"]);
// The ledger is what makes calling this repeatedly safe.
check("…and one already delivered is not due again",
  dueForDispatch(ROWS, new Set(["due", "already"]), NOW).map((r) => r.id), []);
check("a post that expired before anybody sent it is not sent",
  dueForDispatch([ROWS[3]], new Set(), NOW).length, 0);

// ── The database enforces the same rule ─────────────────────────────────────

console.log("");

const MIG = sql(read("supabase/migrations/20260815010000_announcement-lifecycle-and-targeting.sql"));

// The three clauses this module implements, in the policy that actually
// enforces them. If the two drift, the product shows one thing and permits
// another.
check("the policy publishes on time without a job",
  /status = 'scheduled' and publish_at <= now\(\)/.test(MIG), true);
check("the policy expires without a job",
  /expires_at is null or expires_at > now\(\)/.test(MIG), true);
check("the policy filters by role",
  /cardinality\(target_roles\) = 0/.test(MIG), true);
check("…against the roles that person holds",
  /ur\.role::text = any \(target_roles\)/.test(MIG), true);
check("the policy filters by downline",
  /public\.is_in_downline\(target_upline_id, auth\.uid\(\)\)/.test(MIG), true);
check("…including the person it is aimed through",
  /target_upline_id = auth\.uid\(\)/.test(MIG), true);

// The author and the owner keep seeing everything, or "draft" would mean
// "published, but labelled draft" and an expired post would be unrecoverable.
check("the author still sees their own drafts",
  /created_by = auth\.uid\(\)/.test(MIG), true);
check("…and so does the owner",
  /public\.is_org_owner\(organization_id\)/.test(MIG), true);

// Constraints, so a nonsense schedule cannot be stored even by something that
// skips the TypeScript.
check("a scheduled row must carry a date",
  /check \(status <> 'scheduled' or publish_at is not null\)/.test(MIG), true);
check("an expiry must follow the publish time",
  /check \(expires_at is null or publish_at is null or expires_at > publish_at\)/.test(MIG), true);
check("the status list is constrained",
  /check \(status in \('draft', 'scheduled', 'published'\)\)/.test(MIG), true);

// Existing rows must keep behaving exactly as they do today.
check("targeting defaults to everybody",
  /target_roles text\[\] not null default '\{\}'/.test(MIG), true);
check("…and status defaults to published",
  /status text not null default 'published'/.test(MIG), true);

// ── The wiring ──────────────────────────────────────────────────────────────

console.log("");

const FNS = strip(read("src/lib/announcements.functions.ts"));

check("creating validates before writing", /const problem = validate\(\{/.test(FNS), true);
// Delivering a draft or a scheduled post immediately would make "schedule"
// mean "send now and pretend".
check("only a published post is delivered on create",
  /if \(data\.status === "published"\) \{/.test(FNS), true);
check("a draft can be published later", /export const updateAnnouncement/.test(FNS), true);
check("…and that send happens on the transition",
  /if \(data\.status === "published" && before\.status !== "published"\)/.test(FNS), true);
// A group sent to a parent and its children must not be live in one agency and
// expired in another.
check("a grouped post moves together",
  /q\.eq\("announcement_group_id", before\.announcement_group_id\)/.test(FNS), true);

check("there is a dispatch for posts that came due",
  /export const dispatchDueAnnouncements/.test(FNS), true);
check("…which skips anything already delivered",
  /const due = dueForDispatch\(scheduled as any\[\], delivered\)/.test(FNS), true);
check("…and degrades quietly before the migration",
  /if \(error\) return \{ dispatched: 0 \}/.test(FNS), true);

check("every send is audited", /recordAnnouncementAudit\(\{/.test(FNS), true);
check("…distinguishable from contracting rows",
  /record_type: "announcement"/.test(FNS), true);
// The post has already been saved by then.
check("…and a failed audit does not lose the post",
  /console\.error\("\[announcements\] audit write failed:"/.test(FNS), true);

// Taking a post down must not destroy the record that it went out.
check("expiring is an update, not a delete",
  /\.from\("announcements"\)\.delete\(\)/.test(FNS), false);

// ── The window before the migration is applied ──────────────────────────────
//
// `createAnnouncement` names five columns that do not exist yet, and PostgREST
// rejects the whole insert. Posting must not break — but quietly dropping a
// schedule would publish immediately to everybody, which is the opposite of
// what was asked for and cannot be taken back.

console.log("");

check("a missing column is recognised", /e\.code === "42703"/.test(FNS), true);
check("posting to everybody still works without the new columns",
  /\.from\("announcements"\)\.insert\(base\)\.select\("id, organization_id"\)/.test(FNS), true);
check("…and anything needing them is refused, not silently downgraded",
  /const wantsNewBehaviour =/.test(FNS), true);
check("…naming what is unavailable",
  /Scheduling, expiry and targeting aren't available on this database yet\./.test(FNS), true);
// Each of the five, or one of them slips through as a silent publish-to-all.
check("…covering every new field",
  [
    /data\.status !== "published"/.test(FNS),
    /Boolean\(data\.publishAt\)/.test(FNS),
    /Boolean\(data\.expiresAt\)/.test(FNS),
    /data\.targetRoles\.length > 0/.test(FNS),
    /Boolean\(data\.targetUplineId\)/.test(FNS),
  ],
  [true, true, true, true, true]);

// ── The scheduled dispatcher ────────────────────────────────────────────────
//
// In-app visibility needs nothing to run. Email and Discord need something to
// reach out, and until the cron route existed that only happened when an owner
// opened the page — so a post scheduled for 9am on a Monday reached Discord
// whenever somebody next visited.

console.log("");

const CRON = strip(read("src/routes/lovable/announcements/dispatch.ts"));
const DELIVER = strip(read("src/lib/announcements/deliver.server.ts"));

// The point of the whole arrangement: one implementation of "who gets told".
check("the dispatcher calls the shared delivery, not its own copy",
  /import \{ deliver, normalizeChannels \} from "@\/lib\/announcements\/deliver\.server"/.test(CRON),
  true);
check("…which the interactive path also calls",
  /import \{ deliver \} from "@\/lib\/announcements\/deliver\.server"/.test(FNS), true);
// If deliver() closed over its own client, the route could not supply one.
check("…and takes its database client as an argument",
  /export async function deliver\(opts: \{[\s\S]{0,120}?db: any;/.test(DELIVER), true);
check("…with no module-level client left in it",
  /supabaseAdmin/.test(DELIVER), false);

// Cron has no session, so this cannot be the user-facing server function.
check("the route authenticates with the service role key",
  /authHeader\.slice\("Bearer "\.length\)\.trim\(\) !== supabaseServiceKey/.test(CRON), true);
check("…refusing an unsigned call", /return Response\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\)/.test(CRON), true);
check("…and a wrong one", /return Response\.json\(\{ error: "Forbidden" \}, \{ status: 403 \}\)/.test(CRON), true);

// Every agency, not one caller's.
check("the route covers every agency",
  /\.eq\("status", "scheduled"\)/.test(CRON) && !/organization_id", orgId/.test(CRON), true);
check("…oldest first, so a backlog drains in order",
  /\.order\("publish_at", \{ ascending: true \}\)/.test(CRON), true);
check("…bounded per run", /\.limit\(MAX_PER_RUN\)/.test(CRON), true);

// Repeated runs must be free.
check("the ledger decides what is still owed",
  /const due = dueForDispatch\(rows, delivered\)/.test(CRON), true);
// A stored flag would reintroduce the drift the derived design avoids.
check("…and no delivery flag is written back to announcements",
  /\.from\("announcements"\)\.update\(/.test(CRON), false);

// One agency's webhook must not stop the rest of the run.
check("a single failure does not abort the batch",
  /failures\.push\(\{ id: row\.id, error: e\?\.message \?\? "unknown" \}\)/.test(CRON), true);
check("…and failures are named, not just counted",
  /failures: failures\.slice\(0, 10\)/.test(CRON), true);

// Before the migration there is no status column at all.
check("an unmigrated database is reported, not a 500",
  /reason: "not_migrated"/.test(CRON), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
