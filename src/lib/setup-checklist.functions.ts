import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { assertOrgOwner, getMyPrimaryOrgId } from "@/lib/org-guard";

const supabaseAdmin = _admin as any;

type Ctx = { supabase: any; userId: string };

/**
 * Agency setup checklist.
 *
 * Every step is derived from real data rather than a stored flag, so the list
 * cannot drift out of sync with the workspace — if an agency deletes its last
 * carrier the step reopens. Only dismissals are persisted.
 */

export type SetupStep = {
  key: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
  /** Optional — steps that need a paid plan or a purchase. */
  blocked?: boolean;
};

/**
 * Policies this agency actually wrote.
 *
 * "Post your first deal" is the closest thing this product has to an
 * activation metric, and an agency that started with sample data has fifty-two
 * policies before it has done anything at all. A checklist that congratulates
 * somebody for work the seed did is worse than no checklist: it tells them
 * they are finished when they have not started.
 *
 * The retry exists because `is_sample` is a pending column. Naming it in a
 * select fails the whole query with 42703 until the migration lands, which
 * would take the entire checklist down; falling back to the unfiltered count
 * is correct in that window, because a database without the column also has no
 * sample rows in it.
 */
async function countRealPolicies(orgId: string): Promise<{ count: number | null }> {
  const filtered = await supabaseAdmin
    .from("policies")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("is_sample", false);
  if (!filtered.error) return { count: filtered.count ?? 0 };

  const all = await supabaseAdmin
    .from("policies")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  return { count: all.count ?? 0 };
}

export const getSetupChecklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return { steps: [], complete: 0, total: 0, dismissed: true, isOwner: false };

    const [org, settings, state, carriers, invites, members, policies] = await Promise.all([
      supabaseAdmin.from("organizations")
        .select("id, name, slug, logo_url, owner_id, plan_type, subscription_status")
        .eq("id", orgId).maybeSingle(),
      supabaseAdmin.from("organization_settings")
        .select("support_email, primary_admin_email, welcome_message")
        .eq("organization_id", orgId).maybeSingle(),
      supabaseAdmin.from("organization_setup_state")
        .select("dismissed_steps, checklist_dismissed")
        .eq("organization_id", orgId).maybeSingle(),
      supabaseAdmin.from("agent_commission_levels")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
      supabaseAdmin.from("invitation_links")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
      supabaseAdmin.from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId),
      countRealPolicies(orgId),
    ]);

    const o = org.data ?? {};
    const s = settings.data ?? {};
    const isOwner = o.owner_id === userId;

    const steps: SetupStep[] = [
      {
        key: "branding",
        title: "Name your agency",
        description: "Set your agency name, subdomain and logo so the workspace looks like yours.",
        href: "/settings/agency",
        done: Boolean(o.name && o.slug && o.logo_url),
      },
      {
        key: "contacts",
        title: "Add operational contacts",
        description: "Where agency alerts and support replies should go.",
        href: "/admin/settings",
        done: Boolean(s.primary_admin_email || s.support_email),
      },
      {
        key: "billing",
        title: "Activate your subscription",
        description: "Turn on billing so your team keeps full access.",
        href: "/settings/billing",
        done: o.subscription_status === "active" || o.subscription_status === "trialing",
      },
      {
        key: "carriers",
        title: "Set carrier commission levels",
        description: "Assign the carriers and levels your agents write on.",
        href: "/contracting/carriers",
        done: (carriers.count ?? 0) > 0,
      },
      {
        key: "invite",
        title: "Invite your first agent",
        description: "Send an onboarding link — licensing and contracting follow automatically.",
        href: "/contracting/invite",
        done: (invites.count ?? 0) > 0 || (members.count ?? 0) > 1,
      },
      {
        key: "welcome",
        title: "Write a welcome message",
        description: "The first thing a new agent reads when they sign in.",
        href: "/admin/settings",
        done: Boolean(s.welcome_message),
      },
      {
        key: "first_deal",
        title: "Post your first deal",
        description: "Confirm commissions calculate the way you expect.",
        href: "/post-deal",
        done: (policies.count ?? 0) > 0,
      },
      {
        key: "security",
        title: "Turn on two-factor authentication",
        description: "Your account can reach every client record in the agency.",
        href: "/settings/security",
        done: false, // Resolved client-side from the Supabase MFA factor list.
      },
    ];

    const dismissed: string[] = state.data?.dismissed_steps ?? [];
    const visible = steps.filter((st) => !dismissed.includes(st.key));

    return {
      steps: visible,
      complete: visible.filter((st) => st.done).length,
      total: visible.length,
      dismissed: Boolean(state.data?.checklist_dismissed),
      isOwner,
    };
  });

export const dismissSetupStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      step: z.string().max(40).optional(),
      dismissAll: z.boolean().optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new Error("No organization");
    await assertOrgOwner(userId, orgId);

    if (data.dismissAll) {
      await supabaseAdmin.from("organization_setup_state").upsert(
        { organization_id: orgId, checklist_dismissed: true, updated_at: new Date().toISOString() },
        { onConflict: "organization_id" },
      );
      return { ok: true };
    }

    if (!data.step) return { ok: true };

    const { data: row } = await supabaseAdmin
      .from("organization_setup_state")
      .select("dismissed_steps")
      .eq("organization_id", orgId)
      .maybeSingle();

    const next = Array.from(new Set([...(row?.dismissed_steps ?? []), data.step]));
    await supabaseAdmin.from("organization_setup_state").upsert(
      { organization_id: orgId, dismissed_steps: next, updated_at: new Date().toISOString() },
      { onConflict: "organization_id" },
    );
    return { ok: true };
  });
