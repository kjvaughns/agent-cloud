/**
 * Revocation invariants that live in the TypeScript layer.
 *
 * `npx tsx scripts/revocation-check.ts`
 *
 * The security boundary itself is in the database — `my_org_ids()` reads
 * `organization_memberships`, `set_agent_status` archives it, and a trigger
 * stops an agent editing their own status. Those are proved against a scratch
 * Postgres built from the full migration history, not here.
 *
 * What *is* here is the half that Postgres cannot enforce: `org-guard.ts` runs
 * on the service-role client, which bypasses RLS entirely. Its
 * `profiles.organization_id` fallback exists for installs where the membership
 * backfill has not run — and unguarded it is an active bypass, because revoking
 * somebody is exactly what makes the membership query return zero rows, which
 * is precisely the condition that fires the fallback.
 *
 * So every one of these asserts the same thing from a different angle: a
 * revoked profile must not be handed its organization back by a fallback.
 *
 * Run alongside `delete-check.ts` and `migration-safety.ts`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

// ── The four org-guard fallbacks ───────────────────────────────────────
//
// Read as source rather than executed: these functions take a module-level
// `supabaseAdmin` built from environment credentials, so calling them needs a
// live database. What can be checked without one is that no fallback reads a
// profile without also reading its status — which is the whole defect.

const GUARD = readFileSync(join(process.cwd(), "src/lib/org-guard.ts"), "utf8");

// Each `.from("profiles")` in this file is a fallback around a membership miss.
// Every one must select `status` and consult it.
const profileReads = [...GUARD.matchAll(/\.from\("profiles"\)[\s\S]{0,400}?maybeSingle\(\)|\.from\("profiles"\)[\s\S]{0,400}?\.in\("organization_id"[^)]*\)/g)];

check("org-guard still has the fallbacks (they are load-bearing for backfill)",
  profileReads.length >= 4, true);

for (const [i, m] of profileReads.entries()) {
  check(`fallback ${i + 1} selects status`, /select\("[^"]*status/.test(m[0]), true);
}

// The revoked set must be consulted, not merely selected.
check("a REVOKED set is defined", /const REVOKED = new Set\(\["inactive", "terminated"\]\)/.test(GUARD), true);
check("REVOKED is actually consulted", (GUARD.match(/REVOKED\.has\(/g) ?? []).length >= 4, true);

// filterToMyOrg never consulted memberships at all — it narrowed purely on
// profiles.organization_id, which a revoked agent keeps.
const filterFn = GUARD.slice(GUARD.indexOf("export async function filterToMyOrg"));
check("filterToMyOrg excludes revoked profiles", /REVOKED\.has/.test(filterFn), true);

// ── The write path ─────────────────────────────────────────────────────

const TEAM = readFileSync(join(process.cwd(), "src/lib/team.functions.ts"), "utf8");

check("setAgentTerminated is gone", /export const setAgentTerminated/.test(TEAM), false);
check("deactivateAgent is gone", /export const deactivateAgent/.test(TEAM), false);
check("setAgentStatus exists", /export const setAgentStatus/.test(TEAM), true);
check("it goes through the RPC", /rpc\("set_agent_status"/.test(TEAM), true);

// Migrations here are applied by hand, so code always ships first. A missing
// function must degrade to today's behaviour, not throw.
check("unapplied-migration fallback on 42883/PGRST202",
  /42883|PGRST202/.test(TEAM), true);

// The class of bug the delete sweep cleared: an RLS-filtered write matches
// nothing, is not an error, and reports success.
const hiddenFn = TEAM.slice(TEAM.indexOf("export const setAgentHidden"), TEAM.indexOf("export const setAgentStatus"));
check("setAgentHidden asserts a row count", /!touched\?\.length/.test(hiddenFn), true);

// ── The migration's own invariants, as source assertions ───────────────

const MIG = readFileSync(
  join(process.cwd(), "supabase/migrations/20260802240000_agent-status-revocation.sql"), "utf8");

// The gap that is easy to miss: SECURITY DEFINER functions walk
// profiles.upline_id with no membership check, so RLS is not in their path.
for (const fn of ["get_team_downline", "get_team_downline_for", "get_team_kpis",
                  "get_team_alerts", "get_team_leaderboard"]) {
  const body = MIG.slice(MIG.indexOf(`function public.${fn}`));
  check(`${fn} is gated on caller_is_active`, /caller_is_active\(\)/.test(body.slice(0, 3000)), true);
}

check("is_in_downline gates on the upline being active",
  /where id = _upline and status in \('inactive','terminated'\)/.test(MIG), true);

// Revoking an owner locks them out of their own agency: the org policies are
// conjunctive, so is_org_owner does not rescue an archived membership.
check("set_agent_status refuses the agency owner",
  /v_owner = _agent then\s*\n\s*raise exception/.test(MIG), true);

// The sync trigger was insert-only, which is why termination revoked nothing.
check("sync trigger fires on status, not just organization_id",
  /after insert or update of organization_id, status on public\.profiles/.test(MIG), true);
check("sync trigger upserts rather than do-nothing",
  /do update set status = excluded\.status/.test(MIG), true);

// 'imported' violated the old CHECK, silently, losing first_name/last_name/upline_id.
check("status vocabulary includes imported and inactive",
  /'inactive','terminated','imported'/.test(MIG), true);

// A column-level revoke cannot carve a column out of a table-level grant.
check("no ineffective column-level revoke ships",
  /^\s*revoke update \(status/m.test(MIG), false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
