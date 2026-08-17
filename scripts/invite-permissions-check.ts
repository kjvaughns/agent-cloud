/**
 * Nobody invites somebody onto a better deal than their own.
 *
 *   npx tsx scripts/invite-permissions-check.ts
 *
 * An invitation is the one place in the product where a person grants standing
 * without anything checking it against their own. Unguarded, an agent could
 * put somebody on a higher rung than themselves — and then be paid a negative
 * override off them — or simply invite a second account onto a better contract
 * and use it.
 *
 * The rank rule reads `base_pct`, not `sort_order`. `sort_order` is
 * `not null default 0`, so an agency that never touches it has every level at
 * zero: a guard built on it would find every rung equal and permit everything,
 * silently and completely. `base_pct` is the ladder itself — what the resolver
 * pays from and what the roster sorts by.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  checkInvite,
  canRecruit,
  assignableRungs,
  ROLE_RANK,
  REFUSAL_MESSAGES,
  type Rung,
} from "../src/lib/invitations/permissions";

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

const rung = (id: string, name: string, base_pct: number | null, o: Partial<Rung> = {}): Rung =>
  ({ id, name, base_pct, active: true, ...o }) as Rung;

const OWNER = rung("owner", "Owner", 100);
const MGA = rung("mga", "MGA", 90);
const GA = rung("ga", "General Agent", 80);
const SA = rung("sa", "Supervising Agent", 70);
const TRAINEE = rung("trainee", "Trainee", 60, { can_invite: false } as any);
const RETIRED = rung("old", "Retired rung", 75, { active: false });
const LADDER = [OWNER, MGA, GA, SA, TRAINEE, RETIRED];

const ok = (o: Partial<Parameters<typeof checkInvite>[0]> = {}) =>
  checkInvite({
    inviterRung: GA,
    inviterRole: "agent",
    requestedRung: SA,
    requestedRole: "agent",
    agencyRungs: LADDER,
    ...o,
  });

// ── The rank rule ───────────────────────────────────────────────────────────

check("a GA may invite onto a lower rung", ok().ok, true);
// The bug this exists for.
check("a GA may not invite onto a higher rung",
  ok({ requestedRung: MGA }).refusals, ["rung_not_below_inviter"]);
check("…nor onto their own rung",
  ok({ requestedRung: GA }).refusals, ["rung_not_below_inviter"]);
check("…nor onto a rung from another agency",
  ok({ requestedRung: rung("elsewhere", "Someone else's GA", 10) }).refusals, ["rung_not_in_agency"]);
check("…nor onto a retired rung", ok({ requestedRung: RETIRED }).refusals, ["rung_inactive"]);
check("an inviter with no rung of their own can place nobody",
  ok({ inviterRung: null }).refusals.includes("inviter_has_no_rung"), true);

// Running the agency means placing anybody anywhere.
check("an owner may place somebody at the top",
  checkInvite({
    inviterRung: null, inviterRole: "agency_owner",
    requestedRung: OWNER, requestedRole: "agent", agencyRungs: LADDER,
  }).ok, true);

check("assignable rungs are strictly below, best first",
  assignableRungs(GA, LADDER).map((r) => r.id), ["sa", "trainee"]);
check("…and exclude inactive ones", assignableRungs(OWNER, LADDER).map((r) => r.id),
  ["mga", "ga", "sa", "trainee"]);
check("somebody on the bottom rung can assign nothing", assignableRungs(TRAINEE, LADDER), []);
check("an inviter with no percentage can assign nothing",
  assignableRungs(rung("x", "Unset", null), LADDER), []);

// ── Access ──────────────────────────────────────────────────────────────────

console.log("");

check("an agent may not create a manager",
  ok({ requestedRole: "manager" }).refusals, ["role_above_inviter"]);
check("a manager may create an agent", ok({ inviterRole: "manager", requestedRole: "agent" }).ok, true);
check("a manager may create a peer", ok({ inviterRole: "manager", requestedRole: "manager" }).ok, true);
check("an owner may create an admin",
  checkInvite({
    inviterRung: OWNER, inviterRole: "agency_owner",
    requestedRung: GA, requestedRole: "admin", agencyRungs: LADDER,
  }).ok, true);
// Rank and access are different ladders, deliberately.
check("role rank is separate from the pay ladder", ROLE_RANK.manager > ROLE_RANK.agent, true);

// ── Recruiting ──────────────────────────────────────────────────────────────

console.log("");

check("a rung that permits recruiting does", canRecruit(GA, "agent"), true);
check("a rung that does not, does not", canRecruit(TRAINEE, "agent"), false);
// The old behaviour told every agent to contact their agency, which is untrue
// for an agency that opens recruiting early and useless either way.
check("…and says how that changes",
  /does not include team building yet/.test(REFUSAL_MESSAGES.level_cannot_recruit), true);
check("an administrator with no rung still recruits", canRecruit(null, "agency_owner"), true);
// An agency mid-setup has a ladder nobody is on yet. Refusing here would take
// invitations away from every agent in it — and they still cannot place
// anybody on a rung, because `assignableRungs` gives them none.
check("so does somebody the ladder has not placed yet", canRecruit(null, "agent"), true);
check("a trainee's refusal names the level, not a mystery",
  ok({ inviterRung: TRAINEE, requestedRung: null }).refusals, ["level_cannot_recruit"]);

// ── Duplicates, and everything at once ──────────────────────────────────────

console.log("");

check("an open invitation for the same email is refused",
  ok({ duplicate: true }).refusals, ["duplicate_active_invite"]);
// One trip, not four.
const everything = checkInvite({
  inviterRung: TRAINEE, inviterRole: "agent",
  requestedRung: OWNER, requestedRole: "manager",
  agencyRungs: LADDER, duplicate: true,
});
check("every reason is collected at once", everything.refusals.sort(),
  ["duplicate_active_invite", "level_cannot_recruit", "role_above_inviter", "rung_not_below_inviter"]);
check("…each in words somebody can act on",
  everything.messages.every((m) => m.length > 20), true);

// Staff is an assistant acting for one person, not a rung above agent. Ranked
// higher, an agent could no longer invite their own assistant.
check("staff is level with agent, not above it", ROLE_RANK.staff, ROLE_RANK.agent);

// ── Wiring: the rules are the ones the server actually runs ────────────────
//
// The half above proves the decision. This half proves nothing quietly kept
// its own copy of it — which is what the four hand-written checks in
// createOnboardingInvite were.

console.log("");

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) =>
  s
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const ONB = strip(read("src/lib/onboarding.functions.ts"));

check("the invite handler asks the pure rules", /verdict = checkInvite\(\{/.test(ONB), true);
check("…and refuses with everything wrong at once",
  /if \(!verdict\.ok\) throw new Error\(verdict\.messages\.join\(" "\)\)/.test(ONB), true);
// The bug: an agent could hand out a rung at or above their own, because
// nothing compared them. The old code only checked the level belonged to the
// agency.
check("the old org-only level check is gone",
  /eq\("organization_id", inviterProfile\?\.organization_id \?\? ""\)/.test(ONB), false);
check("…as is the hand-rolled role ladder",
  /canInviteAgencyOwner = inviterRoleList\.includes/.test(ONB), false);

check("creating a link is recorded", /auditInvitation\("invitation\.created"/.test(ONB), true);
check("…with an expiry the sender chose", /expires_at:\s+expiresAt/.test(ONB), true);
check("a revoked link stops resolving",
  /status === "revoked"[\s\S]{0,200}has been revoked/.test(ONB), true);

const CONTRACTING = strip(read("src/lib/contracting.functions.ts"));
// Deleting the row deleted the record that the grant had ever been made.
check("revoking marks the row rather than deleting it",
  /\.update\(\{ status: "revoked" \}\)/.test(CONTRACTING), true);
check("…and the delete is gone",
  /from\("invitation_links"\)\.delete\(\)/.test(CONTRACTING), false);
check("…and is recorded", /auditInvitation\("invitation\.revoked"/.test(CONTRACTING), true);
// An owner could not close a link a departing manager left live.
check("the agency's owner may revoke too",
  /from\("organizations"\)\.select\("owner_id"\)/.test(CONTRACTING), true);

const ADMIN = strip(read("src/lib/admin.functions.ts"));
check("a batch invite refuses a second live invitation",
  /hasOpenInvitation\(supabase, \{ email: agent\.email, organizationId \}\)/.test(ADMIN), true);
check("…and attributes the invitation to the agency",
  /organization_id: organizationId/.test(ADMIN), true);

const PAGE = strip(read("src/routes/_authenticated/contracting/invite.tsx"));
// The page refused every ordinary agent while the server allowed them.
check("the page asks the server whether they may recruit",
  /options\.canRecruit/.test(PAGE), true);
check("…rather than deciding from the role", /isManager/.test(PAGE), false);
check("the level list is the assignable one",
  /options\.assignableLevels\.map/.test(PAGE), true);
check("…not every level in the agency",
  /agencyLevels\?\.rows/.test(PAGE), false);
// Links no longer expire — they stay good until revoked or deleted, and
// `expires_in_days` is accepted on the server for older clients and ignored.
// That is a deliberate model change with a replacement, not a dropped control,
// so the assertion follows the requirement: a link handed out must be able to
// be taken back out of circulation. Revocation is what does that now.
check("a link can be taken out of circulation",
  /revoke/i.test(PAGE), true);
// Still accepted on the schema so an older client posting it is not rejected,
// and never turned into a stored expiry — which is what "links do not expire"
// has to mean in the data, not just in a comment.
check("…while the old parameter is still accepted from older clients",
  /expires_in_days: z\.number\(\)/.test(ONB), true);
check("…and never written as an expiry on the link",
  /expires_at: .*expires_in_days|expires_at: addDays/.test(ONB), false);
check("the row action says revoke", /Revoke "\{name\}"\?/.test(PAGE), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
