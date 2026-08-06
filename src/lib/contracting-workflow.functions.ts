import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId, assertSameOrg, OrgAccessError } from "@/lib/org-guard";
import { recordAudit } from "@/lib/contracting-ops/audit";
import {
  HIERARCHY_CHANGE_LABELS,
  REQUEST_STATUS_META,
  type HierarchyChangeType,
  type RequestStatus,
  type ReadyToSellStatus,
} from "@/lib/contracting-ops/types";

const supabaseAdmin = _admin as any;
type Ctx = { supabase: any; userId: string };

/**
 * Workflow: hierarchy changes, Ready to Sell, and the staff queue.
 */

async function resolveAccess(userId: string) {
  const orgId = await getMyPrimaryOrgId(userId);
  if (!orgId) return { orgId: null as string | null, isOrgAdmin: false, perms: {} as any };
  const [{ data: org }, { data: roleRows }, { data: perms }] = await Promise.all([
    supabaseAdmin.from("organizations").select("owner_id").eq("id", orgId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin.from("role_permissions").select("*")
      .eq("profile_id", userId).eq("organization_id", orgId).maybeSingle(),
  ]);
  const roles: string[] = (roleRows ?? []).map((r: any) => String(r.role));
  const isOrgAdmin =
    org?.owner_id === userId ||
    roles.some((r) => ["agency_owner", "admin", "super_admin"].includes(r)) ||
    Boolean(perms?.staff_is_admin && perms?.admin_manage_staff_configs);
  return { orgId, isOrgAdmin, perms: perms ?? {} };
}

async function requireCapability(userId: string, flags: string[], message: string) {
  const a = await resolveAccess(userId);
  if (!a.orgId) throw new OrgAccessError("No organization on your account");
  if (a.isOrgAdmin) return a.orgId;
  if (flags.some((f) => Boolean((a.perms as any)[f]))) return a.orgId;
  throw new Error(message);
}

// ── Hierarchy changes ───────────────────────────────────────────────────────

export const listHierarchyChanges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const a = await resolveAccess(userId);
    if (!a.orgId) return { rows: [], canApprove: false, canManage: false };

    const { data, error } = await supabase
      .from("hierarchy_change_requests")
      .select(`
        *,
        profiles:agent_id ( id, first_name, last_name, npn_number ),
        current_upline:current_upline_id ( first_name, last_name ),
        requested_upline:requested_upline_id ( first_name, last_name ),
        org_carriers ( id, carriers ( name ) ),
        hierarchy_change_approvals ( id, step, step_order, decision, decided_at, approver_id, comment )
      `)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const name = (p: any) => p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : null;

    return {
      canApprove: a.isOrgAdmin || Boolean((a.perms as any).contracting_approve),
      canManage: a.isOrgAdmin || Boolean((a.perms as any).contracting_manage_hierarchy),
      rows: (data ?? []).map((r: any) => ({
        ...r,
        agent_name: name(r.profiles) || "Unnamed agent",
        agent_npn: r.profiles?.npn_number ?? null,
        carrier_name: r.org_carriers?.carriers?.name ?? "All carriers",
        current_upline_name: name(r.current_upline),
        requested_upline_name: name(r.requested_upline),
        approvals: (r.hierarchy_change_approvals ?? []).sort((x: any, y: any) => x.step_order - y.step_order),
        // The step actually holding the request up, which is the only one
        // anybody needs to see on a list row.
        blocking_step: (r.hierarchy_change_approvals ?? [])
          .filter((ap: any) => ap.decision === "pending")
          .sort((x: any, y: any) => x.step_order - y.step_order)[0]?.step ?? null,
      })),
    };
  });

const HierarchyChangeSchema = z.object({
  agent_id: z.string().uuid(),
  org_carrier_id: z.string().uuid().nullable().optional(),
  change_type: z.enum([
    "promotion", "demotion", "manager_reassignment", "upline_change", "carrier_hierarchy_change",
    "comp_change", "release", "transfer", "agency_transfer", "writing_number_correction", "role_change",
  ]),
  requested_upline_id: z.string().uuid().nullable().optional(),
  requested_comp_level_id: z.string().uuid().nullable().optional(),
  requested_role: z.string().max(60).nullable().optional(),
  requested_effective_date: z.string().max(10).nullable().optional(),
  reason: z.string().max(2000).nullable().optional(),
});

/**
 * Raises a hierarchy change and builds its approval chain.
 *
 * The approval rows are created up front, pending, so the UI can show who is
 * holding a request up before anybody has acted. Steps the agency has switched
 * off are recorded as `skipped` rather than omitted — an audit that shows a
 * step was deliberately not required beats one where it silently never existed.
 */
/**
 * What is true about this agent right now, so the form can show it.
 *
 * Raising a compensation change meant typing into a form that never said what
 * the agent is on today — and the dialog had no way to send a new level at
 * all, so `requested_comp_level_id` was in the schema, read by the approver
 * and written by nobody. Same for a promotion: no current position, no list of
 * the positions this agency's comp grid actually recognises.
 *
 * Everything here is read, never written. It exists so the person raising the
 * request is choosing between real values instead of recalling them.
 */
export const getAgentHierarchyContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ agent_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new OrgAccessError("No organization on your account");
    await assertSameOrg(userId, data.agent_id);

    const [{ data: profile }, { data: records }, { data: levels }] = await Promise.all([
      supabaseAdmin.from("profiles").select("upline_id").eq("id", data.agent_id).maybeSingle(),
      supabaseAdmin
        .from("carrier_hierarchy_records")
        .select('org_carrier_id, "current_role", current_comp_level_id, org_carriers ( carriers ( name ) )')
        .eq("organization_id", orgId)
        .eq("agent_id", data.agent_id),
      supabaseAdmin
        .from("carrier_comp_levels")
        .select("id, org_carrier_id, level_name, commission_pct, role_eligibility")
        .eq("organization_id", orgId)
        .eq("status", "active"),
    ]);

    let currentUpline: { id: string; name: string } | null = null;
    if (profile?.upline_id) {
      const { data: u } = await supabaseAdmin
        .from("profiles").select("id, first_name, last_name").eq("id", profile.upline_id).maybeSingle();
      if (u) {
        currentUpline = {
          id: u.id as string,
          name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "Unnamed",
        };
      }
    }

    const allLevels = levels ?? [];
    const levelById = new Map<string, any>(allLevels.map((l: any) => [l.id as string, l]));

    const carriers = (records ?? []).map((r: any) => {
      const held = r.current_comp_level_id ? levelById.get(r.current_comp_level_id) : null;
      return {
        org_carrier_id: r.org_carrier_id as string,
        carrier_name: r.org_carriers?.carriers?.name ?? "Unnamed carrier",
        current_role: (r["current_role"] as string | null) ?? null,
        current_level_id: (r.current_comp_level_id as string | null) ?? null,
        current_level_name: held?.level_name ?? null,
        current_level_pct: held?.commission_pct ?? null,
        // Only this carrier's levels: a level belongs to one carrier, and
        // offering another carrier's grid would be offering a level the agent
        // cannot be placed on.
        levels: allLevels
          .filter((l: any) => l.org_carrier_id === r.org_carrier_id)
          .map((l: any) => ({ id: l.id, name: l.level_name, pct: l.commission_pct }))
          .sort((a: any, b: any) => Number(b.pct ?? 0) - Number(a.pct ?? 0)),
      };
    });

    // The positions this agency's own comp grid recognises, deduped across
    // carriers. `role_eligibility` is the column that says which internal roles
    // may hold a level, so it is the only place the product knows what a
    // promotion could promote somebody *to*.
    const positions: string[] = [
      ...new Set(allLevels.flatMap((l: any) => ((l.role_eligibility ?? []) as string[]))),
    ].filter((r): r is string => Boolean(r)).sort();

    // What they are today, as far as the carrier records agree.
    const heldRoles: string[] = [
      ...new Set(carriers.map((c: any) => c.current_role as string | null)),
    ].filter((r): r is string => Boolean(r));

    return {
      currentUpline,
      currentRole: heldRoles.length === 1 ? heldRoles[0] : null,
      /** More than one carrier disagrees about their title — worth showing. */
      mixedRoles: heldRoles.length > 1 ? heldRoles : null,
      carriers,
      positions,
    };
  });

export const createHierarchyChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => HierarchyChangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) throw new OrgAccessError("No organization on your account");
    await assertSameOrg(userId, data.agent_id);
    if (data.requested_upline_id) {
      await assertSameOrg(userId, data.requested_upline_id);
      if (data.requested_upline_id === data.agent_id) {
        throw new Error("An agent cannot be their own upline.");
      }
    }

    const [{ data: settings }, { data: profile }, { data: org }] = await Promise.all([
      supabaseAdmin.from("org_contracting_settings").select("*").eq("organization_id", orgId).maybeSingle(),
      supabaseAdmin.from("profiles").select("upline_id").eq("id", data.agent_id).maybeSingle(),
      supabaseAdmin.from("organizations").select("owner_id").eq("id", orgId).maybeSingle(),
    ]);

    const requireManager = settings?.require_manager_review ?? false;
    const requireOwner = settings?.require_owner_approval_for_hierarchy ?? true;

    // Which carriers this change touches, so the approver sees the blast radius.
    const { data: affected } = await supabaseAdmin
      .from("carrier_hierarchy_records")
      .select("org_carrier_id, org_carriers ( carriers ( name ) )")
      .eq("agent_id", data.agent_id)
      .eq("organization_id", orgId);

    const carrierImpact = data.org_carrier_id
      ? (affected ?? []).filter((c: any) => c.org_carrier_id === data.org_carrier_id)
      : (affected ?? []);

    const { data: created, error } = await supabaseAdmin
      .from("hierarchy_change_requests")
      .insert({
        organization_id: orgId,
        agent_id: data.agent_id,
        org_carrier_id: data.org_carrier_id ?? null,
        change_type: data.change_type,
        current_upline_id: profile?.upline_id ?? null,
        requested_upline_id: data.requested_upline_id ?? null,
        requested_comp_level_id: data.requested_comp_level_id ?? null,
        requested_role: data.requested_role ?? null,
        requested_effective_date: data.requested_effective_date ?? null,
        reason: data.reason ?? null,
        carrier_impact: carrierImpact.map((c: any) => ({
          org_carrier_id: c.org_carrier_id,
          carrier_name: c.org_carriers?.carriers?.name ?? null,
        })),
        submitted_by: userId,
        status: requireManager ? "awaiting_manager" : requireOwner ? "awaiting_owner" : "approved",
      })
      .select("id, reference").single();
    if (error) throw new Error(error.message);

    const steps = [
      { step: "manager", step_order: 1, required: requireManager, approver: profile?.upline_id ?? null },
      { step: "owner", step_order: 2, required: requireOwner, approver: org?.owner_id ?? null },
      { step: "contracting_staff", step_order: 3, required: true, approver: null },
      { step: "carrier", step_order: 4, required: true, approver: null },
    ];

    await supabaseAdmin.from("hierarchy_change_approvals").insert(
      steps.map((s) => ({
        organization_id: orgId,
        change_request_id: created.id,
        step: s.step,
        step_order: s.step_order,
        approver_id: s.approver,
        decision: s.required ? "pending" : "skipped",
      })),
    );

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "hierarchy_change.requested",
      recordType: "hierarchy_change_requests", recordId: created.id,
      subjectAgentId: data.agent_id, next: data,
    });

    // Tell whoever the request is now sitting with.
    const notify = requireManager ? profile?.upline_id : requireOwner ? org?.owner_id : null;
    if (notify && notify !== userId) {
      await supabaseAdmin.from("notifications").insert({
        user_id: notify,
        title: "Hierarchy change needs your review",
        description: `${HIERARCHY_CHANGE_LABELS[data.change_type as HierarchyChangeType] ?? data.change_type} — ${created.reference}`,
        type: "contracting",
      });
    }

    return { ok: true, id: created.id as string, reference: created.reference as string };
  });

export const decideHierarchyChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    step: z.enum(["manager", "owner", "contracting_staff", "carrier"]),
    decision: z.enum(["approved", "declined"]),
    comment: z.string().max(1000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const a = await resolveAccess(userId);
    if (!a.orgId) throw new OrgAccessError("No organization on your account");
    const orgId = a.orgId;

    const { data: request } = await supabaseAdmin
      .from("hierarchy_change_requests").select("*").eq("id", data.id).eq("organization_id", orgId).maybeSingle();
    if (!request) throw new OrgAccessError("That request is not available to you");

    const { data: approval } = await supabaseAdmin
      .from("hierarchy_change_approvals").select("*")
      .eq("change_request_id", data.id).eq("step", data.step).maybeSingle();
    if (!approval) throw new Error("That approval step does not exist on this request.");
    if (approval.decision !== "pending") throw new Error("That step has already been decided.");

    // Either the named approver, or somebody who can approve for the agency.
    const canDecide =
      approval.approver_id === userId ||
      a.isOrgAdmin ||
      Boolean((a.perms as any).contracting_approve) ||
      (data.step === "contracting_staff" && Boolean((a.perms as any).contracting_manage_hierarchy));
    if (!canDecide) throw new Error("You are not the approver for this step.");

    await supabaseAdmin.from("hierarchy_change_approvals").update({
      decision: data.decision,
      decided_at: new Date().toISOString(),
      approver_id: approval.approver_id ?? userId,
      comment: data.comment ?? null,
    }).eq("id", approval.id);

    // Where the request goes next.
    let nextStatus = request.status;
    if (data.decision === "declined") {
      nextStatus = "declined";
    } else {
      const { data: remaining } = await supabaseAdmin
        .from("hierarchy_change_approvals").select("step, step_order, decision")
        .eq("change_request_id", data.id).eq("decision", "pending").order("step_order");
      const next = (remaining ?? [])[0];
      nextStatus = !next ? "applied"
        : next.step === "manager" ? "awaiting_manager"
        : next.step === "owner" ? "awaiting_owner"
        : next.step === "contracting_staff" ? "processing"
        : "submitted_to_carrier";
    }

    await supabaseAdmin.from("hierarchy_change_requests").update({
      status: nextStatus,
      ...(nextStatus === "declined"
        ? { declined_at: new Date().toISOString(), decline_reason: data.comment ?? null }
        : {}),
      ...(nextStatus === "applied" ? { applied_at: new Date().toISOString() } : {}),
    }).eq("id", data.id).eq("organization_id", orgId);

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "hierarchy_change.decided",
      recordType: "hierarchy_change_requests", recordId: data.id, subjectAgentId: request.agent_id,
      previous: { status: request.status }, next: { status: nextStatus, step: data.step, decision: data.decision },
    });

    // The internal record is only touched once every step has cleared. Nothing
    // external is applied automatically — the carrier confirmation step is a
    // human recording what the carrier actually did.
    //
    // ── What this used to miss ─────────────────────────────────────────────
    //
    // The guard was `requested_upline_id && org_carrier_id`, which meant an
    // approved change applied to nothing in two ordinary cases:
    //
    //   - "Every carrier this agent holds" sends org_carrier_id as null, which
    //     is the whole point of that option — and it was the one value that
    //     made the update not run. The request reached "applied", the audit
    //     log recorded it, the agent was notified, and no record moved.
    //   - A compensation change with no upline move has no requested_upline_id,
    //     so it fell out of the guard too.
    //
    // Applying is now driven by what the request actually asks for.
    if (nextStatus === "applied") {
      const patch: Record<string, unknown> = {};
      if (request.requested_upline_id) patch.direct_upline_id = request.requested_upline_id;
      if (request.requested_comp_level_id) patch.current_comp_level_id = request.requested_comp_level_id;
      if (request.requested_role) patch["current_role"] = request.requested_role;

      if (Object.keys(patch).length) {
        let q = supabaseAdmin.from("carrier_hierarchy_records")
          .update({ ...patch, updated_by: userId })
          .eq("organization_id", orgId)
          .eq("agent_id", request.agent_id);
        // No carrier on the request means every carrier this agent holds, so
        // the filter is simply left off rather than matched against null.
        if (request.org_carrier_id) q = q.eq("org_carrier_id", request.org_carrier_id);
        await q;
      }

      // ── The internal org chart ──────────────────────────────────────────
      //
      // profiles.upline_id was never written by this flow, so approving a
      // reassignment moved the carrier records and left the agency's own chart
      // untouched — and upline_id is what downline scope, the team matrix and
      // every "who reports to whom" query in the product read. The change was
      // recorded and, as far as the rest of Agent Cloud was concerned, had not
      // happened.
      //
      // Only for a change that means the agent genuinely reports somewhere
      // else, and only when no single carrier was named.
      // `carrier_hierarchy_change` is deliberately excluded: the empty state on
      // that page says a carrier hierarchy "is how one carrier sees your
      // structure, which is not always your internal org chart", and that
      // distinction is the reason the table exists.
      const MOVES_THE_CHART = new Set([
        "upline_change", "manager_reassignment", "promotion", "demotion", "role_change",
      ]);
      if (
        request.requested_upline_id &&
        !request.org_carrier_id &&
        MOVES_THE_CHART.has(request.change_type)
      ) {
        await supabaseAdmin.from("profiles")
          .update({ upline_id: request.requested_upline_id })
          .eq("id", request.agent_id)
          .eq("organization_id", orgId);
      }
    }

    await supabaseAdmin.from("notifications").insert({
      user_id: request.agent_id,
      title: data.decision === "declined" ? "Your hierarchy change was declined" : "Your hierarchy change moved forward",
      description: data.comment ?? `${request.reference}`,
      type: "contracting",
    });

    return { ok: true, status: nextStatus };
  });

// ── Ready to Sell ───────────────────────────────────────────────────────────

/**
 * Recomputes the agent x carrier grid for the organization.
 *
 * Written as a recompute rather than a view: a roster of 200 agents across 15
 * carriers is 3,000 evaluations, and re-deriving licences, appointments,
 * documents and writing numbers per row on every page load is not something a
 * dashboard survives.
 */
export const recomputeReadyToSell = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as Ctx;
    const orgId = await requireCapability(
      userId,
      ["contracting_manage_carriers", "contracting_submit", "staff_view_contracts", "contracting_manage_licenses"],
      "You don't have permission to refresh Ready to Sell.",
    );

    const today = new Date().toISOString().slice(0, 10);

    const [{ data: members }, { data: carriers }] = await Promise.all([
      supabaseAdmin.from("organization_memberships").select("profile_id")
        .eq("organization_id", orgId).eq("status", "active"),
      supabaseAdmin.from("org_carriers").select("id, carrier_id").eq("organization_id", orgId).eq("status", "active"),
    ]);

    const agentIds = (members ?? []).map((m: any) => m.profile_id);
    if (!agentIds.length || !(carriers ?? []).length) return { ok: true, computed: 0 };

    const [{ data: licenses }, { data: appointments }, { data: writingNumbers }, { data: docs }, { data: requests }, { data: reviews }, { data: hierarchies }] =
      await Promise.all([
        supabaseAdmin.from("state_licenses").select("agent_id, state_code, status, expires_date").in("agent_id", agentIds),
        supabaseAdmin.from("producer_appointments").select("agent_id, carrier_id, state_code, status")
          .eq("organization_id", orgId),
        supabaseAdmin.from("writing_numbers").select("agent_id, org_carrier_id, status, state_code")
          .eq("organization_id", orgId),
        supabaseAdmin.from("producer_documents").select("agent_id, doc_type, review_status, expiration_date")
          .in("agent_id", agentIds),
        supabaseAdmin.from("contracting_requests").select("id, agent_id, org_carrier_id, status")
          .eq("organization_id", orgId),
        supabaseAdmin.from("pdb_reviews").select("agent_id, status, next_review_date").eq("organization_id", orgId),
        supabaseAdmin.from("hierarchy_change_requests").select("agent_id, org_carrier_id, status")
          .eq("organization_id", orgId),
      ]);

    const licensedStates = new Map<string, string[]>();
    for (const l of licenses ?? []) {
      if (!["active", "pending"].includes(l.status)) continue;
      if (l.expires_date && l.expires_date < today) continue;
      if (!licensedStates.has(l.agent_id)) licensedStates.set(l.agent_id, []);
      licensedStates.get(l.agent_id)!.push(l.state_code);
    }

    const apptKey = (a: string, c: string) => `${a}:${c}`;
    const appointedStates = new Map<string, string[]>();
    for (const ap of appointments ?? []) {
      if (ap.status !== "active" || !ap.carrier_id) continue;
      const k = apptKey(ap.agent_id, ap.carrier_id);
      if (!appointedStates.has(k)) appointedStates.set(k, []);
      appointedStates.get(k)!.push(ap.state_code);
    }

    const wnKey = (a: string, c: string) => `${a}:${c}`;
    const hasWritingNumber = new Set<string>();
    for (const w of writingNumbers ?? []) {
      if (w.status === "active") hasWritingNumber.add(wnKey(w.agent_id, w.org_carrier_id));
    }

    const docOk = (agentId: string, type: string) => {
      const d = (docs ?? []).filter((x: any) => x.agent_id === agentId && x.doc_type === type);
      return d.some((x: any) =>
        x.review_status === "approved" && (!x.expiration_date || x.expiration_date >= today));
    };

    const pdbOk = new Set(
      (reviews ?? [])
        .filter((r: any) => r.status === "verified" && (!r.next_review_date || r.next_review_date >= today))
        .map((r: any) => r.agent_id),
    );

    const openRequest = new Map<string, any>();
    for (const r of requests ?? []) {
      if (!REQUEST_STATUS_META[r.status as RequestStatus]?.open) continue;
      openRequest.set(`${r.agent_id}:${r.org_carrier_id}`, r);
    }

    const pendingHierarchy = new Set(
      (hierarchies ?? [])
        .filter((h: any) => !["applied", "declined", "cancelled"].includes(h.status))
        .map((h: any) => `${h.agent_id}:${h.org_carrier_id ?? "*"}`),
    );

    const rows: any[] = [];
    for (const agentId of agentIds) {
      const licensed = licensedStates.get(agentId) ?? [];
      for (const c of carriers ?? []) {
        const appointed = appointedStates.get(apptKey(agentId, c.carrier_id)) ?? [];
        const wn = hasWritingNumber.has(wnKey(agentId, c.id));
        const req = openRequest.get(`${agentId}:${c.id}`);
        const sellable = licensed.filter((s) => appointed.includes(s));

        const blockers: { key: string; label: string }[] = [];
        let status: ReadyToSellStatus;

        // Ordered by what actually stops a sale first.
        if (!pdbOk.has(agentId)) {
          status = "missing_pdb";
          blockers.push({ key: "pdb", label: "No verified PDB report on file" });
        } else if (licensed.length === 0) {
          status = "missing_license";
          blockers.push({ key: "license", label: "No active license on file" });
        } else if (!docOk(agentId, "eo_certificate")) {
          status = "missing_eo";
          blockers.push({ key: "eo", label: "No current E&O certificate" });
        } else if (!docOk(agentId, "aml_certificate")) {
          status = "missing_aml";
          blockers.push({ key: "aml", label: "No current AML certificate" });
        } else if (pendingHierarchy.has(`${agentId}:${c.id}`) || pendingHierarchy.has(`${agentId}:*`)) {
          status = "hierarchy_change_pending";
          blockers.push({ key: "hierarchy", label: "A hierarchy change is in progress" });
        } else if (appointed.length === 0) {
          if (req) {
            status = ["submitted", "carrier_reviewing"].includes(req.status) ? "contract_submitted" : "contract_pending";
          } else {
            status = "missing_appointment";
            blockers.push({ key: "appointment", label: "Not appointed with this carrier" });
          }
        } else if (!wn) {
          status = "missing_writing_number";
          blockers.push({ key: "writing_number", label: "No active writing number recorded" });
        } else if (sellable.length === 0) {
          status = "missing_appointment";
          blockers.push({ key: "overlap", label: "Licensed and appointed states do not overlap" });
        } else {
          status = "ready";
        }

        rows.push({
          organization_id: orgId,
          agent_id: agentId,
          org_carrier_id: c.id,
          status,
          sellable_states: sellable,
          licensed_states: licensed,
          appointed_states: appointed,
          blockers,
          request_id: req?.id ?? null,
          computed_at: new Date().toISOString(),
        });
      }
    }

    // Chunked: a 200x15 agency is 3,000 rows and one statement that size is a
    // timeout waiting to happen.
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabaseAdmin
        .from("ready_to_sell_records")
        .upsert(rows.slice(i, i + 500), { onConflict: "agent_id,org_carrier_id" });
      if (error) throw new Error(error.message);
    }

    return { ok: true, computed: rows.length };
  });

export const listReadyToSell = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return { rows: [], computed_at: null };

    const { data, error } = await supabase
      .from("ready_to_sell_records")
      .select(`
        *,
        profiles:agent_id ( id, first_name, last_name, npn_number ),
        org_carriers ( id, carriers ( name ) )
      `)
      .limit(5000);
    if (error) throw new Error(error.message);

    const rows = (data ?? []).map((r: any) => ({
      ...r,
      agent_name: `${r.profiles?.first_name ?? ""} ${r.profiles?.last_name ?? ""}`.trim() || "Unnamed agent",
      agent_npn: r.profiles?.npn_number ?? null,
      carrier_name: r.org_carriers?.carriers?.name ?? "Carrier",
    }));

    const computedAt = rows.length
      ? rows.map((r: any) => r.computed_at).sort().slice(-1)[0]
      : null;

    return { rows, computed_at: computedAt };
  });

// ── Staff queue ─────────────────────────────────────────────────────────────

export const getStaffQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const a = await resolveAccess(userId);
    if (!a.orgId) return { rows: [], staff: [], canAssign: false, me: userId };

    const { data, error } = await supabase
      .from("contracting_requests")
      .select(`
        id, reference, status, contract_type, priority, readiness_state, readiness_pct,
        assigned_to, due_date, created_at, updated_at, agent_id, internal_notes,
        profiles:agent_id ( first_name, last_name ),
        assignee:assigned_to ( id, first_name, last_name ),
        org_carriers ( carriers ( name ) )
      `)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const today = new Date().toISOString().slice(0, 10);
    const rows = (data ?? [])
      .filter((r: any) => REQUEST_STATUS_META[r.status as RequestStatus]?.open)
      .map((r: any) => ({
        id: r.id,
        reference: r.reference,
        status: r.status,
        contract_type: r.contract_type,
        priority: r.priority,
        readiness_state: r.readiness_state,
        readiness_pct: r.readiness_pct,
        assigned_to: r.assigned_to,
        assignee_name: r.assignee
          ? `${r.assignee.first_name ?? ""} ${r.assignee.last_name ?? ""}`.trim() : null,
        agent_name: `${r.profiles?.first_name ?? ""} ${r.profiles?.last_name ?? ""}`.trim() || "Unnamed agent",
        carrier_name: r.org_carriers?.carriers?.name ?? "Carrier",
        due_date: r.due_date,
        days_open: Math.max(0, Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86_400_000)),
        is_overdue: Boolean(r.due_date && r.due_date < today),
        // Escalation is derived, not stored: a stored flag goes stale the
        // moment somebody works the request.
        escalated: Boolean(r.due_date && r.due_date < today) ||
          Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86_400_000) > 21,
      }));

    // Workload by staff member, including the unassigned pile.
    const workload = new Map<string, { id: string | null; name: string; count: number; overdue: number }>();
    workload.set("unassigned", { id: null, name: "Unassigned", count: 0, overdue: 0 });
    for (const r of rows) {
      const key = r.assigned_to ?? "unassigned";
      if (!workload.has(key)) {
        workload.set(key, { id: r.assigned_to, name: r.assignee_name ?? "Unnamed", count: 0, overdue: 0 });
      }
      const w = workload.get(key)!;
      w.count += 1;
      if (r.is_overdue) w.overdue += 1;
    }

    return {
      rows,
      staff: [...workload.values()].sort((x, y) => y.count - x.count),
      canAssign: a.isOrgAdmin || Boolean((a.perms as any).contracting_assign_staff),
      me: userId,
    };
  });

/** Bulk assignment for the queue. */
export const bulkAssignRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    ids: z.array(z.string().uuid()).min(1).max(200),
    assigned_to: z.string().uuid().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await requireCapability(userId, ["contracting_assign_staff"],
      "You don't have permission to assign contracting work.");
    if (data.assigned_to) await assertSameOrg(userId, data.assigned_to);

    const { error } = await supabaseAdmin.from("contracting_requests").update({
      assigned_to: data.assigned_to,
      assigned_at: data.assigned_to ? new Date().toISOString() : null,
      assigned_by: data.assigned_to ? userId : null,
    }).in("id", data.ids).eq("organization_id", orgId);
    if (error) throw new Error(error.message);

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "request.assigned",
      recordType: "contracting_requests",
      next: { ids: data.ids, assigned_to: data.assigned_to },
      metadata: { count: data.ids.length, bulk: true },
    });

    if (data.assigned_to && data.assigned_to !== userId) {
      await supabaseAdmin.from("notifications").insert({
        user_id: data.assigned_to,
        title: `${data.ids.length} contracting request${data.ids.length === 1 ? "" : "s"} assigned to you`,
        description: "They are waiting in your contracting queue.",
        type: "contracting",
      });
    }
    return { ok: true, count: data.ids.length };
  });

// ── Audit log ───────────────────────────────────────────────────────────────

export const listContractingAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await getMyPrimaryOrgId(userId);
    if (!orgId) return { rows: [] };

    // The policy already restricts this to holders of the audit permission —
    // an empty list here is the permission answering, not a failure.
    const { data, error } = await supabase
      .from("contracting_audit_log")
      .select("*, actor:actor_id ( first_name, last_name ), subject:subject_agent_id ( first_name, last_name )")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    const name = (p: any) => p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : null;
    return {
      rows: (data ?? []).map((r: any) => ({
        ...r,
        actor_name: name(r.actor) ?? "System",
        subject_name: name(r.subject),
      })),
    };
  });
