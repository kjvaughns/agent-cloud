/**
 * Signing in to the sample agency.
 *
 * Three buttons, no form, no email capture, no sales call. HawkSoft asks for
 * twelve fields before it shows anything, Better Agency wants a discovery call,
 * and AgencyBloc's "free trial" routes to sales — being the one life-insurance
 * platform a prospect can actually log into is worth protecting, and every
 * field added here gives some of that back.
 *
 * ── How the session is issued ───────────────────────────────────────────────
 *
 * No credential ever reaches the browser. The server generates a single-use
 * magic-link token with the admin API and returns only its hash; the client
 * exchanges that for a session through the ordinary `verifyOtp` path. The demo
 * accounts have passwords, but nothing in the client bundle knows them, and
 * changing them does not break this.
 *
 * ── Why the accounts are looked up rather than hardcoded ────────────────────
 *
 * The demo org is a normal tenant, so who plays each role is a fact about its
 * membership rows, not a constant in this file. It is resolved from
 * `organizations.owner_id` and `user_roles`, which means the provisioning
 * script can rename or replace the demo accounts without a deploy — and a
 * hardcoded address that stopped existing would fail at the least visible
 * moment, when a prospect clicks the button.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";

const supabaseAdmin = _admin as any;

export type DemoRole = "owner" | "manager" | "agent";

export const DEMO_ROLES: { id: DemoRole; label: string; blurb: string }[] = [
  {
    id: "owner",
    label: "See it as an Agency Owner",
    blurb: "The whole book, every producer, commissions and contracting across the agency.",
  },
  {
    id: "manager",
    label: "See it as a Manager",
    blurb: "Your team's production, who is ready to sell, and what is stuck in contracting.",
  },
  {
    id: "agent",
    label: "See it as an Agent",
    blurb: "Your own clients, policies, commissions and licences.",
  },
];

/** The role each button maps to in `user_roles`. Owner comes from the org row. */
const ROLE_IN_DB: Record<Exclude<DemoRole, "owner">, string> = {
  manager: "manager",
  agent: "agent",
};

async function resolveDemoUser(role: DemoRole): Promise<{ id: string; email: string }> {
  const { data: org, error: orgErr } = await supabaseAdmin
    .from("organizations")
    .select("id, owner_id")
    .eq("is_demo", true)
    .maybeSingle();

  if (orgErr || !org) {
    throw new Error("The sample agency is not set up on this deployment yet.");
  }

  let userId: string | null = null;

  if (role === "owner") {
    userId = org.owner_id ?? null;
  } else {
    // Members of the demo org holding the requested role. Two queries rather
    // than a join because `user_roles` and `organization_memberships` are
    // separate tables and the membership is what makes someone a demo user —
    // a platform admin who also holds 'manager' must not be picked up here.
    const { data: members } = await supabaseAdmin
      .from("organization_memberships")
      .select("user_id")
      .eq("organization_id", org.id);
    const ids = (members ?? []).map((m: any) => m.user_id);
    if (ids.length) {
      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", ROLE_IN_DB[role])
        .in("user_id", ids);
      // Stable pick: sorted, first. An unsorted "whichever row came back"
      // would land a prospect on a different producer's book each visit and
      // make a screenshot impossible to reproduce.
      userId = (roles ?? []).map((r: any) => r.user_id).sort()[0] ?? null;
    }
  }

  if (!userId) throw new Error(`The sample agency has no ${role} account set up.`);

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.email) throw new Error(`The sample agency's ${role} account has no email address.`);
  return { id: profile.id, email: profile.email };
}

/**
 * Mint a one-time token for a demo account.
 *
 * Public by design — requiring auth to see the demo would defeat it. The
 * exposure is bounded by what it can return: only ever one of at most three
 * accounts, all of them inside an org that is wiped nightly and cannot send
 * email, spend money, or invite anyone. It cannot be steered at an arbitrary
 * address, because it takes a role rather than an email.
 */
export const startDemoSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ role: z.enum(["owner", "manager", "agent"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const user = await resolveDemoUser(data.role);

    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: user.email,
    });

    if (error || !link?.properties?.hashed_token) {
      console.error("[demo] could not generate a sign-in link", error?.message);
      throw new Error("Could not open the sample agency. Try again in a moment.");
    }

    // The hash only. `properties.action_link` is a full URL carrying the same
    // token plus a redirect the client does not need, and logging it anywhere
    // would be logging a working credential.
    return { tokenHash: link.properties.hashed_token as string, role: data.role };
  });

/**
 * Whether this deployment has a demo at all.
 *
 * Drives the "Try the demo" links on the marketing pages: pointing at a demo
 * that does not exist is worse than not offering one.
 */
export const getDemoAvailability = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { data } = await supabaseAdmin
      .from("organizations")
      .select("name")
      .eq("is_demo", true)
      .maybeSingle();
    return { available: Boolean(data), agencyName: (data?.name as string | undefined) ?? null };
  } catch {
    return { available: false, agencyName: null };
  }
});
