/**
 * The agency board shows the agency.
 *
 *   npx tsx scripts/agency-leaderboard-check.ts
 *
 * ── The defect ──
 *
 * "Each agent should be able to see everyone in the agency, not just them and
 * their downline."
 *
 * The toggle offers My Agency to everybody. For everybody who is not an org
 * admin it quietly meant "my downline": `scope_agent_ids` degrades `'agency'`
 * to `'team'` when `is_org_admin` is false, and nothing on screen said the
 * question had been changed on the way through. A regular agent pressed My
 * Agency, got a plausible board, and had no way to tell it was the wrong one.
 *
 * ── The two things that were tempting and wrong ──
 *
 * Widening `scope_agent_ids` would have fixed it — and widened Book of
 * Business, analytics, the dashboard tiles and the agent picker at the same
 * time, since that function is the single source of truth for all of them.
 * Widening `policies` RLS would have fixed it too, and handed every agent
 * `client_id`, `policy_number` and `face_amount` on every peer's policy, to
 * every reader of the table.
 *
 * So a security definer function that returns four totals and a name. These
 * checks hold the SQL against `src/lib/production/source.ts`, because the two
 * now define production twice and a drift between them is a wrong number on a
 * public board rather than a crash.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PLACED_STATUSES } from "../src/lib/production/source";

const ROOT = join(import.meta.dirname, "..");

let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`ok    ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`); }
}

const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const SQL = read("supabase/migrations/20260818120000_org-leaderboard.sql");
const DASH = read("src/lib/dashboard.functions.ts");
const PENDING = read("supabase/migrations/PENDING.md");
const SAFETY = read("scripts/migration-safety.ts");

// ── The SQL says what source.ts says ────────────────────────────────────────

// `policy_counts_as_production` is reused rather than restated, which is what
// actually keeps the two in step — an inlined list here would drift silently.
check(
  "production is the shared function, not an inlined status list",
  /public\.policy_counts_as_production\(pol\.status::text\)/.test(SQL),
  true,
);
check(
  "…and no NOT IN list was inlined beside it",
  /not in \('withdrawn'/.test(SQL),
  false,
);
// The placed list is new SQL, so it is compared against source.ts directly.
const placedInSql = (SQL.match(/select _status in \(([^)]*)\)/) ?? [])[1] ?? "";
check(
  "policy_is_placed lists exactly PLACED_STATUSES",
  PLACED_STATUSES.every((s) => placedInSql.includes(`'${s}'`))
    && placedInSql.split(",").length === PLACED_STATUSES.length,
  true,
);
check("placed uses that function, not a repeated list", /public\.policy_is_placed\(/.test(SQL), true);

// ── Authorization ───────────────────────────────────────────────────────────

check("the caller must be active", /public\.caller_is_active\(\)/.test(SQL), true);
check("it is security definer", /security definer/.test(SQL), true);
check("…with a pinned search_path", /set search_path = public/.test(SQL), true);
check("authenticated may call it", /grant execute on function public\.get_org_leaderboard/.test(SQL), true);
// Membership is the record, and the profile copy is the fallback — the agents
// this exists for are exactly the ones missing one of the two.
check("the caller's orgs come from membership", /from public\.organization_memberships m\s*\n\s*where m\.profile_id = auth\.uid\(\)/.test(SQL), true);
check("…with the profile copy as a union, not a replacement", /union/.test(SQL), true);
check("…and the fallback refuses a revoked profile", /not in \('inactive', 'terminated'\)/.test(SQL), true);

// ── The product decisions ───────────────────────────────────────────────────

// Only producers. An agency's whole roster padded with zeroes is a list of
// people who did not sell, published to everyone who did.
check("producers only — no left join from the member list", /left join/i.test(SQL), false);
// The app sends an inclusive end everywhere; `< _end` would drop the last day.
check("the window end is inclusive", /production_date <= _end/.test(SQL), true);
check("…and the start is too", /production_date >= _start/.test(SQL), true);
// Aggregates only. Returning policy rows would be the RLS widening this avoids.
check(
  "it returns totals and a name, nothing else",
  /returns table \(\s*agent_id uuid,\s*first_name text,\s*last_name text,\s*premium numeric,\s*policies bigint,\s*placed numeric\s*\)/.test(SQL),
  true,
);
check("premium is annual_premium, per source.ts", /sum\(pol\.annual_premium\)/.test(SQL), true);

// ── The wiring, and the pending window ──────────────────────────────────────

check("the agency scope calls the function", /rpc\("get_org_leaderboard"/.test(DASH), true);
check("…and only the agency scope", /data\.scope === "agency"/.test(DASH), true);
check(
  "an unavailable function degrades instead of throwing",
  /if \(error\) \{[\s\S]{0,300}?return null;/.test(DASH),
  true,
);
check("…noisily, so the window is visible", /\[leaderboard\] get_org_leaderboard unavailable/.test(DASH), true);
check(
  "the owner opt-out is honoured on both paths",
  (DASH.match(/hiddenOwnersAmong\(/g) ?? []).length >= 3,
  true,
);
check("…and never hides the viewer from themselves", /hidden\.delete\(viewerId\)/.test(DASH), true);

// The migration is applied by hand, so the entry is what tells whoever applies
// it what is still wrong until they do.
check("PENDING.md lists the migration", PENDING.includes("20260818120000_org-leaderboard.sql"), true);
check(
  "…with the filename alone on its bullet line, so the safety script sees it",
  /^- `20260818120000_org-leaderboard\.sql`$/m.test(PENDING),
  true,
);
check("migration-safety has a reason for the reference", SAFETY.includes("dashboard.functions.ts:get_org_leaderboard"), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
