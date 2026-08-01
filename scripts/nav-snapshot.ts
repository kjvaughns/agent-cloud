/**
 * Print the sidebar every kind of person gets.
 *
 *   npx esbuild scripts/nav-snapshot.ts --bundle --platform=node --format=esm \
 *     --external:lucide-react --outfile=/tmp/nav.mjs && node /tmp/nav.mjs
 *
 * Five separate navigation products collapsed into two, and the failure mode
 * of that kind of change is silent: an entry stops being composed in and
 * nobody notices until somebody asks where their page went. This prints the
 * whole answer for each persona so a diff shows it.
 *
 * Run it after touching navigation.ts and read the output. It is deliberately
 * a script rather than a test — the repository has no test runner, and adding
 * one in the same change as a navigation rewrite is two changes.
 */

import { navFor, hubGroupsFor, isHub, type NavContext } from "../src/lib/navigation";

type Persona = { name: string; ctx: NavContext };

const PERSONAS: Persona[] = [
  {
    name: "Solo agent (own workspace, solo plan)",
    ctx: { audience: "core", inAgency: false, canSeeAgency: false, perms: {} },
  },
  {
    name: "Agent inside an agency",
    ctx: { audience: "core", inAgency: true, canSeeAgency: false, perms: {} },
  },
  {
    name: "Manager (default permissions)",
    ctx: {
      audience: "core", inAgency: true, canSeeAgency: false,
      perms: { mgr_view_team_analytics: true, mgr_manage_onboarding: true },
    },
  },
  {
    name: "Agency owner",
    ctx: { audience: "core", inAgency: true, canSeeAgency: true, perms: {} },
  },
  {
    name: "Staff (no permissions granted)",
    ctx: { audience: "staff", inAgency: true, canSeeAgency: false, perms: {} },
  },
  {
    name: "Staff (contracting preset)",
    ctx: {
      audience: "staff", inAgency: true, canSeeAgency: false,
      perms: { staff_view_contracts: true, staff_view_clients: true, staff_view_policies: true },
    },
  },
  {
    name: "Staff (admin preset)",
    ctx: {
      audience: "staff", inAgency: true, canSeeAgency: true,
      perms: { staff_is_admin: true, admin_manage_staff_configs: true, staff_nova_pro_enabled: true },
    },
  },
];

let emptyGroups = 0;

for (const { name, ctx } of PERSONAS) {
  console.log(`\n── ${name}`);
  const groups = navFor(ctx);
  for (const g of groups) {
    if (g.items.length === 0) {
      // The bug this script exists to catch: a heading with nothing under it,
      // because the group survived a filter that removed its only item.
      console.log(`  !! EMPTY GROUP "${g.label}"`);
      emptyGroups += 1;
      continue;
    }
    if (g.label) console.log(`  [${g.label}]`);
    for (const item of g.items) {
      console.log(`  ${item.label}  →  ${item.path}`);
      if (item.id && isHub(item.id)) {
        for (const sub of hubGroupsFor(item.id, ctx)) {
          if (sub.items.length === 0) {
            console.log(`      !! EMPTY HUB GROUP "${sub.label}"`);
            emptyGroups += 1;
            continue;
          }
          if (sub.label) console.log(`      ${sub.label.toUpperCase()}`);
          for (const s of sub.items) console.log(`      · ${s.label}  →  ${s.path}`);
        }
      }
    }
  }
}

console.log(
  emptyGroups === 0
    ? "\nNo empty groups.\n"
    : `\n${emptyGroups} EMPTY GROUP(S) — a heading is rendering with nothing under it.\n`,
);
process.exit(emptyGroups === 0 ? 0 : 1);
