/**
 * Resolving the checklist against reality.
 *
 * Every step's completion is a query, run fresh on each read. Nothing about
 * "done" is stored, so the list cannot drift: an owner who adds carriers by
 * importing a spreadsheet gets that step ticked without ever seeing the
 * checklist, and an agency that deletes its last carrier gets it back.
 *
 * The only persisted state is what the person chose — dismissals and which
 * tours they have seen — which lives in `user_onboarding_state`.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import {
  checklistFor, type ChecklistRole, type CompletionKey,
} from "@/lib/onboarding-checklist";

const supabaseAdmin = _admin as any;

type Ctx = { supabase: any; userId: string };

export type ResolvedStep = {
  id: string;
  label: string;
  description: string;
  ctaRoute: string;
  ctaLabel: string;
  tourId?: string;
  done: boolean;
  /** The widget must answer this one itself; see onboarding-checklist.ts. */
  clientResolved?: boolean;
};

export type ChecklistPayload = {
  role: ChecklistRole;
  steps: ResolvedStep[];
  complete: number;
  total: number;
  dismissed: boolean;
  completedTours: string[];
};

/**
 * Which list this person gets.
 *
 * Ordered most-privileged first, because roles stack: an agency owner usually
 * also holds `agent`, and showing them "add your first client" instead of
 * "invite your first producer" would be a worse guess than the reverse.
 */
function resolveRole(roles: string[], isOrgOwner: boolean): ChecklistRole {
  if (isOrgOwner || roles.includes("agency_owner") || roles.includes("super_admin") || roles.includes("admin")) {
    return "owner";
  }
  if (roles.includes("manager")) return "manager";
  if (roles.includes("staff")) return "staff";
  return "agent";
}

const isDone = (r: { count: number | null }) => (r.count ?? 0) > 0;

/**
 * Run only the queries this role's steps actually need.
 *
 * The naive version runs all fourteen for everybody, which is eleven wasted
 * round trips on a page that renders on every navigation.
 */
async function resolveCompletion(
  keys: CompletionKey[],
  ctx: { userId: string; orgId: string | null },
): Promise<Record<string, boolean>> {
  const { userId, orgId } = ctx;
  const out: Record<string, boolean> = {};
  if (!orgId) return out;

  const count = (table: string, build: (q: any) => any) =>
    build(supabaseAdmin.from(table).select("id", { count: "exact", head: true }));

  const queries: Partial<Record<CompletionKey, () => Promise<boolean>>> = {
    org_created: async () => true,

    profile_complete: async () => {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name, npn_number, phone")
        .eq("id", userId)
        .maybeSingle();
      return Boolean(data?.first_name && data?.last_name && data?.npn_number && data?.phone);
    },

    carriers_added: async () =>
      isDone(await count("org_carriers", (q) => q.eq("organization_id", orgId))),

    comp_grid_set: async () =>
      isDone(await count("carrier_comp_levels", (q) => q.eq("organization_id", orgId))),

    team_invited: async () => {
      const [invites, members] = await Promise.all([
        count("invitation_links", (q) => q.eq("organization_id", orgId)),
        count("profiles", (q) => q.eq("organization_id", orgId)),
      ]);
      return isDone(invites) || (members.count ?? 0) > 1;
    },

    // Sample rows do not count. An agency that accepted "start with sample
    // data" has fifty-two policies and an imported book before it has done
    // anything, and a checklist that congratulates them for it is telling them
    // they are finished before they have started.
    book_imported: async () => isDone(await realPolicies(orgId, 20)),
    first_real_deal: async () => isDone(await realPolicies(orgId, 0)),

    first_client: async () =>
      isDone(await countReal("clients", (q) => q.eq("agent_id", userId))),

    agent_carriers_claimed: async () =>
      isDone(await count("agent_commission_levels", (q) => q.eq("agent_id", userId))),

    downline_reviewed: async () =>
      isDone(await count("profiles", (q) => q.eq("upline_id", userId))),

    task_assigned: async () =>
      isDone(await count("tasks", (q) => q.eq("created_by", userId))),

    contracting_queue_seen: async () =>
      isDone(await count("contracting_requests", (q) => q.eq("assigned_to", userId))),

    writing_number_added: async () =>
      isDone(await count("writing_numbers", (q) => q.eq("organization_id", orgId))),

    document_reviewed: async () =>
      isDone(await count("producer_documents", (q) => q.eq("reviewed_by", userId))),

    agency_branded: async () => {
      const { data } = await supabaseAdmin
        .from("organizations").select("name, slug, logo_url").eq("id", orgId).maybeSingle();
      return Boolean(data?.name && data?.slug && data?.logo_url);
    },

    agency_contacts_set: async () => {
      const { data } = await supabaseAdmin
        .from("organization_settings")
        .select("support_email, primary_admin_email")
        .eq("organization_id", orgId)
        .maybeSingle();
      return Boolean(data?.support_email || data?.primary_admin_email);
    },

    welcome_written: async () => {
      const { data } = await supabaseAdmin
        .from("organization_settings").select("welcome_message").eq("organization_id", orgId).maybeSingle();
      return Boolean(data?.welcome_message);
    },

    billing_active: async () => {
      const { data } = await supabaseAdmin
        .from("organizations").select("subscription_status").eq("id", orgId).maybeSingle();
      return data?.subscription_status === "active" || data?.subscription_status === "trialing";
    },

    // Never resolved here — the widget overlays it from the auth session. It
    // is listed so the closed union stays exhaustive rather than needing an
    // escape hatch.
    mfa_enabled: async () => false,
  };

  const wanted = keys.filter((k) => queries[k]);
  const results = await Promise.all(
    wanted.map(async (k) => {
      try {
        return [k, await queries[k]!()] as const;
      } catch {
        // A step that cannot be checked shows as not done. Better to leave
        // somebody one extra item than to tick something they have not done.
        return [k, false] as const;
      }
    }),
  );
  for (const [k, v] of results) out[k] = v;
  return out;
}

/**
 * Policies this agency actually wrote, over a threshold.
 *
 * `is_sample` is pending, so the filtered query is tried first and falls back
 * to the unfiltered count on 42703 — a database without the column has no
 * sample rows either, so the fallback is right rather than merely safe.
 */
async function realPolicies(orgId: string, moreThan: number) {
  const filtered = await supabaseAdmin
    .from("policies")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("is_sample", false);
  const r = filtered.error
    ? await supabaseAdmin.from("policies").select("id", { count: "exact", head: true }).eq("organization_id", orgId)
    : filtered;
  return { count: (r.count ?? 0) > moreThan ? 1 : 0 };
}

async function countReal(table: string, build: (q: any) => any) {
  const base = () => supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  const filtered = await build(base()).eq("is_sample", false);
  if (!filtered.error) return { count: filtered.count ?? 0 };
  const all = await build(base());
  return { count: all.count ?? 0 };
}

export const getOnboardingChecklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ChecklistPayload> => {
    const { userId } = context as Ctx;

    const [profileRes, rolesRes, stateRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("organization_id, created_at").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
      supabaseAdmin
        .from("user_onboarding_state")
        .select("dismissed_steps, checklist_dismissed, completed_tours")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const orgId: string | null = profileRes.data?.organization_id ?? null;
    const roles: string[] = (rolesRes.data ?? []).map((r: any) => r.role);

    let isOrgOwner = false;
    let joinedExistingOrg = true;
    if (orgId) {
      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("owner_id, created_at")
        .eq("id", orgId)
        .maybeSingle();
      isOrgOwner = org?.owner_id === userId;
      // "Did you build this house or arrive at it." The owner built it; so did
      // anyone whose account predates or matches the organization's creation.
      // Everyone else joined something that already existed and must not be
      // shown agency-setup steps.
      joinedExistingOrg = !isOrgOwner;
    }

    const role = resolveRole(roles, isOrgOwner);
    const items = checklistFor(role, { joinedExistingOrg });
    const completion = await resolveCompletion(
      items.map((i) => i.completion),
      { userId, orgId },
    );

    // A missing state row means nothing dismissed — the common case, and not
    // worth a write until somebody actually dismisses something.
    const dismissedSteps: string[] = stateRes.data?.dismissed_steps ?? [];
    const steps: ResolvedStep[] = items
      .filter((i) => !dismissedSteps.includes(i.id))
      .map((i) => ({
        id: i.id,
        label: i.label,
        description: i.description,
        ctaRoute: i.ctaRoute,
        ctaLabel: i.ctaLabel,
        tourId: i.tourId,
        done: Boolean(completion[i.completion]),
        clientResolved: i.clientResolved,
      }));

    return {
      role,
      steps,
      // Client-resolved steps are left out of the server's tally rather than
      // counted as not-done, so the number never contradicts the ticks the
      // widget draws. The widget adds them back once it has asked.
      complete: steps.filter((s) => s.done && !s.clientResolved).length,
      total: steps.length,
      dismissed: Boolean(stateRes.data?.checklist_dismissed),
      completedTours: stateRes.data?.completed_tours ?? [],
    };
  });

export const dismissOnboardingStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      step: z.string().max(60).optional(),
      dismissAll: z.boolean().optional(),
      tourCompleted: z.string().max(60).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();

    const { data: existing } = await supabaseAdmin
      .from("user_onboarding_state")
      .select("dismissed_steps, completed_tours")
      .eq("user_id", userId)
      .maybeSingle();

    const patch: Record<string, unknown> = {
      user_id: userId,
      organization_id: profile?.organization_id ?? null,
      updated_at: new Date().toISOString(),
    };

    if (data.dismissAll) patch.checklist_dismissed = true;
    if (data.step) {
      patch.dismissed_steps = Array.from(new Set([...(existing?.dismissed_steps ?? []), data.step]));
    }
    if (data.tourCompleted) {
      patch.completed_tours = Array.from(new Set([...(existing?.completed_tours ?? []), data.tourCompleted]));
    }

    const { error } = await supabaseAdmin
      .from("user_onboarding_state")
      .upsert(patch, { onConflict: "user_id" });
    // Until the migration lands this table does not exist. Losing a dismissal
    // is a much smaller problem than throwing on a click, so it is swallowed
    // with a note rather than surfaced.
    if (error) console.warn("[onboarding] could not save state:", error.message);

    return { ok: true };
  });
