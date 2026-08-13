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
 * The ceiling existed in two places, written out twice, and nowhere else â€” so
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
 * is the contract *record* â€” writing number, effective date, commission level,
 * and every historical contract that came in through an import. contracting_requests
 * is the *work* of obtaining one â€” the queue, the assignment, the readiness
 * check, the approvals. It even carries contract_record_id pointing at the
 * record it produces.
 *
 * Nothing ever set that column, and the invite only wrote the record half. So
 * an agent joined with carriers assigned, and the readiness checklist â€” which
 * reads the workflow half â€” reported they had not started contracting at all.
 *
 * This writes both and links them. A carrier the agency has not set up yet is
 * added to its directory rather than skipped â€” an owner putting a carrier on
 * an invite is saying the agency works with it, and skipping is what left
 * owners with carriers they could neither work nor remove.
 */
/**
 * Tell the people who have to do something about it.
 *
 * A pre-assigned carrier used to appear in the staff queue and nowhere else â€”
 * correct, but silent, so it sat unassigned until somebody happened to look.
 * The set is deliberately the same one the request would route to anyway: the
 * agent's direct upline, the agency owner, and every staffer who may submit
 * carrier requests.
 *
 * `may_notify` decides per person, so somebody who turned Contracting updates
 * off stays off. Failure is logged and swallowed â€” the requests are already
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
      // A missing function or a null answer must not silence the queue â€” the
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
 * Exported because it was not the only way. `createContractRequest` â€” what an
 * agent hits through Contracting â†’ Add Carrier â†’ "Request contracting" â€”
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
    // failed â€” an enum value missing, a constraint â€” the agent joined with
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
    // for this carrier and say so â€” a partial record is what caused the problem.
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
    // anything had been submitted to anybody â€” so an agent's contract page
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
      // Unassigned tab immediately. (There is no `open` status â€” the CHECK
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
    // agency vanished. This is the more important half of the invite guard â€”
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
    // and expensive to chase later â€” an NPN is the one identifier every
    // carrier packet needs and the agent already knows it by heart. Everything
    // else the packet wants is asked for by the readiness checklist, in the
    // app, where it can be saved and returned to.
    await supabaseAdmin.from("profiles").update({
      upline_id: inv.created_by,
      phone: data.phone,
      npn_number: data.npn_number || null,
      first_name: data.first_name,
      last_name: data.last_name,
      // Pending, not active. Choosing a password is not the same as being an
      // agent â€” a licence, an appointment and a first sale still sit between
      // the two. The agency owner can activate them at any point, and posting
      // a first policy does it automatically.
      status: "pending",
      agency_level_id: inv.agency_level_id ?? null,
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
    // person â€” and onboarding_step in particular made the shared link resume
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
      assignments,
    });
    if (inv.organization_id) {
      await notifyContractingRequestsCreated({
        client: supabaseAdmin,
        organizationId: inv.organization_id,
        agentId: newUserId,
        uplineId: inv.created_by ?? null,
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
      // it â€” the account exists either way.
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

    // Set upline if not already set
    await supabase.from("profiles").update({ upline_id: inv.created_by, agency_level_id: inv.agency_level_id ?? null }).eq("id", userId).is("upline_id", null);
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

// The four onboarding-step writers that used to live here â€” personal details,
// carrier selection, the producer agreement and the SureLC hand-off â€” are gone.
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
    // work" â€” the old linked_agent_id could only ever hold the first one.
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

    for (coÛÝx¶‰žËkºwµç@¡•ÉÉ½È¤Ñ¡É½Ü¹•ÜÉÉ½È¡•ÉÉ½È¹µ•ÍÍ…”¤ì(€€€É•ÑÕÉ¸ì½¬èÑÉÕ”ôì(€ô¤ì()•áÁ½ÉÐ½¹ÍÐ‘•±•Ñ•¡…¹•I•ÅÕ•ÍÐ€ôÉ•…Ñ•M•ÉÙ•É¸¡ìµ•Ñ¡½è€‰A=MPˆô¤(€€¹µ¥‘‘±•Ý…É”¡mÉ•ÅÕ¥É•MÕÁ…‰…Í•ÕÑ¡t¤(€€¹¥¹ÁÕÑY…±¥‘…Ñ½È ¡¤€ôøè¹½‰©•Ð¡ì¥èè¹ÍÑÉ¥¹œ ¤¹ÕÕ¥ ¤ô¤¹Á…ÉÍ”¡¤¤(€€¹¡…¹‘±•È¡…Íå¹Œ€¡ì‘…Ñ„°½¹Ñ•áÐô¤€ôøì(€€€½¹ÍÐìÍÕÁ…‰…Í”ô€ô½¹Ñ•áÐ…ÌÑàì(€€€€¼¼€¹Í•±•Ð ‰¥ˆ¤Í¼…¸I1Lµ™¥±Ñ•É•‘•±•Ñ”¥ÌÉ•Á½ÉÑ•É…Ñ¡•ÈÑ¡…¸(€€€€¼¼É•ÑÕÉ¹¥¹œ½¬¸A½ÍÑÉ•Ì‘½•Ì¹½ÐÑÉ•…Ð€‰µ…Ñ¡•¹¼É½ÝÌˆ…Ì…¸•ÉÉ½È°(€€€€¼¼Í¼Ñ¡¥ÌÕÍ•Ñ¼ÍÕ••Í¥±•¹Ñ±ä…¹Ñ¡”¡…¹”É•ÅÕ•ÍÐÍÑ…å•½¸ÍÉ••¸(€€€€¼¼Õ¹Ñ¥°Ñ¡”¹•áÐÉ•™É•Í ‰É½Õ¡Ð¥Ð‰…¬¸(€€€½¹ÍÐì‘…Ñ„è½¹”°•ÉÉ½Èô€ô…Ý…¥ÐÍÕÁ…‰…Í”(€€€€€€¹™É½´ ‰¡…¹•}É•ÅÕ•ÍÑÌˆ¤¹‘•±•Ñ” ¤¹•Ä ‰¥ˆ°‘…Ñ„¹¥¤¹Í•±•Ð ‰¥ˆ¤ì(€€€¥˜€¡•ÉÉ½È¤Ñ¡É½Ü¹•ÜÉÉ½È¡•ÉÉ½È¹µ•ÍÍ…”¤ì(€€€¥˜€ …½¹”ü¹±•¹Ñ ¤ì(€€€€€Ñ¡É½Ü¹•ÜÉÉ½È ‰Q¡…Ð¡…¹”É•ÅÕ•ÍÐ¥Ì¹¼±½¹•ÈÑ¡•É”°½È¥Ð¥Ì¹½Ðå½ÕÉÌÑ¼‘•±•Ñ”¸ˆ¤ì(€€€ô(€€€É•ÑÕÉ¸ì½¬èÑÉÕ”ôì(€ô¤ì((¼¼€ôôôôôôôôôôôôMÕÉ•1AÉ½É•ÍÌ€ôôôôôôôôôôôô()•áÁ½ÉÐ½¹ÍÐ±¥ÍÑMÕÉ•±AÉ½É•ÍÌ€ôÉ•…Ñ•M•ÉÙ•É¸¡ìµ•Ñ¡½è€‰A=MPˆô¤(€€¹µ¥‘‘±•Ý…É”¡mÉ•ÅÕ¥É•MÕÁ…‰…Í•ÕÑ¡t¤(€€¹¥¹ÁÕÑY…±¥‘…Ñ½È ¡¤€ôøè¹½‰©•Ð¡ìÍ½Á”èè¹•¹Õ´¡l‰µ¥¹”ˆ°‰‘½Ý¹±¥¹”‰t¤¹‘•™…Õ±Ð ‰‘½Ý¹±¥¹”ˆ¤ô¤¹Á…ÉÍ”¡¤¤(€€¹¡…¹‘±•È¡…Íå¹Œ€¡ì‘…Ñ„°½¹Ñ•áÐô¤€ôøì(€€€½¹ÍÐìÍÕÁ…‰…Í”°ÕÍ•É%ô€ô½¹Ñ•áÐ…ÌÑàì((€€€±•Ð…•¹Ñ%‘ÌèÍÑÉ¥¹mt€ômtì(€€€¥˜€¡‘…Ñ„¹Í½Á”€ôôô€‰µ¥¹”ˆ¤ì(€€€€€…•¹Ñ%‘Ì€ômÕÍ•É%‘tì(€€€ô•±Í”ì(€€€€€½¹ÍÐì‘…Ñ„è‘½Ý¹±¥¹”ô€ô…Ý…¥ÐÍÕÁ…‰…Í”¹ÉÁŒ ‰•Ñ}‘½Ý¹±¥¹•}…•¹ÑÌˆ¤ì(€€€€€…•¹Ñ%‘Ì€ômÕÍ•É%°€¸¸¸ ¡‘½Ý¹±¥¹”€üümt¤…Ì…¹åmt¤¹µ…À ¡è…¹ä¤€ôø¹¥¥tì(€€€ô((€€€½¹ÍÐì‘…Ñ„è¥¹Ù¥Ñ•Ìô€ô…Ý…¥ÐÍÕÁ…‰…Í”(€€€€€€¹™É½´ ‰¥¹Ù¥Ñ…Ñ¥½¹}±¥¹­Ìˆ¤(€€€€€€¹Í•±•Ð ‰¥±±¥¹­•‘}…•¹Ñ}¥±…ÉÉ¥•É}…ÍÍ¥¹µ•¹ÑÌ±É•…Ñ•‘}…Ð±ÍÕÉ•±}…•¹Ñ}¥ˆ¤(€€€€€€¹¥¸ ‰±¥¹­•‘}…•¹Ñ}¥ˆ°…•¹Ñ%‘Ì¤(€€€€€€¹•Ä ‰ÍÑ…ÑÕÌˆ°€‰¥¹}ÍÕÉ•±Œˆ¤ì((€€€½¹ÍÐ±¥¹­•‘%‘Ì€ôÉÉ…ä¹™É½´¡¹•ÜM•Ð  ¡¥¹Ù¥Ñ•Ì€üümt¤…Ì…¹åmt¤¹µ…À ¡¤è…¹ä¤€ôø¤¹±¥¹­•‘}…•¹Ñ}¥¤¤¤ì(€€€¥˜€¡±¥¹­•‘%‘Ì¹±•¹Ñ €ôôô€À¤É•ÑÕÉ¸ì…•¹ÑÌèmtôì((€€€½¹ÍÐì‘…Ñ„èÁÉ½™¥±•Ìô€ô…Ý…¥ÐÍÕÁ…‰…Í”¹™É½´ ‰ÁÉ½™¥±•Ìˆ¤¹Í•±•Ð ‰¥±™¥ÉÍÑ}¹…µ”±±…ÍÑ}¹…µ”ˆ¤¹¥¸ ‰¥ˆ°±¥¹­•‘%‘Ì¤ì(€€€½¹ÍÐÁÉ½™5…À€ô¹•Ü5…ÀñÍÑÉ¥¹œ°…¹äø ¤ì(€€€€¡ÁÉ½™¥±•Ì€üümt¤¹™½É…  ¡Àè…¹ä¤€ôøÁÉ½™5…À¹Í•Ð¡À¹¥°À¤¤ì((€€€½¹ÍÐì‘…Ñ„èÁÉ½É•ÍÌô€ô…Ý…¥ÐÍÕÁ…‰…Í”(€€€€€€¹™É½´ ‰ÍÕÉ•±}ÁÉ½É•ÍÌˆ¤¹Í•±•Ð ‰…•¹Ñ}¥±Í•Ñ¥½¹}¹…µ”±½µÁ±•Ñ•±±…ÍÑ}Íå¹•‘}…Ðˆ¤¹¥¸ ‰…•¹Ñ}¥ˆ°±¥¹­•‘%‘Ì¤ì((€€€½¹ÍÐ…•¹ÑÌ€ô€¡¥¹Ù¥Ñ•Ì€üümt¤¹µ…À ¡¥¹Øè…¹ä¤€ôøì(€€€€€½¹ÍÐÍ•Ñ¥½¹Ì€ô€¡ÁÉ½É•ÍÌ€üümt¤¹™¥±Ñ•È ¡Àè…¹ä¤€ôøÀ¹…•¹Ñ}¥€ôôô¥¹Ø¹±¥¹­•‘}…•¹Ñ}¥¤ì(€€€€€½¹ÍÐ½µÁ±•Ñ•€ôÍ•Ñ¥½¹Ì¹™¥±Ñ•È ¡Ìè…¹ä¤€ôøÌ¹½µÁ±•Ñ•¤¹±•¹Ñ ì(€€€€€½¹ÍÐÑ½Ñ…°€ôMUI1}MQ%=9L¹±•¹Ñ ì(€€€€€½¹ÍÐÁÉ½™¥±”€ôÁÉ½™5…À¹•Ð¡¥¹Ø¹±¥¹­•‘}…•¹Ñ}¥¤ì(€€€€€½¹ÍÐ…ÉÉ¥•ÉÌ€ôÉÉ…ä¹¥ÍÉÉ…ä¡¥¹Ø¹…ÉÉ¥•É}…ÍÍ¥¹µ•¹ÑÌ¤€ü¥¹Ø¹…ÉÉ¥•É}…ÍÍ¥¹µ•¹ÑÌ¹µ…À ¡Œè…¹ä¤€ôøŒ¹…ÉÉ¥•É}¹…µ”¤€èmtì(€€€€€É•ÑÕÉ¸ì(€€€€€€€…•¹Ñ}¥è¥¹Ø¹±¥¹­•‘}…•¹Ñ}¥°(€€€€€€€…•¹Ñ}¹…µ”èÁÉ½™¥±”€ü€‘íÁÉ½™¥±”¹™¥ÉÍÑ}¹…µ”€üü€ˆ‰ô€‘íÁÉ½™¥±”¹±…ÍÑ}¹…µ”€üü€ˆ‰õ€¹ÑÉ¥´ ¤€è€‰•¹Ðˆ°(€€€€€€€¥¹Ù¥Ñ•}¥è¥¹Ø¹¥°(€€€€€€€¥¹Ù¥Ñ•}Í•¹Ñ}…Ðè¥¹Ø¹É•…Ñ•‘}…Ð°(€€€€€€€…ÉÉ¥•ÉÌ°(€€€€€€€½µÁ±•Ñ•‘}½Õ¹Ðè½µÁ±•Ñ•°(€€€€€€€Ñ½Ñ…±}½Õ¹ÐèÑ½Ñ…°°(€€€€€€€Í•Ñ¥½¹ÌèMUI1}MQ%=9L¹µ…À ¡¹…µ”¤€ôøì(€€€€€€€€€½¹ÍÐÉ½Ü€ôÍ•Ñ¥½¹Ì¹™¥¹ ¡Ìè…¹ä¤€ôøÌ¹Í•Ñ¥½¹}¹…µ”€ôôô¹…µ”¤ì(€€€€€€€€€É•ÑÕÉ¸ì¹…µ”°½µÁ±•Ñ•èÉ½Üü¹½µÁ±•Ñ•€üü™…±Í”°±…ÍÑ}Íå¹•‘}…ÐèÉ½Üü¹±…ÍÑ}Íå¹•‘}…Ð€üü¹Õ±°ôì(€€€€€€€ô¤°(€€€€€ôì(€€€ô¤ì((€€€É•ÑÕÉ¸ì…•¹ÑÌôì(€ô¤ì()•áÁ½ÉÐ½¹ÍÐÉ•™É•Í¡MÕÉ•±AÉ½É•ÍÌ€ôÉ•…Ñ•M•ÉÙ•É¸¡ìµ•Ñ¡½è€‰A=MPˆô¤(€€¹µ¥‘‘±•Ý…É”¡mÉ•ÅÕ¥É•MÕÁ…‰…Í•ÕÑ¡t¤(€€¹¥¹ÁÕÑY…±¥‘…Ñ½È ¡¤€ôøè¹½‰©•Ð¡ì…•¹Ñ}¥èè¹ÍÑÉ¥¹œ ¤¹ÕÕ¥ ¤¹½ÁÑ¥½¹…° ¤ô¤¹Á…ÉÍ”¡¤¤(€€¹¡…¹‘±•È¡…Íå¹Œ€¡ì‘…Ñ„°½¹Ñ•áÐô¤€ôøì(€€€½¹ÍÐìÍÕÁ…‰…Í”°ÕÍ•É%ô€ô½¹Ñ•áÐ…ÌÑàì((€€€€¼¼MÑÕˆèÉ…¹‘½µ±ä…‘Ù…¹”€Ä´È¥¹½µÁ±•Ñ”Í•Ñ¥½¹ÌÁ•È…•¹Ð(€€€±•Ð…•¹Ñ%‘ÌèÍÑÉ¥¹mtì(€€€¥˜€¡‘…Ñ„¹…•¹Ñ}¥¤ì(€€€€€…•¹Ñ%‘Ì€ôm‘…Ñ„¹…•¹Ñ}¥‘tì(€€€ô•±Í”ì(€€€€€½¹ÍÐì‘…Ñ„è‘½Ý¹±¥¹”ô€ô…Ý…¥ÐÍÕÁ…‰…Í”¹ÉÁŒ ‰•Ñ}‘½Ý¹±¥¹•}…•¹ÑÌˆ¤ì(€€€€€…•¹Ñ%‘Ì€ômÕÍ•É%°€¸¸¸ ¡‘½Ý¹±¥¹”€üümt¤…Ì…¹åmt¤¹µ…À ¡è…¹ä¤€ôø¹¥¥tì(€€€ô((€€€™½È€¡½¹ÍÐ…¥½˜…•¹Ñ%‘Ì¤ì(€€€€€½¹ÍÐì‘…Ñ„è¥¹½µÁ±•Ñ”ô€ô…Ý…¥ÐÍÕÁ…‰…Í”(€€€€€€€€¹™É½´ ‰ÍÕÉ•±}ÁÉ½É•ÍÌˆ¤¹Í•±•Ð ‰¥ˆ¤¹•Ä ‰…•¹Ñ}¥ˆ°…¥¤¹•Ä ‰½µÁ±•Ñ•ˆ°™…±Í”¤ì(€€€€€½¹ÍÐ±¥ÍÐ€ô€¡¥¹½µÁ±•Ñ”€üümt¤…Ì…¹åmtì(€€€€€¥˜€¡±¥ÍÐ¹±•¹Ñ €ôôô€À¤½¹Ñ¥¹Õ”ì(€€€€€½¹ÍÐ…‘Ù…¹•½Õ¹Ð€ô5…Ñ ¹µ¥¸¡±¥ÍÐ¹±•¹Ñ °5…Ñ ¹É…¹‘½´ ¤€ð€À¸Ð€ü€È€è€Ä¤ì(€€€€€½¹ÍÐÍ¡Õ™™±•€ô±¥ÍÐ¹Í½ÉÐ  ¤€ôø5…Ñ ¹É…¹‘½´ ¤€´€À¸Ô¤¹Í±¥” À°…‘Ù…¹•½Õ¹Ð¤ì(€€€€€™½È€¡½¹ÍÐÉ½Ü½˜Í¡Õ™™±•¤ì(€€€€€€€…Ý…¥ÐÍÕÁ…‰…Í”¹™É½´ ‰ÍÕÉ•±}ÁÉ½É•ÍÌˆ¤¹ÕÁ‘…Ñ”¡ì(€€€€€€€€€½µÁ±•Ñ•èÑÉÕ”°(€€€€€€€€€±…ÍÑ}Íå¹•‘}…Ðè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°(€€€€€€€ô¤¹•Ä ‰¥ˆ°É½Ü¹¥¤ì(€€€€€ô(€€€ô(€€€É•ÑÕÉ¸ì½¬èÑÉÕ”ôì(€ô¤ì((¼¼€ôôôôôôôôôôôô5¥ÍŒ¡•±Á•ÉÌ€ôôôôôôôôôôôô()•áÁ½ÉÐ½¹ÍÐÍ•…É¡½Ý¹±¥¹••¹ÑÌ€ôÉ•…Ñ•M•ÉÙ•É¸¡ìµ•Ñ¡½è€‰A=MPˆô¤(€€¹µ¥‘‘±•Ý…É”¡mÉ•ÅÕ¥É•MÕÁ…‰…Í•ÕÑ¡t¤(€€¹¥¹ÁÕÑY…±¥‘…Ñ½È ¡¤€ôøè¹½‰©•Ð¡ìÅÕ•Éäèè¹ÍÑÉ¥¹œ ¤¹µ…à àÀ¤ô¤¹Á…ÉÍ”¡¤¤(€€¹¡…¹‘±•È¡…Íå¹Œ€¡ì‘…Ñ„°½¹Ñ•áÐô¤€ôøì(€€€½¹ÍÐìÍÕÁ…‰…Í”ô€ô½¹Ñ•áÐ…ÌÑàì(€€€½¹ÍÐì‘…Ñ„è‘½Ý¹±¥¹”ô€ô…Ý…¥ÐÍÕÁ…‰…Í”¹ÉÁŒ ‰•Ñ}‘½Ý¹±¥¹•}…•¹ÑÌˆ¤ì(€€€½¹ÍÐÄ€ô‘…Ñ„¹ÅÕ•Éä¹Ñ½1½Ý•É…Í” ¤¹ÑÉ¥´ ¤ì(€€€½¹ÍÐ™¥±Ñ•É•€ô€ ¡‘½Ý¹±¥¹”€üümt¤…Ì…¹åmt¤¹™¥±Ñ•È ¡„è…¹ä¤€ôøì(€€€€€¥˜€ …Ä¤É•ÑÕÉ¸ÑÉÕ”ì(€€€€€É•ÑÕÉ¸€¡€‘í„¹™¥ÉÍÑ}¹…µ”€üü€ˆ‰ô€‘í„¹±…ÍÑ}¹…µ”€üü€ˆ‰õ€¤¹Ñ½1½Ý•É…Í” ¤¹¥¹±Õ‘•Ì¡Ä¤ì(€€€ô¤¹Í±¥” À°€ÈÀ¤ì(€€€É•ÑÕÉ¸ì…•¹ÑÌè™¥±Ñ•É•ôì(€ô¤ì()•áÁ½ÉÐ½¹ÍÐÍ…Ù•%¹Ù¥Ñ•M¥¹…ÑÕÉ”€ôÉ•…Ñ•M•ÉÙ•É¸¡ìµ•Ñ¡½è€‰A=MPˆô¤(€€¹µ¥‘‘±•Ý…É”¡mÉ•ÅÕ¥É•MÕÁ…‰…Í•ÕÑ¡t¤(€€¹¥¹ÁÕÑY…±¥‘…Ñ½È ¡¤€ôøè¹½‰©•Ð¡ìÍ¥¹…ÑÕÉ•}¡Ñµ°èè¹ÍÑÉ¥¹œ ¤¹µ…à ÔÀÀÀ¤ô¤¹Á…ÉÍ”¡¤¤(€€¹¡…¹‘±•È¡…Íå¹Œ€¡ì‘…Ñ„°½¹Ñ•áÐô¤€ôøì(€€€½¹ÍÐìÍÕÁ…‰…Í”°ÕÍ•É%ô€ô½¹Ñ•áÐ…ÌÑàì(€€€½¹ÍÐì•ÉÉ½Èô€ô…Ý…¥ÐÍÕÁ…‰…Í”¹™É½´ ‰ÁÉ½™¥±•Ìˆ¤¹ÕÁ‘…Ñ”¡ì¥¹Ù¥Ñ•}Í¥¹…ÑÕÉ•}¡Ñµ°è‘…Ñ„¹Í¥¹…ÑÕÉ•}¡Ñµ°ô¤¹•Ä ‰¥ˆ°ÕÍ•É%¤ì(€€€¥˜€¡•ÉÉ½È¤Ñ¡É½Ü¹•ÜÉÉ½È¡•ÉÉ½È¹µ•ÍÍ…”¤ì(€€€É•ÑÕÉ¸ì½¬èÑÉÕ”ôì(€ô¤ì()•áÁ½ÉÐ½¹ÍÐ•Ñ5å%¹Ù¥Ñ•M¥¹…ÑÕÉ”€ôÉ•…Ñ•M•ÉÙ•É¸¡ìµ•Ñ¡½è€‰Pˆô¤(€€¹µ¥‘‘±•Ý…É”¡mÉ•ÅÕ¥É•MÕÁ…‰…Í•ÕÑ¡t¤(€€¹¡…¹‘±•È¡…Íå¹Œ€¡ì½¹Ñ•áÐô¤€ôøì(€€€½¹ÍÐìÍÕÁ…‰…Í”°ÕÍ•É%ô€ô½¹Ñ•áÐ…ÌÑàì(€€€½¹ÍÐì‘…Ñ„ô€ô…Ý…¥ÐÍÕÁ…‰…Í”¹™É½´ ‰ÁÉ½™¥±•Ìˆ¤¹Í•±•Ð ‰¥¹Ù¥Ñ•}Í¥¹…ÑÕÉ•}¡Ñµ°ˆ¤¹•Ä ‰¥ˆ°ÕÍ•É%¤¹µ…å‰•M¥¹±” ¤ì(€€€É•ÑÕÉ¸ìÍ¥¹…ÑÕÉ•}¡Ñµ°è‘…Ñ„ü¹¥¹Ù¥Ñ•}Í¥¹…ÑÕÉ•}¡Ñµ°€üü€ˆˆôì(€ô¤ì()•áÁ½ÉÐ½¹ÍÐ•ÑÑ¥Ù•½¹ÑÉ…ÑÍ½É•¹Ð€ôÉ•…Ñ•M•ÉÙ•É¸¡ìµ•Ñ¡½è€‰A=MPˆô¤(€€¹µ¥‘‘±•Ý…É”¡mÉ•ÅÕ¥É•MÕÁ…‰…Í•ÕÑ¡t¤(€€¹¥¹ÁÕÑY…±¥‘…Ñ½È ¡¤€ôøè¹½‰©•Ð¡ì…•¹Ñ}¥èè¹ÍÑÉ¥¹œ ¤¹ÕÕ¥ ¤ô¤¹Á…ÉÍ”¡¤¤(€€¹¡…¹‘±•È¡…Íå¹Œ€¡ì‘…Ñ„°½¹Ñ•áÐô¤€ôøì(€€€½¹ÍÐìÍÕÁ…‰…Í”ô€ô½¹Ñ•áÐ…ÌÑàì(€€€½¹ÍÐÕÑ½™˜€ô¹•Ü…Ñ”¡…Ñ”¹¹½Ü ¤€´€äÀ€¨€ÈÐ€¨€ØÀ€¨€ØÀ€¨€ÄÀÀÀ¤¹Ñ½%M=MÑÉ¥¹œ ¤ì(€€€½¹ÍÐì‘…Ñ„èÉ½ÝÌ°•ÉÉ½Èô€ô…Ý…¥ÐÍÕÁ…‰…Í”(€€€€€€¹™É½´ ‰½¹ÑÉ…Ñ}É•ÅÕ•ÍÑÌˆ¤(€€€€€€¹Í•±•Ð ‰¥±…ÉÉ¥•É}¥±…Ñ¥Ù…Ñ•‘}…Ð±ÍÑ…ÑÕÌ±…ÉÉ¥•ÉÌ¡¹…µ”¤ˆ¤(€€€€€€¹•Ä ‰…•¹Ñ}¥ˆ°‘…Ñ„¹…•¹Ñ}¥¤(€€€€€€¹•Ä ‰ÍÑ…ÑÕÌˆ°€‰…Ñ¥Ù”ˆ¤(€€€€€€¹±Ñ” ‰…Ñ¥Ù…Ñ•‘}…Ðˆ°ÕÑ½™˜¤ì(€€€¥˜€¡•ÉÉ½È¤Ñ¡É½Ü¹•ÜÉÉ½È¡•ÉÉ½È¹µ•ÍÍ…”¤ì(€€€É•ÑÕÉ¸ìÉ½ÝÌèÉ½ÝÌ€üümtôì(€ô¤ì((¼¼€ôôôôôôôôôôôô¹¡…¹•É•…Ñ•%¹Ù¥Ñ•XÈ€¡Ý¥Ñ ™Õ±°…ÉÉ¥•È…ÍÍ¥¹µ•¹ÑÌ€¬¹•Ü…•¹Ð™¥•±‘Ì¤€ôôôôôôôôôôôô()½¹ÍÐÕ±±ÍÍ¥¹µ•¹ÑM¡•µ„€ôè¹½‰©•Ð¡ì(€…ÉÉ¥•É}¥èè¹ÍÑÉ¥¹œ ¤¹ÕÕ¥ ¤°(€…ÉÉ¥•É}¹…µ”èè¹ÍÑÉ¥¹œ ¤°(€±•Ù•±}¹…µ”èè¹ÍÑÉ¥¹œ ¤¹½ÁÑ¥½¹…° ¤¹¹Õ±±…‰±” ¤°(€±•Ù•±}ÁÐèè¹¹Õµ‰•È ¤¹µ¥¸ À¤¹µ…à ÈÀÀ¤°(€É•±•…Í•}¹••‘•èè¹‰½½±•…¸ ¤¹½ÁÑ¥½¹…° ¤¹‘•™…Õ±Ð¡™…±Í”¤°)ô¤ì()•áÁ½ÉÐ½¹ÍÐÉ•…Ñ•=¹‰½…É‘¥¹%¹Ù¥Ñ”€ôÉ•…Ñ•M•ÉÙ•É¸¡ìµ•Ñ¡½è€‰A=MPˆô¤(€€¹µ¥‘‘±•Ý…É”¡mÉ•ÅÕ¥É•MÕÁ…‰…Í•ÕÑ¡t¤(€€¹¥¹ÁÕÑY…±¥‘…Ñ½È ¡¤€ôøè¹½‰©•Ð¡ì(€€€±¥¹­}¹…µ”è€€€è¹ÍÑÉ¥¹œ ¤¹ÑÉ¥´ ¤¹µ¥¸ Ä¤¹µ…à àÀ¤°(€€€¥¹Ù¥Ñ•‘}É½±”èè¹•¹Õ´¡l‰…•¹Ðˆ°€‰µ…¹…•Èˆ°€‰…•¹å}½Ý¹•Èˆ°€‰ÍÑ…™˜‰t¤¹‘•™…Õ±Ð ‰…•¹Ðˆ¤°(€€€…•¹å}±•Ù•±}¥èè¹ÍÑÉ¥¹œ ¤¹ÕÕ¥ ¤¹¹Õ±±…‰±” ¤¹½ÁÑ¥½¹…° ¤°(€€€…ÍÍ¥¹µ•¹ÑÌè€è¹…ÉÉ…ä¡Õ±±ÍÍ¥¹µ•¹ÑM¡•µ„¤¹µ…à ÔÀ¤¹½ÁÑ¥½¹…° ¤¹‘•™…Õ±Ð¡mt¤°(€ô¤¹Á…ÉÍ”¡¤¤(€€¹¡…¹‘±•È¡…Íå¹Œ€¡ì‘…Ñ„°½¹Ñ•áÐô¤€ôøì(€€€½¹ÍÐìÍÕÁ…‰…Í”°ÕÍ•É%ô€ô½¹Ñ•áÐ…ÌÑàì((€€€€¼¼Y…±¥‘…Ñ”•Ù•Éä±•Ù•°ƒŠ&ÕÁ±¥¹”Ì(€€€™½È€¡½¹ÍÐ„½˜‘…Ñ„¹…ÍÍ¥¹µ•¹ÑÌ¤ì(€€€€€½¹ÍÐì‘…Ñ„èµäô€ô…Ý…¥ÐÍÕÁ…‰…Í”(€€€€€€€€¹™É½´ ‰…•¹Ñ}½µµ¥ÍÍ¥½¹}±•Ù•±Ìˆ¤¹Í•±•Ð ‰…ÍÍ¥¹•‘}ÁÐˆ¤(€€€€€€€€¹•Ä ‰…•¹Ñ}¥ˆ°ÕÍ•É%¤¹•Ä ‰…ÉÉ¥•É}¥ˆ°„¹…ÉÉ¥•É}¥¤¹µ…å‰•M¥¹±” ¤ì(€€€€€¥˜€¡µä€˜˜9Õµ‰•È¡µä¹…ÍÍ¥¹•‘}ÁÐ¤€ð„¹±•Ù•±}ÁÐ¤ì(€€€€€€€Ñ¡É½Ü¹•ÜÉÉ½È¡1•Ù•°™½È€‘í„¹…ÉÉ¥•É}¹…µ•ô€ ‘í„¹±•Ù•±}ÁÑô”¤•á••‘Ìå½ÕÈ…ÍÍ¥¹•±•Ù•°¹€¤ì(€€€€€ô(€€€ô((€€€€¼¼Y…±¥‘…Ñ”¥¹Ù¥Ñ•È…¸…ÍÍ¥¸Ñ¡”É•ÅÕ•ÍÑ•É½±”(€€€½¹ÍÐì‘…Ñ„è¥¹Ù¥Ñ•ÉI½±•Ìô€ô…Ý…¥ÐÍÕÁ…‰…Í”¹™É½´ ‰ÕÍ•É}É½±•Ìˆ¤¹Í•±•Ð ‰É½±”ˆ¤¹•Ä ‰ÕÍ•É}¥ˆ°ÕÍ•É%¤ì(€€€½¹ÍÐ¥¹Ù¥Ñ•ÉI½±•1¥ÍÐ€ô€¡¥¹Ù¥Ñ•ÉI½±•Ì€üümt¤¹µ…À ¡Èè…¹ä¤€ôøÈ¹É½±”…ÌÍÑÉ¥¹œ¤ì((€€€€¼¼ƒŠRŠR 5…äå½ÔÉ•…Ñ”…¸¥¹Ù¥Ñ”±¥¹¬…Ð…±°üƒŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠRŠR (€€€€¼¼(€€€€¼¼Ù•ÉåÑ¡¥¹œ‰•±½ÜÑ¡¥Ì¡•­Ì€©Ý¡¥ É½±”¨µ…ä‰”¥¹Ù¥Ñ•¸9½Ñ¡¥¹œ(€€€€¼¼¡•­•Ý¡•Ñ¡•ÈÑ¡”…±±•Èµ…ä¥¹Ù¥Ñ”…¹å‰½‘ä°Í¼…¸½É‘¥¹…Éä…•¹Ð(€€€€¼¼½Õ±…±°Ñ¡¥ÌÝ¥Ñ Ñ¡”‘•™…Õ±Ð¥¹Ù¥Ñ•‘}É½±”½˜€‰…•¹ÐˆƒŠP¹¼‰É…¹ (€€€€¼¼…ÁÁ±¥•ÌÑ¼Ñ¡…ÐÙ…±Õ”ƒŠP…¹µ¥¹Ð„±¥¹¬Á±…¥¹œ¹•Ü…•¹ÑÌ¥¸„(€€€€¼¼‘½Ý¹±¥¹”Ý¥Ñ …ÉÉ¥•ÉÌ…¹½µÀ±•Ù•±ÌÁÉ”µ…ÍÍ¥¹•¸(€€€€¼¼(€€€€¼¼Q¡”¹…Ø½™™•É•¥ÐÑ½¼€¡Õ¹±½¬è€‰…•¹äµµ•µ‰•È‰€¤°‰ÕÐÑ¡…Ð¥ÌÑ¡”(€€€€¼¼±•ÍÍ•È¡…±˜è¡¥‘¥¹œÑ¡”•¹ÑÉäÝ½Õ±¡…Ù”±•™ÐÑ¡”Í•ÉÙ•È™Õ¹Ñ¥½¸½Á•¸(€€€€¼¼Ñ¼…¹å‰½‘äÝ¡¼­¹•Ü¥ÑÌ¹…µ”¸(€€€€¼¼(€€€€¼¼5…¹…•È…¹…‰½Ù”°‰•…ÕÍ”¥¹Ù¥Ñ¥¹œ¥¹Ñ¼å½ÕÈ½Ý¸‘½Ý¹±¥¹”¥Ì„(€€€€¼¼µ…¹…•ÈÌ©½ˆ¸Á±…¥¸…•¹Ð½ÈÍÑ…™˜µ•µ‰•È¥Ì¹½Ð‰Õ¥±‘¥¹œ„Ñ•…´¸(€€€½¹ÍÐµ…å%¹Ù¥Ñ•¹å½¹”€ô¥¹Ù¥Ñ•ÉI½±•1¥ÍÐ¹Í½µ” ¡ÈèÍÑÉ¥¹œ¤€ôø(€€€€€l‰ÍÕÁ•É}…‘µ¥¸ˆ°€‰…•¹å}½Ý¹•Èˆ°€‰…‘µ¥¸ˆ°€‰µ…¹…•È‰t¹¥¹±Õ‘•Ì¡È¤°(€€€€¤ì(€€€¥˜€ …µ…å%¹Ù¥Ñ•¹å½¹”¤ì(€€€€€Ñ¡É½Ü¹•ÜÉÉ½È (€€€€€€€€‰É•…Ñ¥¹œ¥¹Ù¥Ñ”±¥¹­Ì¥Ì±¥µ¥Ñ•Ñ¼…•¹ä½Ý¹•ÉÌ…¹µ…¹…•ÉÌ¸€ˆ€¬(€€€€€€€€‰Í¬å½ÕÉÌÑ¼Í•¹Ñ¡”±¥¹¬°½ÈÑ¼É…¹Ðå½Ô„µ…¹…•ÈÉ½±”¸ˆ°(€€€€€€¤ì(€€€ô(€€€½¹ÍÐ…¹%¹Ù¥Ñ••¹å=Ý¹•È€ô¥¹Ù¥Ñ•ÉI½±•1¥ÍÐ¹¥¹±Õ‘•Ì ‰ÍÕÁ•É}…‘µ¥¸ˆ¤ñð¥¹Ù¥Ñ•ÉI½±•1¥ÍÐ¹¥¹±Õ‘•Ì ‰…•¹å}½Ý¹•Èˆ¤ì(€€€½¹ÍÐ…¹%¹Ù¥Ñ•5…¹…•È€€€€€ô…¹%¹Ù¥Ñ••¹å=Ý¹•Èñð¥¹Ù¥Ñ•ÉI½±•1¥ÍÐ¹¥¹±Õ‘•Ì ‰µ…¹…•Èˆ¤ì(€€€¥˜€¡‘…Ñ„¹¥¹Ù¥Ñ•‘}É½±”€ôôô€‰…•¹å}½Ý¹•Èˆ€˜˜€……¹%¹Ù¥Ñ••¹å=Ý¹•È¤ì(€€€€€Ñ¡É½Ü¹•ÜÉÉ½È ‰=¹±ä…•¹ä½Ý¹•ÉÌ…¹…‰½Ù”…¸¥¹Ù¥Ñ”…•¹ä½Ý¹•ÉÌ¸ˆ¤ì(€€€ô(€€€¥˜€¡‘…Ñ„¹¥¹Ù¥Ñ•‘}É½±”€ôôô€‰µ…¹…•Èˆ€˜˜€……¹%¹Ù¥Ñ•5…¹…•È¤ì(€€€€€Ñ¡É½Ü¹•ÜÉÉ½È ‰=¹±äµ…¹…•ÉÌ…¹…‰½Ù”…¸¥¹Ù¥Ñ”µ…¹…•ÉÌ¸ˆ¤ì(€€€ô((€€€€¼¼•Ñ ¥¹Ù¥Ñ•ÈÌ½É…¹¥é…Ñ¥½¸(€€€½¹ÍÐì‘…Ñ„è¥¹Ù¥Ñ•ÉAÉ½™¥±”ô€ô…Ý…¥Ð€¡ÍÕÁ…‰…Í”…Ì…¹ä¤(€€€€€€¹™É½´ ‰ÁÉ½™¥±•Ìˆ¤¹Í•±•Ð ‰½É…¹¥é…Ñ¥½¹}¥±…•¹å}±•Ù•±}¥ˆ¤¹•Ä ‰¥ˆ°ÕÍ•É%¤¹µ…å‰•M¥¹±” ¤ì((€€€ì(€€€€€½¹ÍÐì…ÍÍ•ÉÑ9½Ñ•µ¼ô€ô…Ý…¥Ð¥µÁ½ÉÐ ‰ ½±¥ˆ½‘•µ¼¹Í•ÉÙ•Èˆ¤ì(€€€€€…Ý…¥Ð…ÍÍ•ÉÑ9½Ñ•µ¼¡¥¹Ù¥Ñ•ÉAÉ½™¥±”ü¹½É…¹¥é…Ñ¥½¹}¥°€‰¥¹Ù¥Ñ”Í½µ•½¹”ˆ¤ì(€€€ô((€€€½¹ÍÐÑ½­•¸€ôÉåÁÑ¼¹É…¹‘½µUU% ¤ì((€€€±•Ð…ÍÍ¥¹µ•¹ÑÌ€ô‘…Ñ„¹…ÍÍ¥¹µ•¹ÑÌì(€€€¥˜€¡‘…Ñ„¹…•¹å}±•Ù•±}¥¤ì(€€€€€½¹ÍÐì‘…Ñ„è±•Ù•°ô€ô…Ý…¥Ð€¡ÍÕÁ…‰…Í”…Ì…¹ä¤¹™É½´ ‰…•¹å}±•Ù•±Ìˆ¤(€€€€€€€€¹Í•±•Ð ‰¥±¹…µ”±‰…Í•}ÁÐ±½É…¹¥é…Ñ¥½¹}¥±…•¹å}±•Ù•±}…ÉÉ¥•É}µ…ÁÁ¥¹Ì¡½É}…ÉÉ¥•É}¥±…ÉÉ¥•É}±•Ù•±}¹…µ”±…ÉÉ¥•É}ÁÐ¤ˆ¤(€€€€€€€€¹•Ä ‰¥ˆ°‘…Ñ„¹…•¹å}±•Ù•±}¥¤¹•Ä ‰½É…¹¥é…Ñ¥½¹}¥ˆ°¥¹Ù¥Ñ•ÉAÉ½™¥±”ü¹½É…¹¥é…Ñ¥½¹}¥¤¹µ…å‰•M¥¹±” ¤ì(€€€€€¥˜€ …±•Ù•°¤Ñ¡É½Ü¹•ÜÉÉ½È ‰Q¡…Ð…•¹ä±•Ù•°¥Ì¹½Ð…Ù…¥±…‰±”¸ˆ¤ì(€€€€€¥˜€ ……¹%¹Ù¥Ñ••¹å=Ý¹•È¤ì(€€€€€€€½¹ÍÐì‘…Ñ„è¥¹Ù¥Ñ•É1•Ù•°ô€ô¥¹Ù¥Ñ•ÉAÉ½™¥±”ü¹…•¹å}±•Ù•±}¥(€€€€€€€€€€ü…Ý…¥Ð€¡ÍÕÁ…‰…Í”…Ì…¹ä¤¹™É½´ ‰…•¹å}±•Ù•±Ìˆ¤¹Í•±•Ð ‰‰…Í•}ÁÐ±…¹}¥¹Ù¥Ñ”ˆ¤¹•Ä ‰¥ˆ°¥¹Ù¥Ñ•ÉAÉ½™¥±”¹…•¹å}±•Ù•±}¥¤¹µ…å‰•M¥¹±” ¤(€€€€€€€€€€èì‘…Ñ„è¹Õ±°ôì(€€€€€€€¥˜€ …¥¹Ù¥Ñ•É1•Ù•°ü¹…¹}¥¹Ù¥Ñ”¤Ñ¡É½Ü¹•ÜÉÉ½È ‰e½ÕÈ…•¹ä±•Ù•°…¹¹½ÐÉ•…Ñ”¥¹Ù¥Ñ”±¥¹­Ì¸ˆ¤ì(€€€€€€€¥˜€¡9Õµ‰•È¡±•Ù•°¹‰…Í•}ÁÐ¤€øô9Õµ‰•È¡¥¹Ù¥Ñ•É1•Ù•°¹‰…Í•}ÁÐ¤¤Ñ¡É½Ü¹•ÜÉÉ½È ‰e½Ô…¸½¹±ä¥¹Ù¥Ñ”Í½µ•½¹”…Ð„±•Ù•°‰•¹•…Ñ å½ÕÈ½Ý¸¸ˆ¤ì(€€€€€ô(€€€€€½¹ÍÐì‘…Ñ„è½É…ÉÉ¥•ÉÌô€ô…Ý…¥Ð€¡ÍÕÁ…‰…Í”…Ì…¹ä¤¹™É½´ ‰½É}…ÉÉ¥•ÉÌˆ¤(€€€€€€€€¹Í•±•Ð ‰¥±…ÉÉ¥•É}¥±…ÉÉ¥•ÉÌ¡¹…µ”¤ˆ¤¹•Ä ‰½É…¹¥é…Ñ¥½¹}¥ˆ°¥¹Ù¥Ñ•ÉAÉ½™¥±”ü¹½É…¹¥é…Ñ¥½¹}¥¤¹•Ä ‰ÍÑ…ÑÕÌˆ°€‰…Ñ¥Ù”ˆ¤ì(€€€€€½¹ÍÐ‰å…ÉÉ¥•È€ô¹•Ü5…À ¡±•Ù•°¹…•¹å}±•Ù•±}…ÉÉ¥•É}µ…ÁÁ¥¹Ì€üümt¤¹µ…À ¡´è…¹ä¤€ôøm´¹½É}…ÉÉ¥•É}¥°µt¤¤ì(€€€€€…ÍÍ¥¹µ•¹ÑÌ€ô€¡½É…ÉÉ¥•ÉÌ€üümt¤¹µ…À ¡Œè…¹ä¤€ôøì(€€€€€€€½¹ÍÐ´è…¹ä€ô‰å…ÉÉ¥•È¹•Ð¡Œ¹¥¤ì(€€€€€€€É•ÑÕÉ¸ì…ÉÉ¥•É}¥èŒ¹…ÉÉ¥•É}¥°…ÉÉ¥•É}¹…µ”èŒ¹…ÉÉ¥•ÉÌü¹¹…µ”€üü€‰…ÉÉ¥•Èˆ°±•Ù•±}¹…µ”è´ü¹…ÉÉ¥•É}±•Ù•±}¹…µ”€üü±•Ù•°¹¹…µ”°±•Ù•±}ÁÐè9Õµ‰•È¡´ü¹…ÉÉ¥•É}ÁÐ€üü±•Ù•°¹‰…Í•}ÁÐ¤°É•±•…Í•}¹••‘•è™…±Í”ôì(€€€€€ô¤ì(€€€ô((€€€½¹ÍÐì‘…Ñ„è¥¹Í•ÉÑ•°•ÉÉ½Èô€ô…Ý…¥Ð€¡ÍÕÁ…‰…Í”…Ì…¹ä¤¹™É½´ ‰¥¹Ù¥Ñ…Ñ¥½¹}±¥¹­Ìˆ¤¹¥¹Í•ÉÐ¡ì(€€€€€É•…Ñ•‘}‰äè€€€€€ÕÍ•É%°(€€€€€¹…µ”è€€€€€€€€€€€‘…Ñ„¹±¥¹­}¹…µ”°(€€€€€±¥¹­}¹…µ”è€€€€€€‘…Ñ„¹±¥¹­}¹…µ”°(€€€€€¥Í}É•ÕÍ…‰±”è€€€€ÑÉÕ”°(€€€€€¹•Ý}…•¹Ñ}•µ…¥°è¹Õ±°°(€€€€€Ñ½­•¸°(€€€€€…ÉÉ¥•É}…ÍÍ¥¹µ•¹ÑÌè…ÍÍ¥¹µ•¹ÑÌ°(€€€€€ÍÑ…ÑÕÌè€€€€€€€€€€‰Á•¹‘¥¹œˆ°(€€€€€½¹‰½…É‘¥¹}ÍÑ•Àè€À°(€€€€€¥¹Ù¥Ñ•‘}É½±”è€€€‘…Ñ„¹¥¹Ù¥Ñ•‘}É½±”°(€€€€€…•¹å}±•Ù•±}¥è‘…Ñ„¹…•¹å}±•Ù•±}¥€üü¹Õ±°°(€€€€€½É…¹¥é…Ñ¥½¹}¥è¥¹Ù¥Ñ•ÉAÉ½™¥±”ü¹½É…¹¥é…Ñ¥½¹}¥€üü¹Õ±°°(€€€ô¤¹Í•±•Ð ‰¥±Ñ½­•¸ˆ¤¹Í¥¹±” ¤ì((€€€¥˜€¡•ÉÉ½È¤Ñ¡É½Ü¹•ÜÉÉ½È¡•ÉÉ½È¹µ•ÍÍ…”¤ì((€€€É•ÑÕÉ¸ì½¬èÑÉÕ”°¥è¥¹Í•ÉÑ•¹¥°Ñ½­•¸è¥¹Í•ÉÑ•¹Ñ½­•¸ôì(€ô¤ì(