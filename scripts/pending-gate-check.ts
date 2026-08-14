/**
 * A new agent gets the whole app on the day they sign up.
 *
 *   npx tsx scripts/pending-gate-check.ts
 *
 * There used to be a "pending" state between signing up and being allowed to
 * sell. Eight nav sections were hidden, and a banner explained that "selling
 * opens once your agency activates you" — but activation was never a real,
 * discoverable action, so the banner described a door with no handle. The
 * whole gate is gone: the `activated` unlock, the flag that fed it, the
 * banner, and the dashboard checklist that sat under it.
 *
 * Most of this is deletion, so most of these assertions are "is it gone".
 * The two that are not:
 *
 *   * The eight pages must still be REACHABLE. Deleting a gate that was the
 *     only thing keeping a row out of the sidebar could just as easily delete
 *     the row, and the acceptance test is that a new agent can open all of
 *     them.
 *
 *   * Nova's starter greeting must survive. It rode on the same pending flag
 *     while claiming to mean "has not posted a policy yet" — which the flag
 *     never meant, since it read membership status. Removing the flag would
 *     have killed the greeting silently, so it now reads a real book check.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { navFor, reachableFor, type NavContext } from "../src/lib/navigation";

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

// ── The gate is gone ────────────────────────────────────────────────────────

const NAV = read("src/lib/navigation.ts");
check("no page carries the activated unlock", /unlock: "activated"/.test(NAV), false);
check("the gate resolver no longer branches on it", /unlock === "activated"/.test(NAV), false);
check("the Unlock union no longer offers it", /\|\s*"activated"/.test(NAV), false);
check("the nav context has no pending flag", /isPending/.test(NAV), false);

const PERMS = read("src/lib/permissions.functions.ts");
// Stripped: the replacement field's docblock names the flag it replaced on
// purpose, so that the next person to read it knows why it is not a gate.
check("access no longer computes a pending flag", /isPending/.test(strip(PERMS)), false);
check("…and no longer reads status to do it",
  /from\("profiles"\)\.select\("status"\)/.test(PERMS), false);

const HOOK = read("src/hooks/use-my-access.ts");
check("the hook no longer surfaces it", /isPending/.test(HOOK), false);

// ── The eight pages a new agent must be able to open ────────────────────────

console.log("");

// A brand-new agent: in an agency, administers nothing, nobody underneath.
const NEW_AGENT: NavContext = {
  audience: "core",
  inAgency: true,
  canSeeAgency: false,
  downlineCount: 0,
  canWorkTickets: false,
  canEditResources: false,
  hasSubAgencies: false,
  hasNoBookYet: true,
  perms: {},
};

const reachable = new Set(reachableFor(NEW_AGENT).map((p) => p.id));
for (const id of ["clients", "pipeline", "calendar", "book", "retention", "finances", "reports", "nova"]) {
  check(`${id} is reachable on day one`, reachable.has(id), true);
}
// The gate's absence must not have emptied the sidebar of its groups either.
check("the sidebar still renders groups for them", navFor(NEW_AGENT).length > 0, true);

// ── Nobody starts pending ───────────────────────────────────────────────────

console.log("");

const ONB = read("src/lib/onboarding.functions.ts");
// Accepting an invite is the one place application code sets a member status.
check("accepting an invite makes somebody active",
  /status: "active",\n\s+\/\/ The invite carries the agency level/.test(ONB), true);
// The invitation LINK's own lifecycle is a different thing that still starts
// pending — an unaccepted link is genuinely pending. Guard against a
// search-and-replace having flattened the two.
check("an invitation link still starts pending",
  /from\("invitation_links"\)\.insert\(\{[\s\S]*?status:\s+"pending"/.test(ONB), true);

const MIG = read("supabase/migrations/20260814190000_new-agents-start-active.sql");
check("the column default is active", /alter column status set default 'active'/.test(MIG), true);
check("the signup branch names active explicitly",
  /insert into public\.profiles \(id, email, first_name, last_name, status\)/.test(MIG), true);
check("the trigger is replaced, not dropped",
  /create or replace function public\.handle_new_user/.test(MIG), true);
check("…and stays out of PUBLIC's reach",
  /revoke execute on function public\.handle_new_user\(\) from public, anon, authenticated/.test(MIG), true);
check("no row is rewritten and nothing is dropped",
  /update public\.profiles\s+set status|drop\s+(column|table)/i.test(MIG), false);

// ── The banner and the checklist ────────────────────────────────────────────

console.log("");

check("the pending banner is deleted", existsSync(join(ROOT, "src/components/pending-agent-notice.tsx")), false);
check("the dashboard checklist is deleted", existsSync(join(ROOT, "src/components/onboarding/my-onboarding.tsx")), false);

const DASH = read("src/routes/_authenticated/dashboard.tsx");
check("neither is imported or rendered", /PendingAgentNotice|MyOnboarding/.test(DASH), false);
// Deleting a render and leaving the prose above it is how a file ends up
// explaining something that is not there.
check("…and the comment about the missing half of the app went with them",
  /why half the\s+app is not here yet/.test(DASH), false);

// The agency-side view of the same data is a different screen and stays.
check("the owner's Getting Ready panel survives",
  existsSync(join(ROOT, "src/components/onboarding/onboarding-panel.tsx")), true);
check("…and so does the checklist it renders",
  existsSync(join(ROOT, "src/components/onboarding/get-ready.tsx")), true);
check("the team page still mounts it", /OnboardingPage/.test(read("src/routes/_authenticated/team.tsx")), true);

// ── Nova ────────────────────────────────────────────────────────────────────

console.log("");

const NOVA_CTX = read("src/lib/nova-context.server.ts");
check("Nova no longer carries copy about being unactivated",
  /not activated yet|status === "pending"/.test(NOVA_CTX), false);

const AI = read("src/routes/_authenticated/ai-assistant.tsx");
check("the starter greeting survives the flag it used to ride on",
  /STARTER_GREETING_TEXT/.test(AI) && /STARTER_CHIPS/.test(AI), true);
check("…driven by whether there is a book, not by membership status",
  /const starter = audience === "core" && hasNoBookYet/.test(strip(AI)), true);
check("…and staff are still never 'starting out'",
  /audience === "core" &&/.test(strip(AI)), true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
