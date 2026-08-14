import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Ctx = { supabase: any; userId: string };

const SURELC_SECTIONS = [
  "dba",
  "personal_info",
  "drivers_license",
  "banking",
  "eo",
  "aml",
  "state_licenses",
  "carrier_questions",
] as const;

/**
 * Nobody assigns a level above their own.
 *
 * The ceiling existed in two places, written out twice, and nowhere else — so
 * every other path that sets a comp level (the invite builder, the level
 * request, anything added later) was free to exceed it. One helper, called
 * from each.
 *
 * Silent when the inviter holds no level for that carrier: an agency owner
 * usually has no `agent_commission_levels` row of their own, and refusing them
 * would make the ceiling stricter for the person who sets it than for anyone
 * beneath them.
 */
export async function assertLevelWithinUpline(
  client: any,
  uplineId: string,
  carrierId: string,
  requestedPct: number,
  carrierLabel?: string,
) {
  const { data: mine } = await client
    .from("agent_commission_levels")
    .select("assigned_pct")
    .eq("agent_id", uplineId)
    .eq("carrier_id", carrierId)
    .maybeSingle();

  if (mine && Number(mine.assigned_pct) < requestedPct) {
    throw new Error(
      carrierLabel
        ? `Level for ${carrierLabel} exceeds your assigned level.`
        : "Level exceeds your assigned level.",
    );
  }
}

/**
 * Wire an invite's pre-assigned carriers into both halves of contracting.
 *
 * They are not two competing systems, which is how they looked: contract_requests
 * is the contract *record* — writing number, effective date, commission level,
 * and every historical contract that came in through an import. contracting_requests
 * is the *work* of obtaining one — the queue, the assignment, the readiness
 * check, the approvals. It even carries contract_record_id pointing at the
 * record it produces.
 *
 * Nothing ever set that column, and the invite only wrote the record half. So
 * an agent joined with carriers assigned, and the readiness checklist — which
 * reads the workflow half — reported they had not started contracting at all.
 *
 * This writes both and links them. A carrier the agency has not set up yet is
 * added to its directory rather than skipped — an owner putting a carrier on
 * an invite is saying the agency works with it, and skipping is what left
 * owners with carriers they could neither work nor remove.
 */
/**
 * Tell the people who have to do something about it.
 *
 * A pre-assigned carrier used to appear in the staff queue and nowhere else —
 * correct, but silent, so it sat unassigned until somebody happened to look.
 * The set is deliberately the same one the request would route to anyway: the
 * agent's direct upline, the agency owner, and every staffer who may submit
 * carrier requests.
 *
 * `may_notify` decides per person, so somebody who turned Contracting updates
 * off stays off. Failure is logged and swallowed — the requests are already
 * written, and losing them because a notification insert failed would be a
 * worse outcome than a quiet queue.
 */
async function notifyContractingRequestsCreated(opts: {
  client: any;
  organizationId: string;
  agentId: string;
  uplineId: string | null;
  count: number;
}) {
  const { client, organizationId, agentId, uplineId, count } = opts;
  if (count === 0) return;

  try {
    const [{ data: org }, { data: perms }, { data: agent }] = await Promise.all([
      client.from("organizations").select("owner_id").eq("id", organizationId).maybeSingle(),
      client.from("role_permissions")
        .select("profile_id, staff_submit_carrier_requests, contracting_submit, staff_is_admin")
        .eq("organization_id", organizationId),
      client.from("profiles").select("first_name, last_name").eq("id", agentId).maybeSingle(),
    ]);

    const submitters = (perms ?? [])
      .filter((p: any) => p.staff_submit_carrier_requests || p.contracting_submit || p.staff_is_admin)
      .map((p: any) => p.profile_id);

    const recipients = Array.from(new Set(
      [uplineId, org?.owner_id, ...submitters].filter(Boolean) as string[],
    // Nobody is told about work they created for themselves.
    )).filter((id) => id !== agentId);
    if (recipients.length === 0) return;

    const name = `${agent?.first_name ?? ""} ${agent?.last_name ?? ""}`.trim() || "A new agent";

    const allowed = await Promise.all(recipients.map(async (id) => {
      const { data: ok } = await client.rpc("may_notify", { _profile: id, _category: "contract_updates" });
      // A missing function or a null answer must not silence the queue — the
      // preference defaults to on, so default to sending.
      return ok === false ? null : id;
    }));

    const rows = allowed.filter(Boolean).map((id) => ({
      user_id: id,
      type: "contracting",
      title: `${count} contracting request${count === 1 ? "" : "s"} to work`,
      description: `${name} joined with ${count} pre-assigned carrier${count === 1 ? "" : "s"}. They are unassigned in the staff queue.`,
      read: false,
    }));
    if (rows.length) await client.from("notifications").insert(rows);
  } catch (e: any) {
    console.error("[invite] could not notify about new contracting requests:", e?.message);
  }
}

/**
 * The one way a carrier request gets created.
 *
 * Exported because it was not the only way. `createContractRequest` — what an
 * agent hits through Contracting → Add Carrier → "Request contracting" —
 * wrote a `contract_requests` row and stopped there, so the request existed on
 * the agent and was invisible to Contracting Ops, which reads
 * `contracting_requests`. No queue item, no org_carriers row, no notification.
 * Two systems for one concept, and only one of them had a work queue.
 *
 * The optional fields exist so the agent path can say what it is without
 * changing what the invite path does: both default to the invite behaviour.
 */
export async function assignInviteCarriers(opts: {
  client: any;
  agentId: string;
  organizationId: string | null;
  createdBy: string;
  assignments: any[];
  /** Status for the `contract_requests` row. Invite: "assigned". */
  contractStatus?: string;
  /** Note on both rows, so the queue says where the request came from. */
  contractNote?: string;
  requestNote?: string;
  /** Who the request is routed under. Invite: the person who made the link. */
  directUplineId?: string | null;
}) {
  const { client, agentId, organizationId, createdBy, assignments } = opts;
  const created: { requestId: string; carrierId: string }[] = [];

  for (const a of assignments) {
    if (!a.carrier_id) continue;

    const { data: record, error: recordError } = await client
      .from("contract_requests")
      .upsert({
        agent_id: agentId,
        carrier_id: a.carrier_id,
        organization_id: organizationId,
        status: (opts.contractStatus ?? "assigned") as any,
        requested_at: new Date().toISOString(),
        notes: a.release_needed
          ? "Release needed from previous upline"
          : (opts.contractNote ?? "Assigned via invite link"),
      }, { onConflict: "agent_id,carrier_id" })
      .select("id")
      .maybeSingle();

    // Loud rather than silent. This upsert's error was never read, so if it
    // failed — an enum value missing, a constraint — the agent joined with
    // none of the carriers their upline had chosen and nothing said so. The
    // signup itself still succeeds: having an account and no carriers is
    // recoverable, having neither is not.
    if (recordError) {
      console.error(
        `[invite] could not assign carrier ${a.carrier_id} to ${agentId}:`,
        recordError.message,
      );
      continue;
    }

    if (!organizationId) continue;

    // The workflow half needs the agency's own carrier row, not the global one.
    //
    // This used to `continue` when the agency had no `org_carriers` row, which
    // left the two records above with nothing behind them: a carrier that
    // exists on the agent, no work item routing it, and no way to clear it.
    // That is the stuck carrier owners could not remove.
    //
    // An owner who puts a carrier on an invite is saying the agency works with
    // that carrier, so create the row rather than skipping. If that fails, stop
    // for this carrier and say so — a partial record is what caused the problem.
    let orgCarrierId: string | null = null;
    const { data: existingOrgCarrier } = await client
      .from("org_carriers")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("carrier_id", a.carrier_id)
      .maybeSingle();

    if (existingOrgCarrier) {
      orgCarrierId = existingOrgCarrier.id;
    } else {
      const { data: madeOrgCarrier, error: createError } = await client
        .from("org_carriers")
        .insert({
          organization_id: organizationId,
          carrier_id: a.carrier_id,
          status: "active",
          created_by: createdBy,
          updated_by: createdBy,
        })
        .select("id")
        .maybeSingle();
      if (createError || !madeOrgCarrier) {
        console.error(
          `[invite] could not add carrier ${a.carrier_id} to the agency's directory:`,
          createError?.message,
        );
        continue;
      }
      orgCarrierId = madeOrgCarrier.id;
    }

    // A partial unique index already forbids two open requests for the same
    // agent and carrier, so check rather than let the insert fail.
    const { data: existing } = await client
      .from("contracting_requests")
      .select("id")
      .eq("agent_id", agentId)
      .eq("org_carrier_id", orgCarrierId)
      .not("status", "in", "(approved,writing_number_issued,declined,cancelled,closed)")
      .maybeSingle();
    if (existing) continue;

    // The requested level rides on the REQUEST, not on the agent.
    //
    // `agent_commission_levels` used to be written here, at invite time, before
    // anything had been submitted to anybody — so an agent's contract page
    // showed a level the carrier had never agreed to, and the string it stored
    // ("80%") was not the same kind of thing as the UUID the newer tables use.
    // `requested_comp_level_id` is a real FK to `carrier_comp_levels` and is
    // what the packet reads. The assignment becomes real when the request does.
    let requestedCompLevelId: string | null = null;
    if (a.level_name || a.level_pct != null) {
      const { data: level } = await client
        .from("carrier_comp_levels")
        .select("id")
        .eq("org_carrier_id", orgCarrierId)
        .eq(a.level_name ? "level_name" : "commission_pct", a.level_name ?? a.level_pct)
        .maybeSingle();
      requestedCompLevelId = level?.id ?? null;
    }

    const { data: requestRow } = await client.from("contracting_requests").insert({
      organization_id: organizationId,
      agent_id: agentId,
      org_carrier_id: orgCarrierId,
      created_by: createdBy,
      direct_upline_id: opts.directUplineId !== undefined ? opts.directUplineId : createdBy,
      // `draft` is the honest starting point and it is not invisible: its
      // REQUEST_STATUS_META entry is `open: true`, which is exactly what
      // `getStaffQueue` filters on, so this lands in the staff queue's
      // Unassigned tab immediately. (There is no `open` status — the CHECK
      // constraint lists seventeen values and that is not one of them.)
      status: "draft",
      is_transfer: Boolean(a.release_needed),
      contract_type: a.release_needed ? "transfer" : "new_contract",
      contract_record_id: record?.id ?? null,
      requested_comp_level_id: requestedCompLevelId,
      requested_advance_level: a.level_name ?? (a.level_pct != null ? `${a.level_pct}%` : null),
      notes: opts.requestNote ?? "Pre-assigned on the invite link",
    }).select("id").maybeSingle();

    if (requestRow?.id) {
      created.push({ requestId: requestRow.id, carrierId: a.carrier_id });
    }
  }

  return created;
}

// ============ PUBLIC (token-based) ============

export const getInviteByToken = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().min(8).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const { data: result, error } = await supabaseAdmin.rpc("get_invite_by_token", { _token: data.token });
    if (error) throw new Error(error.message);
    const invite = (result ?? null) as any;
    let migration_match: any = null;
    if (invite?.new_agent_email) {
      const { data: roster } = await (supabaseAdmin as any)
        .from("migration_roster")
        .select("first_name, last_name, location, depth, upline_name, status")
        .eq("email", String(invite.new_agent_email).toLowerCase())
        .maybeSingle();
      migration_match = roster ?? null;
    }
    return { invite, migration_match };
  });

export const acceptInviteCreateAccount = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    token: z.string().min(8).max(100),
    first_name: z.string().trim().min(1).max(60),
    last_name: z.string().trim().min(1).max(60),
    email: z.string().email().max(120),
    password: z.string().min(8).max(100),
    phone: z.string().trim().min(7).max(30),
    npn_number: z.string().trim().max(40).optional().nullable(),
  }).parse(d))
  .handler(async ({ data }) => {
    // Read the row itself rather than get_invite_by_token. That RPC does not
    // return is_reusable, so every guard below used to see `undefined` and
    // treat a shareable link as single-use: the first signup stamped the link
    // as consumed and everybody after them was told it had already been used.
    const { data: inv } = await (supabaseAdmin as any)
      .from("invitation_links")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();

    if (!inv) throw new Error("Invite not found");
    if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
      throw new Error("Invite expired or not found");
    }
    // A real account inside the sample agency would be wiped by the nightly
    // reset, and the person who created it would have no way to know why their
    // agency vanished. This is the more important half of the invite guard —
    // creating the link is reversible, following it is not.
    {
      const { assertNotDemo } = await import("@/lib/demo.server");
      await assertNotDemo(inv.organization_id, "invite someone");
    }
    if (inv.linked_agent_id && !inv.is_reusable) throw new Error("This invite has already been used");

    let newUserId: string;

    const { data: created, error: signErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { first_name: data.first_name, last_name: data.last_name },
    });

    if (signErr) {
      // Check if an imported placeholder already exists for this email
      const { data: existingProfile } = await (supabaseAdmin as any)
        .from("profiles").select("id, status").eq("email", data.email).maybeSingle();
      if (!existingProfile || existingProfile.status !== "imported") {
        throw new Error(signErr.message ?? "Failed to create account");
      }
      // Upgrade imported placeholder: set password so they can sign in
      await (supabaseAdmin as any).auth.admin.updateUserById(existingProfile.id, {
        password: data.password,
        email_confirm: true,
      });
      newUserId = existingProfile.id;
    } else {
      if (!created.user) throw new Error("Failed to create account");
      newUserId = created.user.id;
    }

    // Phone and NPN are collected at the door because they are cheap to give
    // and expensive to chase later — an NPN is the one identifier every
    // carrier packet needs and the agent already knows it by heart. Everything
    // else the packet wants is asked for by the readiness checklist, in the
    // app, where it can be saved and returned to.
    // The link's chosen upline, falling back to whoever made it. Every link
    // created before the picker existed has a null here, and for those the
    // creator is still the right answer.
    const inviteUplineId: string = (inv as any).upline_id ?? inv.created_by;

    await supabaseAdmin.from("profiles").update({
      upline_id: inviteUplineId,
      phone: data.phone,
      npn_number: data.npn_number || null,
      first_name: data.first_name,
      last_name: data.last_name,
      // Active from the moment they accept. There used to be a "pending"
      // state here, gating the selling half of the app until an agency
      // activated them — but that activation was never a real, discoverable
      // action, so people sat behind a wall with nothing to click. A licence
      // and an appointment still sit between signing up and selling; they are
      // just no longer reasons to hide the app.
      status: "active",
      // The invite carries the agency level the owner picked, so the new agent
      // lands on the ladder rather than nowhere.
      agency_level_id: (inv as any).agency_level_id ?? null,
    }).eq("id", newUserId);

    // Assign role from invite
    const roleToAssign = (inv.invited_role as string) ?? "agent";
    if (roleToAssign !== "agent") {
      await (supabaseAdmin as any).from("user_roles").insert({ user_id: newUserId, role: roleToAssign });
    }

    // Assign to same organization as inviter
    if (inv.organization_id) {
      await (supabaseAdmin as any).from("profiles").update({ organization_id: inv.organization_id }).eq("id", newUserId);
    }

    // If invited as agency_owner, create their own sub-organization
    if (roleToAssign === "agency_owner") {
      const slug = `${data.first_name.toLowerCase()}-${data.last_name.toLowerCase()}`
        .replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 40);
      const { data: newOrg } = await (supabaseAdmin as any).from("organizations").insert({
        name:          `${data.first_name} ${data.last_name}'s Agency`,
        slug:          `${slug}-${Date.now()}`,
        owner_id:      newUserId,
        parent_org_id: inv.organization_id ?? null,
        accent_color:  "#C9A227",
        active:        true,
      }).select("id").single();
      if (newOrg) {
        await (supabaseAdmin as any).from("profiles").update({ organization_id: newOrg.id }).eq("id", newUserId);
      }
    }

    // If invited as staff, link to the inviter as their principal
    if (roleToAssign === "staff") {
      await (supabaseAdmin as any).from("profiles").update({
        staff_for_user_id: inv.created_by,
        organization_id:   inv.organization_id ?? null,
      }).eq("id", newUserId);
    }

    // Every acceptance is its own row, so a shareable link can be accepted by
    // as many people as it is sent to.
    await (supabaseAdmin as any).from("invite_acceptances").upsert(
      { invitation_id: inv.id, profile_id: newUserId },
      { onConflict: "invitation_id,profile_id", ignoreDuplicates: true },
    );

    // Only a single-use link is consumed by being used. Writing this to a
    // reusable link is what used to break it for everybody after the first
    // person — and onboarding_step in particular made the shared link resume
    // mid-form for strangers who had no account yet.
    if (!inv.is_reusable) {
      await supabaseAdmin.from("invitation_links").update({
        linked_agent_id: newUserId,
        status: "completed",
        agent_started_at: new Date().toISOString(),
        agent_completed_at: new Date().toISOString(),
      }).eq("token", data.token);
    }

    // Contract records and the contracting work to obtain them, linked.
    const assignments: any[] = (inv.carrier_assignments as any[]) ?? [];
    const createdRequests = await assignInviteCarriers({
      client: supabaseAdmin,
      agentId: newUserId,
      organizationId: inv.organization_id ?? null,
      createdBy: inv.created_by,
      // The carrier requests route to the upline the agent actually reports
      // to, not to whoever pressed the button on the link.
      directUplineId: inviteUplineId,
      assignments,
    });
    if (inv.organization_id) {
      await notifyContractingRequestsCreated({
        client: supabaseAdmin,
        organizationId: inv.organization_id,
        agentId: newUserId,
        uplineId: inviteUplineId ?? null,
        count: createdRequests.length,
      });
    }

    // Flag transfer workflow if any assigned carriers need release
    const releaseNeeded = assignments.filter((a: any) => a.release_needed && a.carrier_id);
    if (releaseNeeded.length > 0) {
      await (supabaseAdmin as any).from("profiles").update({
        needs_transfer_request: true,
        transfer_workflow_carriers: releaseNeeded.map((a: any) => ({
          carrier_id:   a.carrier_id,
          carrier_name: a.carrier_name ?? a.carrier_id,
        })),
      }).eq("id", newUserId);
    }

    // Tell the upline somebody joined. This used to happen at the end of a
    // four-step wizard; joining is the moment worth knowing about, and the
    // readiness checklist reports everything after it.
    await supabaseAdmin.from("notifications").insert({
      user_id: inv.created_by,
      title: `${data.first_name} ${data.last_name} joined your team`,
      description: "They can sign in now. Their next steps are on Getting agents ready.",
      type: "contracting",
    });

    try {
      const { queueEmail } = await import("@/lib/email/send.server");
      await queueEmail({
        template: "invite-accepted",
        profileId: inv.created_by,
        category: "team_activity",
        key: `invite-accepted:${inv.id}:${newUserId}`,
        data: { agentName: `${data.first_name} ${data.last_name}` },
      });
    } catch (e) {
      // A failed notification email must never fail the signup that triggered
      // it — the account exists either way.
      console.error("[invite] accepted email failed", e);
    }

    return { ok: true, userId: newUserId };
  });

// ============ AUTHENTICATED onboarding-step writers ============

async function loadInviteForUser(supabase: any, token: string, userId: string) {
  const { data: inv } = await supabaseAdmin.from("invitation_links").select("*").eq("token", token).maybeSingle();
  if (!inv) throw new Error("Invite not found");
  if (inv.is_reusable) return inv; // reusable links are not locked to a specific user
  if (inv.linked_agent_id && inv.linked_agent_id !== userId) throw new Error("Invite belongs to another user");
  if (!inv.linked_agent_id) {
    await supabaseAdmin.from("invitation_links").update({
      linked_agent_id: userId,
      status: "in_progress",
      agent_started_at: new Date().toISOString(),
    }).eq("id", inv.id);
    inv.linked_agent_id = userId;
  }
  return inv;
}

export const linkInviteToCurrentUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ token: z.string().min(8).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const inv = await loadInviteForUser(supabase, data.token, userId);

    // Recorded the same way a new signup is, so a shareable link reports all
    // of its acceptances whether the person was new or already had an account.
    await (supabaseAdmin as any).from("invite_acceptances").upsert(
      { invitation_id: inv.id, profile_id: userId },
      { onConflict: "invitation_id,profile_id", ignoreDuplicates: true },
    );

    // The link's chosen upline, falling back to whoever made it — links that
    // predate the picker carry null and still mean their creator.
    const inviteUplineId: string = (inv as any).upline_id ?? inv.created_by;

    // Set upline if not already set. Deliberately guarded: accepting a second
    // link must not move somebody out from under the upline they already have.
    await supabase.from("profiles").update({ upline_id: inviteUplineId }).eq("id", userId).is("upline_id", null);

    // The position is a separate write, and separately guarded, because the two
    // answer different questions. Folded into the update above, an agent who
    // already had an upline — the re-invited, the transferred — was skipped by
    // the upline guard and so never received a position either. Filling an
    // empty position is safe whatever their upline says; overwriting one they
    // already hold is not, which is what `.is(null)` protects.
    if (inv.agency_level_id) {
      await supabase.from("profiles")
        .update({ agency_level_id: inv.agency_level_id })
        .eq("id", userId).is("agency_level_id", null);
    }
    // Same as a fresh signup: the contract records and the contracting work to
    // obtain them, linked to each other.
    const assignments: any[] = Array.isArray(inv.carrier_assignments) ? inv.carrier_assignments : [];
    const createdRequests = await assignInviteCarriers({
      client: supabaseAdmin,
      agentId: userId,
      organizationId: inv.organization_id ?? null,
      createdBy: inv.created_by,
      assignments,
    });
    if (inv.organization_id) {
      await notifyContractingRequestsCreated({
        client: supabaseAdmin,
        organizationId: inv.organization_id,
        agentId: userId,
        uplineId: inv.created_by ?? null,
        count: createdRequests.length,
      });
    }

    return { ok: true, invite: inv };
  });

// The four onboarding-step writers that used to live here — personal details,
// carrier selection, the producer agreement and the SureLC hand-off — are gone.
//
// They existed because the invite wizard was the only onboarding there was.
// It is not: /onboarding derives what each agent still needs from live data and
// asks for one thing at a time, in the app, where it can be saved and returned
// to. Collecting the same fields at the door meant asking a stranger for their
// SSN before they had seen a single screen, and losing everything if they
// stopped. The producer agreement already had a home on the Producer Profile
// (signProducerAgreement), so this was a second copy of it.

// ============ UPLINE / ADMIN DASHBOARD ============

export const getMyContractedCarriers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;

    // Commission levels assigned by upline
    const { data: commLevels } = await supabase
      .from("agent_commission_levels")
      .select("carrier_id,assigned_pct,commission_level,carriers(id,name,is_annuity_carrier)")
      .eq("agent_id", userId);

    // Self-reported active contracts (Add Active Carrier flow)
    const { data: activeContracts } = await supabase
      .from("contract_requests")
      .select("carrier_id,carriers(id,name,is_annuity_carrier)")
      .eq("agent_id", userId)
      .eq("status", "active");

    // Commission levels take precedence; add self-reported carriers not already covered
    const commCarrierIds = new Set((commLevels ?? []).map((r: any) => r.carrier_id));
    const selfReported = (activeContracts ?? [])
      .filter((r: any) => !commCarrierIds.has(r.carrier_id))
      .map((r: any) => ({
        carrier_id: r.carrier_id,
        assigned_pct: 100,
        commission_level: null,
        carriers: r.carriers,
      }));

    return { rows: [...(commLevels ?? []), ...selfReported] };
  });

export const listOnboardingInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ scope: z.enum(["mine","downline"]).default("mine") }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    let query = supabase
      .from("invitation_links")
      .select("id,name,token,status,onboarding_step,carrier_assignments,created_at,agent_started_at,agent_completed_at,expires_at,linked_agent_id,new_agent_first_name,new_agent_last_name,new_agent_email,created_by,sent_on_behalf_of,surelc_agent_id")
      .order("created_at", { ascending: false });

    if (data.scope === "mine") {
      query = query.eq("created_by", userId);
    } else {
      // downline: get downline agents then filter
      const { data: downline } = await supabase.rpc("get_downline_agents");
      const ids = [userId, ...((downline ?? []) as any[]).map((d: any) => d.id)];
      query = query.in("created_by", ids);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    // Enrich with linked agent names
    const linkedIds = Array.from(new Set(((rows ?? []) as any[]).map((r: any) => r.linked_agent_id).filter(Boolean)));
    let agentMap = new Map<string, any>();
    if (linkedIds.length) {
      const { data: agents } = await supabase.from("profiles").select("id,first_name,last_name,email").in("id", linkedIds);
      (agents ?? []).forEach((a: any) => agentMap.set(a.id, a));
    }

    // How many people actually joined through each link. A shareable link has
    // many acceptances, so this is the only honest answer to "did my link
    // work" — the old linked_agent_id could only ever hold the first one.
    const inviteIds = ((rows ?? []) as any[]).map((r: any) => r.id);
    const accepted = new Map<string, number>();
    if (inviteIds.length) {
      const { data: acc } = await supabase
        .from("invite_acceptances").select("invitation_id").in("invitation_id", inviteIds);
      for (const a of (acc ?? []) as any[]) {
        accepted.set(a.invitation_id, (accepted.get(a.invitation_id) ?? 0) + 1);
      }
    }

    const now = Date.now();
    return {
      rows: (rows ?? []).map((r: any) => ({
        ...r,
        linked_agent: r.linked_agent_id ? agentMap.get(r.linked_agent_id) ?? null : null,
        accepted_count: accepted.get(r.id) ?? 0,
        expired: r.expires_at ? new Date(r.expires_at).getTime() < now : false,
        days_left: r.expires_at
          ? Math.ceil((new Date(r.expires_at).getTime() - now) / 86_400_000)
          : null,
      })),
    };
  });

export const addCarriersToInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    invite_id: z.string().uuid(),
    assignments: z.array(z.object({
      carrier_id: z.string().uuid(),
      carrier_name: z.string(),
      level_name: z.string().optional().nullable(),
      level_pct: z.number().min(0).max(200),
      release_needed: z.boolean().optional(),
    })).min(1).max(20),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    for (const a of data.assignments) {
      await assertLevelWithinUpline(supabase, userId, a.carrier_id, a.level_pct, a.carrier_name);
    }

    const { data: inv } = await supabase.from("invitation_links").select("carrier_assignments,linked_agent_id,created_by").eq("id", data.invite_id).maybeSingle();
    if (!inv) throw new Error("Invite not found");

    const existing = Array.isArray(inv.carrier_assignments) ? inv.carrier_assignments : [];
    const existingIds = new Set(existing.map((e: any) => e.carrier_id));
    const merged = [...existing, ...data.assignments.filter((a) => !existingIds.has(a.carrier_id))];

    const { error } = await supabase.from("invitation_links").update({ carrier_assignments: merged }).eq("id", data.invite_id);
    if (error) throw new Error(error.message);

    // Notify linked agent (if exists) via in-app
    if (inv.linked_agent_id) {
      const names = data.assignments.map((a) => a.carrier_name).join(", ");
      const many = data.assignments.length > 1;
      await supabase.from("notifications").insert({
        user_id: inv.linked_agent_id,
        title: many ? "New carriers added to your contracting" : "New carrier added to your contracting",
        description: `${names} ${many ? "have" : "has"} been added to your contracting application.`,
        type: "contracting",
      });

      const { queueEmail } = await import("@/lib/email/send.server");
      await queueEmail({
        template: "carrier-added",
        profileId: inv.linked_agent_id,
        category: "contract_updates",
        key: `carrier-added:${data.invite_id}:${data.assignments
          .map((a) => a.carrier_id)
          .sort()
          .join(",")}`,
        data: { carrierName: names },
      });
    }


    return { ok: true };
  });

export const updateInviteCarrierLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    invite_id: z.string().uuid(),
    carrier_id: z.string().uuid(),
    level_pct: z.number().min(0).max(200),
    level_name: z.string().max(64).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await assertLevelWithinUpline(supabase, userId, data.carrier_id, data.level_pct);

    const { data: inv } = await supabase.from("invitation_links")
      .select("carrier_assignments,onboarding_step").eq("id", data.invite_id).maybeSingle();
    if (!inv) throw new Error("Invite not found");
    if (inv.onboarding_step >= 4) throw new Error("Cannot edit level after SuranceBay step");

    const updated = (inv.carrier_assignments ?? []).map((c: any) =>
      c.carrier_id === data.carrier_id ? { ...c, level_pct: data.level_pct, level_name: data.level_name ?? c.level_name } : c
    );
    const { error } = await supabase.from("invitation_links").update({ carrier_assignments: updated }).eq("id", data.invite_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ invite_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    await supabase.from("invitation_links").update({ last_resent_at: new Date().toISOString() }).eq("id", data.invite_id);
    return { ok: true };
  });

// ============ Onboarding documents ============

export const listOnboardingDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ agent_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: docs, error } = await supabase
      .from("onboarding_documents")
      .select("id,doc_type,file_name,file_url,uploaded_at,uploaded_by")
      .eq("agent_id", data.agent_id)
      .order("uploaded_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { docs: docs ?? [] };
  });

export const recordOnboardingDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    agent_id: z.string().uuid(),
    doc_type: z.enum(["eo_certificate","aml_certificate","drivers_license","banking","agreement"]),
    file_url: z.string().min(1).max(500),
    file_name: z.string().min(1).max(255),
    invitation_id: z.string().uuid().optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { error } = await supabase.from("onboarding_documents").insert({
      agent_id: data.agent_id,
      uploaded_by: userId,
      doc_type: data.doc_type,
      file_url: data.file_url,
      file_name: data.file_name,
      invitation_id: data.invitation_id ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getOnboardingDocSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ doc_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: doc } = await supabase.from("onboarding_documents").select("file_url").eq("id", data.doc_id).maybeSingle();
    if (!doc?.file_url) throw new Error("Not found");
    const { data: signed, error } = await supabase.storage.from("agent-documents").createSignedUrl(doc.file_url, 3600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

// ============ Change requests ============

export const listChangeRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data, error } = await supabase
      .from("change_requests")
      .select("id,request_type,other_description,new_level_name,new_level_pct,status,submitted_at,resolved_at,agent_id,carrier_id,new_upline_id,contract_request_id,carriers(name),agent:agent_id(first_name,last_name),new_upline:new_upline_id(first_name,last_name)")
      .order("submitted_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const submitChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    agent_id: z.string().uuid(),
    contract_request_id: z.string().uuid(),
    carrier_id: z.string().uuid(),
    request_type: z.enum(["level_change","upline_transfer","other"]),
    other_description: z.string().max(1000).optional().nullable(),
    new_upline_id: z.string().uuid().optional().nullable(),
    new_level_name: z.string().max(64).optional().nullable(),
    new_level_pct: z.number().min(0).max(200).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    // Verify the contract has been active 90+ days
    const { data: cr } = await supabase
      .from("contract_requests").select("activated_at,status")
      .eq("id", data.contract_request_id).maybeSingle();
    if (!cr || cr.status !== "active" || !cr.activated_at) {
      throw new Error("Contract must be active to submit a change request.");
    }
    const ageMs = Date.now() - new Date(cr.activated_at).getTime();
    if (ageMs < 90 * 24 * 60 * 60 * 1000) {
      throw new Error("Contract must be active for at least 90 days.");
    }

    const { error } = await supabase.from("change_requests").insert({
      submitted_by: userId,
      agent_id: data.agent_id,
      carrier_id: data.carrier_id,
      contract_request_id: data.contract_request_id,
      request_type: data.request_type,
      other_description: data.other_description ?? null,
      new_upline_id: data.new_upline_id ?? null,
      new_level_name: data.new_level_name ?? null,
      new_level_pct: data.new_level_pct ?? null,
      status: "deferred",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateChangeRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    status: z.enum(["deferred","in_review","completed","denied"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const update: any = { status: data.status };
    if (data.status === "completed" || data.status === "denied") update.resolved_at = new Date().toISOString();
    const { error } = await supabase.from("change_requests").update(update).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteChangeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    // .select("id") so an RLS-filtered delete is reported rather than
    // returning ok. Postgres does not treat "matched no rows" as an error,
    // so this used to succeed silently and the change request stayed on screen
    // until the next refresh brought it back.
    const { data: gone, error } = await supabase
      .from("change_requests").delete().eq("id", data.id).select("id");
    if (error) throw new Error(error.message);
    if (!gone?.length) {
      throw new Error("That change request is no longer there, or it is not yours to delete.");
    }
    return { ok: true };
  });

// ============ SureLC Progress ============

export const listSurelcProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ scope: z.enum(["mine","downline"]).default("downline") }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    let agentIds: string[] = [];
    if (data.scope === "mine") {
      agentIds = [userId];
    } else {
      const { data: downline } = await supabase.rpc("get_downline_agents");
      agentIds = [userId, ...((downline ?? []) as any[]).map((d: any) => d.id)];
    }

    const { data: invites } = await supabase
      .from("invitation_links")
      .select("id,linked_agent_id,carrier_assignments,created_at,surelc_agent_id")
      .in("linked_agent_id", agentIds)
      .eq("status", "in_surelc");

    const linkedIds = Array.from(new Set(((invites ?? []) as any[]).map((i: any) => i.linked_agent_id)));
    if (linkedIds.length === 0) return { agents: [] };

    const { data: profiles } = await supabase.from("profiles").select("id,first_name,last_name").in("id", linkedIds);
    const profMap = new Map<string, any>();
    (profiles ?? []).forEach((p: any) => profMap.set(p.id, p));

    const { data: progress } = await supabase
      .from("surelc_progress").select("agent_id,section_name,completed,last_synced_at").in("agent_id", linkedIds);

    const agents = (invites ?? []).map((inv: any) => {
      const sections = (progress ?? []).filter((p: any) => p.agent_id === inv.linked_agent_id);
      const completed = sections.filter((s: any) => s.completed).length;
      const total = SURELC_SECTIONS.length;
      const profile = profMap.get(inv.linked_agent_id);
      const carriers = Array.isArray(inv.carrier_assignments) ? inv.carrier_assignments.map((c: any) => c.carrier_name) : [];
      return {
        agent_id: inv.linked_agent_id,
        agent_name: profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() : "Agent",
        invite_id: inv.id,
        invite_sent_at: inv.created_at,
        carriers,
        completed_count: completed,
        total_count: total,
        sections: SURELC_SECTIONS.map((name) => {
          const row = sections.find((s: any) => s.section_name === name);
          return { name, completed: row?.completed ?? false, last_synced_at: row?.last_synced_at ?? null };
        }),
      };
    });

    return { agents };
  });

export const refreshSurelcProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ agent_id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    // Stub: randomly advance 1-2 incomplete sections per agent
    let agentIds: string[];
    if (data.agent_id) {
      agentIds = [data.agent_id];
    } else {
      const { data: downline } = await supabase.rpc("get_downline_agents");
      agentIds = [userId, ...((downline ?? []) as any[]).map((d: any) => d.id)];
    }

    for (const aid of agentIds) {
      const { data: incomplete } = await supabase
        .from("surelc_progress").select("id").eq("agent_id", aid).eq("completed", false);
      const list = (incomplete ?? []) as any[];
      if (list.length === 0) continue;
      const advanceCount = Math.min(list.length, Math.random() < 0.4 ? 2 : 1);
      const shuffled = list.sort(() => Math.random() - 0.5).slice(0, advanceCount);
      for (const row of shuffled) {
        await supabase.from("surelc_progress").update({
          completed: true,
          last_synced_at: new Date().toISOString(),
        }).eq("id", row.id);
      }
    }
    return { ok: true };
  });

// ============ Misc helpers ============

export const searchDownlineAgents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ query: z.string().max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { data: downline } = await supabase.rpc("get_downline_agents");
    const q = data.query.toLowerCase().trim();
    const filtered = ((downline ?? []) as any[]).filter((a: any) => {
      if (!q) return true;
      return (`${a.first_name ?? ""} ${a.last_name ?? ""}`).toLowerCase().includes(q);
    }).slice(0, 20);
    return { agents: filtered };
  });

export const saveInviteSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ signature_html: z.string().max(5000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { error } = await supabase.from("profiles").update({ invite_signature_html: data.signature_html }).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyInviteSignature = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data } = await supabase.from("profiles").select("invite_signature_html").eq("id", userId).maybeSingle();
    return { signature_html: data?.invite_signature_html ?? "" };
  });

export const getActiveContractsForAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ agent_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await supabase
      .from("contract_requests")
      .select("id,carrier_id,activated_at,status,carriers(name)")
      .eq("agent_id", data.agent_id)
      .eq("status", "active")
      .lte("activated_at", cutoff);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ============ Enhanced createInviteV2 (with full carrier assignments + new agent fields) ============

const FullAssignmentSchema = z.object({
  carrier_id: z.string().uuid(),
  carrier_name: z.string(),
  level_name: z.string().optional().nullable(),
  level_pct: z.number().min(0).max(200),
  release_needed: z.boolean().optional().default(false),
});

export const createOnboardingInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    link_name:    z.string().trim().min(1).max(80),
    invited_role: z.enum(["agent", "manager", "agency_owner", "staff"]).default("agent"),
    // The position the invited agent lands on. The invite screen has required
    // this for agent and manager invites since it shipped, and the schema
    // dropped it on the floor — zod strips unknown keys, so the value was
    // discarded here, `invitation_links.agency_level_id` stayed null, and both
    // accept paths copied that null onto the new profile. Every agent in the
    // product has no position as a result. Named here, it survives.
    agency_level_id: z.string().uuid().nullable().optional(),
    assignments:  z.array(FullAssignmentSchema).max(50).optional().default([]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    // Validate every level ≤ upline's
    for (const a of data.assignments) {
      const { data: my } = await supabase
        .from("agent_commission_levels").select("assigned_pct")
        .eq("agent_id", userId).eq("carrier_id", a.carrier_id).maybeSingle();
      if (my && Number(my.assigned_pct) < a.level_pct) {
        throw new Error(`Level for ${a.carrier_name} (${a.level_pct}%) exceeds your assigned level.`);
      }
    }

    // Validate inviter can assign the requested role
    const { data: inviterRoles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const inviterRoleList = (inviterRoles ?? []).map((r: any) => r.role as string);

    // ── May you create an invite link at all? ──────────────────────────────
    //
    // Everything below this checks *which role* may be invited. Nothing
    // checked whether the caller may invite anybody, so an ordinary agent
    // could call this with the default invited_role of "agent" — no branch
    // applies to that value — and mint a link placing new agents in a
    // downline with carriers and comp levels pre-assigned.
    //
    // The nav offered it too (`unlock: "agency-member"`), but that is the
    // lesser half: hiding the entry would have left the server function open
    // to anybody who knew its name.
    //
    // Manager and above, because inviting into your own downline is a
    // manager's job. A plain agent or staff member is not building a team.
    const mayInviteAnyone = inviterRoleList.some((r: string) =>
      ["super_admin", "agency_owner", "admin", "manager"].includes(r),
    );
    if (!mayInviteAnyone) {
      throw new Error(
        "Creating invite links is limited to agency owners and managers. " +
        "Ask yours to send the link, or to grant you a manager role.",
      );
    }
    const canInviteAgencyOwner = inviterRoleList.includes("super_admin") || inviterRoleList.includes("agency_owner");
    const canInviteManager     = canInviteAgencyOwner || inviterRoleList.includes("manager");
    if (data.invited_role === "agency_owner" && !canInviteAgencyOwner) {
      throw new Error("Only agency owners and above can invite agency owners.");
    }
    if (data.invited_role === "manager" && !canInviteManager) {
      throw new Error("Only managers and above can invite managers.");
    }

    // Fetch inviter's organization
    const { data: inviterProfile } = await (supabase as any)
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();

    {
      const { assertNotDemo } = await import("@/lib/demo.server");
      await assertNotDemo(inviterProfile?.organization_id, "invite someone");
    }

    const token = crypto.randomUUID();

    // A position from another agency would be assignable by anyone holding its
    // id, and would put an agent on a ladder their own agency does not define.
    // Confirmed against the inviter's org rather than trusted from the client.
    let agencyLevelId: string | null = null;
    if (data.agency_level_id) {
      const { data: level } = await (supabase as any)
        .from("agency_levels")
        .select("id")
        .eq("id", data.agency_level_id)
        .eq("organization_id", inviterProfile?.organization_id ?? "")
        .maybeSingle();
      if (!level) throw new Error("That position is not one of your agency's.");
      agencyLevelId = level.id;
    }

    const { data: inserted, error } = await (supabase as any).from("invitation_links").insert({
      created_by:      userId,
      name:            data.link_name,
      link_name:       data.link_name,
      is_reusable:     true,
      new_agent_email: null,
      token,
      carrier_assignments: data.assignments,
      status:          "pending",
      onboarding_step: 0,
      invited_role:    data.invited_role,
      agency_level_id: agencyLevelId,
      organization_id: inviterProfile?.organization_id ?? null,
    }).select("id,token").single();

    if (error) throw new Error(error.message);

    return { ok: true, id: inserted.id, token: inserted.token };
  });
