/**
 * An agency owner can place anybody in their agency, and an upline their own.
 *
 *   npx tsx scripts/position-assignment-check.ts
 *
 * ── The report ──
 *
 * "An agent in my agency I'm trying to assign him a level but since he's under
 * someone else it's not letting me." The refusal read **"That agent is not in
 * your agency."** He was on the roster, two rows above the message.
 *
 * ── Four sources, and only one of them is on the screen ──
 *
 * The question "is this agent in my agency" has four answers in this codebase:
 *
 *   get_team_downline          walks `upline_id`, NO organisation filter
 *   is_in_downline             walks `upline_id`, filtered on org matching
 *   organization_memberships   the membership table
 *   profiles.organization_id   a denormalised copy of that table
 *
 * The roster is built from the FIRST. This guard consulted the LAST, and was
 * then "fixed" to consult the third — and refused the same agent both times,
 * because he has no membership row and a null copy while being perfectly
 * reachable through `upline_id`. Two wrong answers to a question the screen had
 * already answered correctly.
 *
 * The rule is now the screen: if the roster lists them, they are placeable.
 * Sharing an agency by membership or by column is a union on top, for an owner
 * placing somebody who is not under them at all.
 *
 * Two more faults sat behind the first:
 *
 *   * `profiles_org_manage` grants writes on `organization_id IS NOT NULL AND
 *     is_org_owner(organization_id)`. On a null copy that refuses the OWNER, on
 *     their own agency.
 *   * That policy named the owner and nobody else, so an upline could never
 *     place their own downline whatever the product said.
 *
 * The decision is a module so it can be exercised without a database, and so
 * the rung ceiling can be the same one invitations already enforce rather than
 * a second opinion about the same money.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  checkAssignment, assignableFor, ASSIGN_REFUSAL_MESSAGES,
} from "../src/lib/team/position-assignment";
import type { Rung } from "../src/lib/invitations/permissions";

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
  s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const rung = (id: string, name: string, base_pct: number | null, o: Partial<Rung> = {}): Rung =>
  ({ id, name, base_pct, active: true, ...o }) as Rung;

const RGA = rung("rga", "RGA", 100);
const BROKERAGE = rung("brok", "Brokerage Agent", 60);
const TRAINING = rung("train", "Training Agent", 50);
const RETIRED = rung("old", "Retired", 70, { active: false });
const LADDER = [RGA, BROKERAGE, TRAINING, RETIRED];

const owner = { isOwner: true, isPlatformAdmin: false, canManageLevels: false, ownRung: RGA };
const upline = { isOwner: false, isPlatformAdmin: false, canManageLevels: false, ownRung: BROKERAGE };
const bystander = { isOwner: false, isPlatformAdmin: false, canManageLevels: false, ownRung: BROKERAGE };

const inAgency = { inAgency: true, isMyDownline: false };
const myDownline = { inAgency: true, isMyDownline: true };

// ── The bug, stated ─────────────────────────────────────────────────────────

// The exact case: an owner, an agent in the agency, sitting under somebody else.
check("an owner may place an agent who is under somebody else",
  checkAssignment({ actor: owner, target: inAgency, rung: TRAINING, agencyRungs: LADDER }).ok, true);
// Being the top of the ladder does not restrict what an owner may hand out —
// they are who decides the ladder.
check("…on any active rung, including their own",
  checkAssignment({ actor: owner, target: inAgency, rung: RGA, agencyRungs: LADDER }).ok, true);
check("…and may take somebody off a position entirely",
  checkAssignment({ actor: owner, target: inAgency, rung: null, agencyRungs: LADDER }).ok, true);

// The other half of the report: the upline could not do it either.
check("an upline may place their own downline",
  checkAssignment({ actor: upline, target: myDownline, rung: TRAINING, agencyRungs: LADDER }).ok, true);
// The ceiling invitations already enforce. Promoting somebody onto a better
// contract than your own is the same money as inviting them onto one.
check("…but not onto a rung at or above their own",
  checkAssignment({ actor: upline, target: myDownline, rung: RGA, agencyRungs: LADDER }).refusals,
  ["rung_not_below_yours"]);
check("…nor onto their own rung",
  checkAssignment({ actor: upline, target: myDownline, rung: BROKERAGE, agencyRungs: LADDER }).refusals,
  ["rung_not_below_yours"]);
// Somebody in the same agency who is neither above them nor an administrator.
check("a peer may not place somebody who is not theirs",
  checkAssignment({ actor: bystander, target: inAgency, rung: TRAINING, agencyRungs: LADDER }).refusals,
  ["not_yours_to_place"]);
check("…and is told who can",
  /agency owner, or anyone with permission to manage levels/.test(
    ASSIGN_REFUSAL_MESSAGES.not_yours_to_place), true);

// Curating the ladder is the same standing as owning it, for this purpose.
const curator = { isOwner: false, isPlatformAdmin: false, canManageLevels: true, ownRung: TRAINING };
check("somebody who manages levels may place anybody in the agency",
  checkAssignment({ actor: curator, target: inAgency, rung: RGA, agencyRungs: LADDER }).ok, true);

// ── Membership is the one thing nothing overrides ───────────────────────────

console.log("");

check("an agent outside the agency is refused",
  checkAssignment({
    actor: owner, target: { inAgency: false, isMyDownline: false },
    rung: TRAINING, agencyRungs: LADDER,
  }).refusals, ["not_in_agency"]);
// Even for a platform admin: a cross-agency write is not an administration
// convenience, it is the tenancy boundary.
check("…including for a platform admin",
  checkAssignment({
    actor: { isOwner: false, isPlatformAdmin: true, canManageLevels: true, ownRung: null },
    target: { inAgency: false, isMyDownline: false },
    rung: TRAINING, agencyRungs: LADDER,
  }).ok, false);
// And it short-circuits: listing the rung problems of somebody you may not
// touch tells them how to fix the wrong thing.
check("…and nothing else is reported alongside it",
  checkAssignment({
    actor: bystander, target: { inAgency: false, isMyDownline: false },
    rung: RGA, agencyRungs: LADDER,
  }).refusals.length, 1);

// ── The rung itself ─────────────────────────────────────────────────────────

console.log("");

check("a rung from another agency is refused",
  checkAssignment({
    actor: owner, target: inAgency,
    rung: rung("elsewhere", "Someone else's", 90), agencyRungs: LADDER,
  }).refusals, ["rung_not_in_agency"]);
check("a retired rung is refused",
  checkAssignment({ actor: owner, target: inAgency, rung: RETIRED, agencyRungs: LADDER }).refusals,
  ["rung_inactive"]);
check("…and says how to make it usable again",
  /Levels ▸ Positions|Levels & Positions|Levels and Positions/.test(
    ASSIGN_REFUSAL_MESSAGES.rung_inactive), true);
// Every reason at once, the way checkInvite and resolveCompensation do it.
check("more than one problem is reported together",
  checkAssignment({
    actor: bystander, target: inAgency, rung: RETIRED, agencyRungs: LADDER,
  }).refusals.sort(), ["not_yours_to_place", "rung_inactive"]);

// ── What to offer ───────────────────────────────────────────────────────────

console.log("");

check("an owner is offered every active rung, best first",
  assignableFor(owner, LADDER).map((r) => r.id), ["rga", "brok", "train"]);
check("…never a retired one", assignableFor(owner, LADDER).some((r) => r.id === "old"), false);
check("an upline is offered only what is below them",
  assignableFor(upline, LADDER).map((r) => r.id), ["train"]);
// Rendered as an absent control rather than an empty dropdown: an empty list of
// choices reads as a fault, and this is a boundary.
check("somebody on the bottom rung is offered nothing",
  assignableFor({ ...upline, ownRung: TRAINING }, LADDER), []);

// ── The server runs these rules, on the real membership table ───────────────

console.log("");

const TEAM = strip(read("src/lib/team.functions.ts"));

check("the server asks the module rather than comparing two strings",
  /const verdict = checkAssignment\(\{/.test(TEAM), true);
check("…and refuses with everything wrong at once",
  /if \(!verdict\.ok\) throw new Error\(verdict\.messages\.join\(" "\)\)/.test(TEAM), true);

// ── The guard asks the same question the screen answered ────────────────────
//
// Four sources answer "is this agent in my agency" and they do not agree:
//
//   get_team_downline          walks upline_id, NO organisation filter
//   is_in_downline             walks upline_id, filtered on org matching
//   organization_memberships   the membership table
//   profiles.organization_id   a denormalised copy of that table
//
// The roster is built from the FIRST. This guard was wrong twice by consulting
// the others — the denormalised copy, then the membership table — and both
// times refused an agent who was visible on the roster two rows above the
// error. Consulting anything but the roster's own source guarantees a refusal
// that contradicts what the person is looking at.

check("placeability comes from the same RPC the roster is built from",
  /supabase\.rpc\("get_team_downline"\)/.test(TEAM), true);
check("…on the RLS-bound client, because it keys on auth.uid()",
  /const \{ data: downlineRows \} = await supabase\.rpc/.test(TEAM), true);
// Under the service role `auth.uid()` is null and the RPC returns nobody, which
// would refuse everyone — the same class of mistake one layer down.
check("…not the service-role client",
  /admin\.rpc\("get_team_downline"\)/.test(TEAM), false);
// `is_in_downline` filters on the org matching, so an agent with a null org
// column is in nobody's downline according to it — while sitting on the roster.
check("the org-filtered downline helper is not used for this",
  /rpc\("is_in_downline"/.test(TEAM), false);
check("…and neither is the denormalised comparison that started it",
  /agent\.organization_id !== orgId/.test(TEAM), false);
// A union, not a replacement: an owner may place somebody who is not under
// them at all — a top-level agent, or one whose chain was never wired up.
check("sharing an agency is still a route in",
  /inAgency: inMyDownline \|\| sharesOrg/.test(TEAM), true);

// The write crosses `profiles_org_manage` deliberately, behind the check above,
// and still asserts its row count — a zero-row update must not report success.
check("the write happens after the check, not instead of it",
  /if \(!verdict\.ok\) throw[\s\S]{0,900}admin\s*\n?\s*\.from\("profiles"\)\s*\n?\s*\.update\(\{ agency_level_id/.test(TEAM), true);
check("…and a zero-row update is an error",
  /That position was not saved — nothing was written/.test(TEAM), true);
// A position is what somebody is paid from.
check("the change leaves an audit trail",
  /action: "comp\.changed"/.test(TEAM), true);

// ── The migration ───────────────────────────────────────────────────────────

console.log("");

const MIG = read("supabase/migrations/20260817120000_profile-org-resync-and-position-writes.sql");

check("the denormalised copy is resynced from memberships",
  /update public\.profiles p[\s\S]{0,300}from public\.organization_memberships m/.test(MIG), true);
// Forward only: it writes what membership already says and invents nothing.
check("…only where the two disagree",
  /p\.organization_id is null or p\.organization_id <> m\.organization_id/.test(MIG), true);
// The drift's main source: a membership promoted to primary after insert.
check("the trigger now fires on update, not only insert",
  /after insert or update of status, is_primary, organization_id/.test(MIG), true);
check("the write policy gains an upline arm",
  /public\.is_in_downline\(auth\.uid\(\), id\)/.test(MIG), true);
check("…without losing the owner or self arms",
  /id = auth\.uid\(\)\s*\n\s*or \(organization_id is not null and public\.is_org_owner\(organization_id\)\)/.test(MIG), true);
check("idempotent, and reloads the schema",
  /drop policy if exists/.test(MIG) && /notify pgrst/.test(MIG), true);
// Nothing is dropped and nothing is deleted.
check("no column is dropped and no row removed",
  /drop column|delete from/i.test(MIG), false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
