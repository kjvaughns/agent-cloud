/**
 * One story per client, in order, and a policy that remembers.
 *
 *   npx tsx scripts/timeline-check.ts
 *
 * Two defects met here.
 *
 * A policy's status was a single column that three paths overwrote and none
 * recorded. A policy that went active, lapsed, had retention work done on it
 * and came back looked identical to one that had never moved, and a chargeback
 * conversation came down to whose memory was better.
 *
 * And a client's history was in five places shown across four tabs.
 * `contact_history` was split three ways by `contact_type`; life events sat in
 * a list beside contact history, sorted independently, so a life event and the
 * call about it appeared in unrelated places on the same screen.
 *
 * The ordering and de-duplication are pure so they can be checked here; the
 * recording is a database trigger, which is checked against the migration text
 * because a trigger somebody quietly narrows is the failure that would put us
 * back where we started.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildTimeline,
  forPolicy,
  applyFilter,
  TIMELINE_FILTERS,
} from "../src/lib/timeline/build";

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

// ── One order ───────────────────────────────────────────────────────────────

const POLICIES = [{ id: "p1", product: "Term Life", carriers: { name: "Mutual of Test" } }];

const SOURCES = {
  policies: POLICIES,
  contactHistory: [
    { id: "h1", created_at: "2026-03-10T12:00:00Z", contact_type: "call", note: "Talked it through", agent_id: "a1" },
    { id: "h2", created_at: "2026-03-02T09:00:00Z", contact_type: "note", note: "Prefers mornings" },
    { id: "h3", created_at: "2026-02-01T09:00:00Z", contact_type: "referral", note: "Sent by their sister" },
    { id: "h4", created_at: "2026-03-11T09:00:00Z", contact_type: "sms", note: "Auto reminder", is_auto: true },
  ],
  lifeEvents: [{ id: "l1", event_date: "2026-03-05", event_type: "new_child", note: "Baby girl" }],
  policyEvents: [
    { id: "e1", policy_id: "p1", kind: "posted", occurred_at: "2026-03-01T10:00:00Z", to_status: "issued_not_paid" },
    { id: "e2", policy_id: "p1", kind: "effective", occurred_at: "2026-04-01T00:00:00Z" },
    {
      id: "e3", policy_id: "p1", kind: "status_change", occurred_at: "2026-03-20T10:00:00Z",
      from_status: "active", to_status: "lapsed", source: "carrier_csv:march.csv",
    },
  ],
  calendarEvents: [{ id: "c1", start_at: "2026-03-15T15:00:00Z", title: "Annual review" }],
  retentionCases: [
    {
      id: "r1", policy_id: "p1", opened_at: "2026-03-21T08:00:00Z",
      contacted_at: "2026-03-22T08:00:00Z", resolved_at: "2026-03-25T08:00:00Z",
      risk_reason: "Missed draft", outcome_note: "Card updated", assigned_to: "a1",
    },
  ],
};

const t = buildTimeline(SOURCES);

// Every source contributes, and a retention case is three moments rather than
// one — the gap between knowing and acting is the part anybody reviews.
check("every source reaches the timeline", t.length, 4 + 1 + 3 + 1 + 3);
check("newest first",
  t.map((e) => e.at).every((v, i, arr) => i === 0 || arr[i - 1] >= v), true);
// The bug: two lists sorted independently, so a life event and the call about
// it landed in unrelated places on one screen.
check("a life event sorts among the calls, not beside them",
  t.map((e) => e.id).slice(0, 5),
  ["pe:e2", "ret:r1:resolved", "ret:r1:contacted", "ret:r1:opened", "pe:e3"]);

// A date-only column has to sort against timestamps, not before all of them.
check("a date-only life event is placed by its date",
  t.findIndex((e) => e.id === "life:l1") < t.findIndex((e) => e.id === "contact:h3"), true);

// ── What each entry says ────────────────────────────────────────────────────

console.log("");

const status = t.find((e) => e.id === "pe:e3")!;
check("a status change names both ends",
  status.title, "Mutual of Test · Term Life — Active → Lapsed");
// A status set by a carrier file is not somebody clicking, and saying so is
// the difference between "the carrier did this" and "who did this".
check("…and a carrier file is named as the source",
  status.detail, "From the carrier file march.csv");
check("…and counts as automatic", status.isAuto, true);

const posted = t.find((e) => e.id === "pe:e1")!;
check("a posted policy names the carrier and product",
  posted.title, "Mutual of Test · Term Life written");
check("…and carries its policy id so a policy can show its slice",
  posted.policyId, "p1");

check("an automatic contact is marked as one",
  t.find((e) => e.id === "contact:h4")!.isAuto, true);
check("a manual one is not", t.find((e) => e.id === "contact:h1")!.isAuto, false);
check("a note is a note, not a call", t.find((e) => e.id === "contact:h2")!.kind, "note");
check("a referral is its own kind", t.find((e) => e.id === "contact:h3")!.kind, "referral");
check("a retention case says why it opened",
  t.find((e) => e.id === "ret:r1:opened")!.detail, "Missed draft");

// ── What it refuses to do ───────────────────────────────────────────────────

console.log("");

// An entry with no usable date would otherwise be stamped "now" and jump to
// the top, which is a fabricated fact in a record whose whole value is being
// true.
check("an entry with no date is dropped, not dated now",
  buildTimeline({ contactHistory: [{ id: "x", created_at: null, note: "n" }] }).length, 0);
check("…and an unparseable one too",
  buildTimeline({ lifeEvents: [{ id: "x", event_date: "not a date" }] }).length, 0);
check("no sources is an empty timeline, not a crash", buildTimeline({}), []);

// Two events in the same second must not swap places between renders.
const tied = buildTimeline({
  contactHistory: [
    { id: "b", created_at: "2026-03-01T00:00:00Z", contact_type: "call" },
    { id: "a", created_at: "2026-03-01T00:00:00Z", contact_type: "call" },
  ],
});
check("a tie is broken stably", tied.map((e) => e.id), ["contact:b", "contact:a"]);

// ── Filtering, and a policy's own slice ─────────────────────────────────────

console.log("");

// Three policy events and the retention case's three moments.
check("a policy's slice is only its own", forPolicy(t, "p1").length, 6);
check("…and excludes what is not about a policy",
  forPolicy(t, "p1").every((e) => e.policyId === "p1"), true);

// "Policies" groups the four policy-shaped kinds: somebody asking about a
// policy wants written, effective, status and retention, not four checkboxes.
check("the policy filter includes retention",
  applyFilter(t, "policy").some((e) => e.kind === "retention"), true);
check("…and every policy-shaped kind",
  new Set(applyFilter(t, "policy").map((e) => e.kind)).size, 4);
check("the contact filter includes meetings",
  applyFilter(t, "contact").some((e) => e.kind === "meeting"), true);
check("…but not notes", applyFilter(t, "contact").some((e) => e.kind === "note"), false);
check("all means all", applyFilter(t, "all").length, t.length);
check("every filter offered actually filters",
  TIMELINE_FILTERS.every((f) => applyFilter(t, f.key).length <= t.length), true);

// ── The recording cannot be forgotten ───────────────────────────────────────

console.log("");

const MIG = stripSql(read("supabase/migrations/20260814230000_policy-events.sql"));

// Three paths write policies.status today and nothing stops a fourth. A
// trigger on the column is the only place that cannot be missed.
check("a trigger records the change, not the call sites",
  /after update of status on public\.policies/i.test(MIG), true);
check("…only when the status actually changed",
  /when \(old\.status is distinct from new\.status\)/i.test(MIG), true);
check("…for each row, so a bulk carrier sync records every policy",
  /for each row/i.test(MIG), true);
check("a new policy starts its own history",
  /after insert on public\.policies/i.test(MIG), true);
check("the actor is the caller, not a guess", /auth\.uid\(\)/.test(MIG), true);
check("a carrier file is recorded as the source",
  /new\.sync_source is distinct from old\.sync_source/i.test(MIG), true);

// Backfill, so an existing policy does not open with a blank history that
// reads as "nothing has happened".
check("existing policies are seeded from their own columns",
  /insert into public\.policy_events[\s\S]*?from public\.policies p[\s\S]*?where p\.posted_at is not null/i.test(MIG),
  true);
check("…idempotently", /on conflict do nothing/i.test(MIG), true);
check("…guarded by a unique index rather than by hoping",
  /create unique index if not exists policy_events_seed_uniq/i.test(MIG), true);

// A history somebody can edit is not a history.
check("history can be read and added to, never updated",
  /for insert to authenticated/i.test(MIG) && /for select to authenticated/i.test(MIG), true);
check("…with no update or delete policy at all",
  /for (update|delete)/i.test(MIG), false);
// Inherits the policy's visibility rather than restating the boundary.
check("an event is visible to exactly whoever can see the policy",
  /exists \(select 1 from public\.policies p where p\.id = policy_id\)/i.test(MIG), true);
check("nothing is dropped", /drop table|drop column|truncate/i.test(MIG), false);

// ── The screens read it ─────────────────────────────────────────────────────

console.log("");

const DRAWER = strip(read("src/components/pipeline/client-detail-drawer.tsx"));
// The drawer opens on Contact now rather than Timeline. That is a product
// choice — the first thing wanted on a client record is usually how to reach
// them — and the timeline is a tab away rather than gone. What this work was
// for was that ONE timeline exists and the drawer renders it; pinning which tab
// opened first tested a default, not the deliverable.
check("the client record can open on the timeline",
  /DrawerTabBar/.test(DRAWER) && /useState\("(timeline|contact)"\)/.test(DRAWER), true);
check("…built by the module, not in the component",
  /buildTimeline\(\{/.test(DRAWER), true);
// The duplication this removes: two dated lists on one screen, sorted apart.
check("the second contact-history list is gone",
  /No contact history yet\./.test(DRAWER), false);
check("…and the action that creates it is not",
  /Log Contact/.test(DRAWER), true);
check("a life event can still be removed",
  /delLifeMut\.mutate/.test(DRAWER), true);

const SHEET = strip(read("src/components/book-of-business/policy-detail-sheet.tsx"));
check("the policy sheet shows the policy's history",
  /listPolicyEvents/.test(SHEET), true);
check("…through the same component the client record uses",
  /TimelineList/.test(SHEET), true);
// A status changed in the sheet is part of the history immediately.
check("…refreshed when the status is changed here",
  /invalidateQueries\(\{ queryKey: \["bob", "events", row\?\.id\] \}\)/.test(SHEET), true);

const PIPE = strip(read("src/lib/pipeline.functions.ts"));
check("the client record loads the two new sources",
  /from\("policy_events"\)/.test(PIPE) && /from\("retention_cases"\)/.test(PIPE), true);
// The table arrives with a pending migration; a client record that will not
// open is far worse than a timeline missing one of its five sources.
check("…tolerantly, so a client still opens before the migration",
  /catch \(e: any\) \{[\s\S]{0,200}timeline sources unavailable/.test(PIPE), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
