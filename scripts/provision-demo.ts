/**
 * Build the demo agency from nothing, once.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DEMO_PASSWORD=... \
 *     npm run demo:provision -- [--domain demo.useagentcloud.com] [--dry-run]
 *
 * Creates the organization, three accounts to sign in as, their memberships,
 * their roles and their hierarchy, then hands over to the seed for the data.
 * Idempotent: run it twice and the second run reconciles rather than
 * duplicates, because the thing you most want to do to a broken demo is run
 * the provisioner again.
 *
 * ── Why this is a script and not a migration ────────────────────────────────
 *
 * Creating auth users needs the admin API, which SQL does not have. And a
 * migration that mints sign-in-able accounts would run on every environment
 * that applies it, including somebody's self-hosted install — the last place a
 * set of known-credential accounts should silently appear. Provisioning the
 * demo is a decision, so it takes a deliberate command.
 *
 * ── The password ────────────────────────────────────────────────────────────
 *
 * Required, from the environment, with no default. These accounts can be
 * signed into by anybody who visits /demo-login, so the password is not what
 * protects them — the guardrails in demo.server.ts are. But a default password
 * committed to a repository would also be a default password on every other
 * deployment that ever ran this, and that is a habit worth not starting.
 */

import { createClient } from "@supabase/supabase-js";
import { clearSampleData, seedSampleData } from "../src/lib/demo-seed.server";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const DRY_RUN = flag("dry-run");
const DOMAIN = value("domain") ?? "demo.useagentcloud.com";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD;

if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}
if (!password || password.length < 12) {
  console.error("DEMO_PASSWORD must be set and at least 12 characters.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const ORG_NAME = "Summit Life Partners";
const ORG_SLUG = "demo";

/**
 * The three seats. `role` is the app_role each account holds; the owner is
 * additionally set as `organizations.owner_id`, which is what /demo-login
 * resolves the owner button against.
 */
const ACCOUNTS = [
  { key: "owner",   email: `demo-owner@${DOMAIN}`,   first: "Marcus", last: "Webb",    role: "agency_owner" },
  { key: "manager", email: `demo-manager@${DOMAIN}`, first: "Denise", last: "Okafor",  role: "manager" },
  { key: "agent",   email: `demo-agent@${DOMAIN}`,   first: "Tanya",  last: "Bright",  role: "agent" },
] as const;

async function findUserByEmail(email: string): Promise<string | null> {
  // There is no admin "get user by email", and listUsers pages. The demo has
  // three accounts, so one page is always enough — but the filter is explicit
  // rather than assuming the first page contains them.
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
}

async function main() {
  if (DRY_RUN) {
    console.log("Dry run — nothing written.");
    console.log(`Would create org "${ORG_NAME}" (slug ${ORG_SLUG}) and:`);
    for (const a of ACCOUNTS) console.log(`  ${a.email} — ${a.first} ${a.last}, ${a.role}`);
    console.log("Then clear and re-seed its sample data.");
    return;
  }

  // ── Accounts ──────────────────────────────────────────────────────────────
  // Before the org, because the org needs an owner_id.
  const ids: Record<string, string> = {};

  for (const a of ACCOUNTS) {
    let id = await findUserByEmail(a.email);

    if (id) {
      // Reconcile rather than skip: a demo account whose password drifted is a
      // demo nobody can get into, and that is the failure this script exists
      // to be re-runnable against.
      const { error } = await db.auth.admin.updateUserById(id, { password, email_confirm: true });
      if (error) throw new Error(`updateUser ${a.email}: ${error.message}`);
      console.log(`  = ${a.email} already existed, password reset`);
    } else {
      const { data, error } = await db.auth.admin.createUser({
        email: a.email,
        password,
        email_confirm: true,
        user_metadata: { first_name: a.first, last_name: a.last },
      });
      if (error || !data.user) throw new Error(`createUser ${a.email}: ${error?.message}`);
      id = data.user.id;
      console.log(`  + ${a.email}`);
    }

    ids[a.key] = id!;
  }

  // ── The organization ──────────────────────────────────────────────────────
  const { data: existingOrg } = await db
    .from("organizations").select("id").eq("slug", ORG_SLUG).maybeSingle();

  let orgId: string;
  if (existingOrg?.id) {
    orgId = existingOrg.id;
    const { error } = await db.from("organizations")
      .update({ name: ORG_NAME, owner_id: ids.owner, is_demo: true, active: true })
      .eq("id", orgId);
    if (error) throw new Error(`update org: ${error.message}`);
    console.log(`  = org ${ORG_SLUG} already existed (${orgId})`);
  } else {
    const { data, error } = await db.from("organizations")
      .insert({
        name: ORG_NAME, slug: ORG_SLUG, owner_id: ids.owner,
        is_demo: true, active: true,
        tagline: "A working sample agency. Everything here is made up.",
      })
      .select("id").single();
    if (error || !data) throw new Error(`create org: ${error?.message}`);
    orgId = data.id;
    console.log(`  + org ${ORG_SLUG} (${orgId})`);
  }

  // ── Profiles, memberships, roles, hierarchy ───────────────────────────────
  for (const a of ACCOUNTS) {
    const id = ids[a.key];

    const { error: pErr } = await db.from("profiles").upsert({
      id,
      email: a.email,
      first_name: a.first,
      last_name: a.last,
      organization_id: orgId,
      status: "active",
      // Everyone reports to the owner. A two-level hierarchy is enough for the
      // team views to have something to show and not so deep that a visitor
      // has to navigate to understand it.
      upline_id: a.key === "owner" ? null : ids.owner,
      npn_number: String(17000000 + Math.abs(hash(a.email)) % 999999),
    }, { onConflict: "id" });
    if (pErr) throw new Error(`profile ${a.email}: ${pErr.message}`);

    const { error: mErr } = await db.from("organization_memberships").upsert({
      organization_id: orgId,
      profile_id: id,
      role: a.role,
      status: "active",
      is_primary: true,
    }, { onConflict: "organization_id,profile_id" });
    if (mErr) throw new Error(`membership ${a.email}: ${mErr.message}`);

    // user_roles has no natural unique key to upsert against in every
    // deployment, so this reads first. Duplicated role rows are harmless to
    // permission checks but make the Team page list somebody twice.
    const { data: existingRole } = await db
      .from("user_roles").select("id").eq("user_id", id).eq("role", a.role).maybeSingle();
    if (!existingRole) {
      const { error: rErr } = await db.from("user_roles").insert({ user_id: id, role: a.role as any });
      if (rErr) throw new Error(`role ${a.email}: ${rErr.message}`);
    }

    console.log(`  · ${a.first} ${a.last} — ${a.role}`);
  }

  // ── The data ──────────────────────────────────────────────────────────────
  const cleared = await clearSampleData(db, orgId);
  if (cleared.failures.length) {
    console.error(`\n${cleared.failures.length} table(s) could not be cleared:`);
    for (const f of cleared.failures) console.error(`  ${f}`);
    process.exit(1);
  }

  const seeded = await seedSampleData(db, orgId);
  if (!seeded.seeded) {
    console.error(`\nNothing was seeded: ${seeded.detail}`);
    process.exit(1);
  }

  console.log(`\nDemo ready at /demo-login — ${seeded.detail}`);
}

/** Stable per-email number, so re-running does not renumber everybody's NPN. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

await main();
