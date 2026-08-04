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

import {
  navFor, hubGroupsFor, isHub, ACCOUNT_PAGES, type NavContext,
} from "../src/lib/navigation";

type Persona = { name: string; ctx: NavContext };

/**
 * One place that knows the shape of a context, so adding a gate means adding
 * a default here rather than editing every persona and hoping none was
 * missed — which would silently give the new gate a `false` it never chose.
 */
function ctx(over: Partial<NavContext>): NavContext {
  const base: NavContext = {
    audience: "core",
    inAgency: false,
    canSeeAgency: false,
    downlineCount: 0,
    isPending: false,
    canWorkTickets: false,
    canEditResources: false,
    perms: {},
  };
  // The derived flags follow their inputs unless a persona says otherwise,
  // matching how useNavContext computes them from the same permissions.
  const merged = { ...base, ...over };
  if (over.canWorkTickets === undefined) {
    merged.canWorkTickets =
      merged.canSeeAgency ||
      Boolean(merged.perms.mgr_respond_tickets) ||
      Boolean(merged.perms.staff_view_all_tickets) ||
      Boolean(merged.perms.staff_respond_tickets) ||
      Boolean(merged.perms.admin_view_agency_tickets);
  }
  if (over.canEditResources === undefined) {
    merged.canEditResources =
      merged.canSeeAgency ||
      Boolean(merged.perms.mgr_manage_resources) ||
      Boolean(merged.perms.staff_manage_resources);
  }
  return merged;
}

const PERSONAS: Persona[] = [
  { name: "Solo agent (own workspace, solo plan)", ctx: ctx({}) },
  { name: "Agent inside an agency, nobody under them", ctx: ctx({ inAgency: true }) },
  { name: "Pending agent (invited, no sale yet)", ctx: ctx({ inAgency: true, isPending: true }) },
  { name: "Agent with a downline", ctx: ctx({ inAgency: true, downlineCount: 3 }) },
  {
    name: "Manager (default permissions)",
    ctx: ctx({
      inAgency: true, downlineCount: 8,
      perms: { mgr_view_team_analytics: true, mgr_manage_onboarding: true },
    }),
  },
  {
    name: "Manager who answers tickets",
    ctx: ctx({
      inAgency: true, downlineCount: 4,
      perms: { mgr_view_team_analytics: true, mgr_respond_tickets: true },
    }),
  },
  {
    name: "Manager who maintains the content",
    ctx: ctx({
      inAgency: true, downlineCount: 2,
      perms: { mgr_view_team_analytics: true, mgr_manage_resources: true },
    }),
  },
  { name: "Agency owner", ctx: ctx({ inAgency: true, canSeeAgency: true }) },
  { name: "Staff (no permissions granted)", ctx: ctx({ audience: "staff", inAgency: true }) },
  {
    name: "Staff (client services preset)",
    ctx: ctx({
      audience: "staff", inAgency: true,
      perms: {
        staff_view_clients: true, staff_edit_clients: true, staff_delete_clients: true,
        staff_view_policies: true, staff_view_all_tickets: true, staff_respond_tickets: true,
      },
    }),
  },
  // The persona the staff audit was written from: runs carrier contracting for
  // the agency, administers nothing. Absent from this list, the sidebar they
  // get was never printed and nobody noticed it had no Contract Requests in it.
  {
    name: "Staff (contracting specialist preset)",
    ctx: ctx({
      audience: "staff", inAgency: true,
      perms: {
        staff_view_contracts: true, staff_submit_carrier_requests: true, staff_edit_contracts: true,
        staff_view_clients: true, staff_view_policies: true,
        staff_view_all_tickets: true, staff_respond_tickets: true,
      },
    }),
  },
  {
    name: "Staff (admin preset)",
    ctx: ctx({
      audience: "staff", inAgency: true, canSeeAgency: true,
      perms: {
        staff_is_admin: true, admin_manage_staff_configs: true,
        staff_nova_pro_enabled: true, staff_view_contracts: true,
      },
    }),
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

  // The footer. Left out of the first version of this script, and Settings is
  // where every agency-configuration destination lives — including the
  // support desk, which is the one row a client-services staffer needs and
  // the one place the main list would never have shown it.
  console.log("  ── footer");
  for (const item of ACCOUNT_PAGES) {
    console.log(`  ${item.label}  →  ${item.path}`);
    if (!isHub(item.id)) continue;
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

console.log(
  emptyGroups === 0
    ? "\nNo empty groups.\n"
    : `\n${emptyGroups} EMPTY GROUP(S) — a heading is rendering with nothing under it.\n`,
);
process.exit(emptyGroups === 0 ? 0 : 1);
