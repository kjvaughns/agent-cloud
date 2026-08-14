/**
 * A notification preference somebody sets is a preference the product keeps.
 *
 *   npx tsx scripts/notify-prefs-check.ts
 *
 * The notifications screen offers seven categories to switch off.
 * `public.may_notify(profile, category)` exists to enforce them, and the email
 * sender has consulted it since it shipped.
 *
 * In-app notifications did not. Eleven writers inserted into `notifications`
 * across contracting, the transfer flow, tasks, SureLC and billing, and
 * exactly two — the invite path and announcements — asked first. So an agent
 * who turned "Contracting updates" off, a switch whose own description reads
 * "Carrier appointments, level changes, transfers", kept receiving every
 * carrier-request status change, every hierarchy decision and every transfer.
 * The switch changed nothing.
 *
 * That is the same defect as a dead toggle, on the one screen a person opens
 * specifically to be left alone.
 *
 * ── What this deliberately does not claim ──
 *
 * Not every writer was converted, and the ones left are named below. Case
 * design, book import, the "team member not on Agent Cloud" nudge and the
 * platform's own white-label sales alert have no category on the screen, and
 * inventing one — or filing them under a category whose description does not
 * describe them — would be a worse answer than leaving them direct. The rule
 * this enforces is narrower and checkable: every writer whose category exists
 * must use it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NOTIFICATION_CATEGORIES } from "../src/lib/notification-prefs.functions";

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

const NOTIFY = read("src/lib/notify.server.ts");

// ── The helper ──────────────────────────────────────────────────────────────

check("there is one way to send an in-app notification",
  /export async function notifyPeople/.test(NOTIFY), true);
check("…which asks the preference", /rpc\("may_notify"/.test(NOTIFY), true);
// A missing function, an absent row or an error must not silence somebody.
// The preference defaults to on, and nobody reports a notification they never
// knew was coming.
check("…and only an explicit refusal silences",
  /data === false \? null : id/.test(NOTIFY), true);
check("…never throwing at its caller",
  /catch \(e: any\) \{[\s\S]{0,120}console\.error\("\[notify\] failed/.test(NOTIFY), true);
check("…and telling the caller how many were reached",
  /Promise<number>/.test(NOTIFY), true);
// Somebody should not be notified about a thing they did themselves.
check("…with a way to exclude the actor", /exceptUserId/.test(NOTIFY), true);

// Every category the helper accepts is a category the screen offers.
const OFFERED = NOTIFICATION_CATEGORIES.map((c) => c.key.replace(/^notify_/, "")).sort();
const ACCEPTED = Array.from(NOTIFY.matchAll(/^\s*\| "([a-z_]+)";?$/gm)).map((m) => m[1]).sort();
check("the helper's categories are the screen's categories", ACCEPTED, OFFERED);

// ── Every writer with a category uses it ────────────────────────────────────

console.log("");

// Contracting is the category whose description — "Carrier appointments,
// level changes, transfers" — matches the largest group of writers, and none
// of them honoured it.
const CONVERTED: [string, string][] = [
  ["the carrier-request status notifier", "src/lib/contracting-ops.functions.ts"],
  ["the hierarchy change workflow", "src/lib/contracting-workflow.functions.ts"],
  ["document and PDB rejections", "src/lib/contracting-records.functions.ts"],
  ["new carrier requests and transfers", "src/lib/contracting.functions.ts"],
  ["the transfer request flow", "src/lib/transfer-requests.functions.ts"],
  ["task assignment", "src/lib/tasks.functions.ts"],
  ["the SureLC approval sync", "src/lib/surelc.functions.ts"],
  ["billing and Nova Pro", "src/lib/billing.functions.ts"],
];

for (const [label, path] of CONVERTED) {
  const src = strip(read(path));
  check(`${label} goes through the helper`, /notifyPeople\(/.test(src), true);
  // The thing that must not come back: a direct insert beside a converted one
  // is how half a module ends up honouring the preference.
  check(`…with no direct insert left`, /from\("notifications"\)\s*\.?\s*\.insert/.test(src), false);
}

// ── Categories are the right ones ───────────────────────────────────────────

console.log("");

const TASKS = strip(read("src/lib/tasks.functions.ts"));
check("a task assignment uses the task category",
  /category: "task_assigned"/.test(TASKS), true);
const BILLING = strip(read("src/lib/billing.functions.ts"));
check("billing uses the billing category", /category: "billing"/.test(BILLING), true);
check("…for every one of its in-app notices",
  (BILLING.match(/notifyPeople\(supabaseAdmin, \{/g) ?? []).length, 3);
const OPS = strip(read("src/lib/contracting-ops.functions.ts"));
check("a carrier-request status change is a contracting update",
  /category: "contract_updates"/.test(OPS), true);

// The org-level switch and the person's switch are different questions and
// both still apply.
check("the agency's own switch is still checked first",
  /notify_on_status_change/.test(OPS), true);

// ── What was deliberately left ──────────────────────────────────────────────

console.log("");

// Named rather than silently skipped. Each of these has no category on the
// notifications screen, and filing them under one whose description does not
// describe them would be worse than leaving them direct.
for (const [label, path] of [
  ["case design", "src/lib/back-office.functions.ts"],
  ["book import", "src/lib/admin-import.functions.ts"],
  ["the platform's white-label sales alert", "src/lib/white-label.functions.ts"],
  ["the missing-team-member nudge", "src/lib/import-helpers.ts"],
] as const) {
  check(`${label} has no category on the screen`,
    OFFERED.some((c) => strip(read(path)).includes(`category: "${c}"`)), false);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
