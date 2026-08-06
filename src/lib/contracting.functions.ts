import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scopeSchema } from "@/lib/scope";
import { resolveScopeAgentIds, resolveScopeAgentIdsOrNone } from "@/lib/scope.functions";
import { loadWritingNumbers, recordWritingNumber, writingNumberKey } from "@/lib/writing-numbers";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId } from "@/lib/org-guard";
import { assignInviteCarriers } from "@/lib/onboarding.functions";

// ---------- helpers ----------
type Ctx = { supabase: any; userId: string };

/** The org a write should be attributed to. Null for a personal account. */
async function getOrgId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
  return data?.organization_id ?? null;
}

async function getMyLevelPct(supabase: any, userId: string, carrierId: string): Promise<number | null> {
  const { data } = await supabase
    .from("agent_commission_levels")
    .select("assigned_pct")
    .eq("agent_id", userId)
    .eq("carrier_id", carrierId)
    .maybeSingle();
  if (!data) return null;
  let pct = Number(data.assigned_pct);
  if (pct > 1) pct = pct; // already percentage like 80
  return pct;
}

// ---------- carriers ----------
export const listCarriers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data, error } = await supabase
      .from("carriers")
      .select("id,name,phone,hours,website,contracting_speed_days,pay_frequency,advance_cap,advance_cap_amount,advance_cap_months,ideal_client,agent_portal_url,training_url,about_text,is_annuity_carrier,active")
      .eq("active", true)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: active } = await supabase
      .from("contract_requests")
      .select("carrier_id")
      .eq("agent_id", userId)
      .eq("status", "active");
    const activeSet = new Set((active ?? []).map((r: any) => r.carrier_id));

    return { carriers: (data ?? []).map((c: any) => ({ ...c, my_active: activeSet.has(c.id) })) };
  });

// ---------- add carrier (self-reported) ----------
export const addAgentCarrier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    carrier_id: z.string().uuid(),
    writing_number: z.string().max(64).optional(),
    loa: z.enum(["life","health_accident","annuity","life_health"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const orgId = await getOrgId(supabase, userId);

    // ── May this agent put themselves live? ────────────────────────────────
    //
    // This wrote `status: "active"` unconditionally, so an agent could type
    // any writing number against any carrier and be live, with no approval.
    // `source: "self_reported"` was already recorded — the flag existed, the
    // gate did not.
    //
    // Fails closed. If the column is missing because the migration has not
    // been applied, the select errors and the answer is `false`: the agent
    // raises a request for somebody to confirm rather than activating
    // themselves. Failing open on a permission check would be handing out the
    // thing the check exists to withhold, and `false` is the column's default
    // anyway, so applying the migration changes nothing.
    let maySelfActivate = false;
    if (orgId) {
      const { data: settings } = await supabase
        .from("org_contracting_settings")
        .select("agents_may_self_activate_carriers")
        .eq("organization_id", orgId)
        .maybeSingle();
      maySelfActivate = Boolean((settings as any)?.agents_may_self_activate_carriers);
    }

    if (!maySelfActivate) {
      // Not a rejection — a request, in the queue, with the number they gave
      // attached so whoever confirms it has something to check against.
      // `requested` is an existing status meaning "not live yet"; no new
      // status value, and therefore no CHECK constraint to migrate.
      const created = await assignInviteCarriers({
        client: supabaseAdmin,
        agentId: userId,
        organizationId: orgId,
        createdBy: userId,
        assignments: [{ carrier_id: data.carrier_id }],
        contractStatus: "requested",
        contractNote: data.writing_number
          ? `Agent reported writing number ${data.writing_number} — unverified`
          : "Agent reported an existing contract — unverified",
        requestNote: data.writing_number
          ? `Agent says they already hold this contract, writing number ${data.writing_number}. Confirm with the carrier before marking active.`
          : "Agent says they already hold this contract. Confirm with the carrier before marking active.",
        directUplineId: null,
      });
      if (!created.length) {
        throw new Error("Could not record that contract. Nothing was saved — please try again.");
      }
      return { ok: true, pendingVerification: true };
    }

    const { error } = await supabase.from("contract_requests").upsert({
      agent_id: userId,
      carrier_id: data.carrier_id,
      // Still written: see the note on the dual write in @/lib/writing-numbers.
      writing_number: data.writing_number ?? null,
      loa: data.loa,
      status: "active",
      source: "self_reported",
      activated_at: new Date().toISOString(),
    }, { onConflict: "agent_id,carrier_id" });
    if (error) throw new Error(error.message);

    if (data.writing_number) {
      await recordWritingNumber(supabase, {
        agentId: userId,
        orgId,
        carrierId: data.carrier_id,
        writingNumber: data.writing_number,
        source: "self_reported",
      });
    }
    return { ok: true, pendingVerification: false };
  });

// ---------- request commission level ----------
export const requestCommissionLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    carrier_id: z.string().uuid(),
    message: z.string().max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { error } = await supabase.from("commission_level_requests").insert({
      agent_id: userId,
      carrier_id: data.carrier_id,
      message: data.message ?? null,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- my contracts ----------
export const listMyContracts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ scope: scopeSchema.default("mine") }).parse(d ?? {}))
  .handler(async ({ data: input, context }) => {
    const { supabase, userId } = context as Ctx;
    const agentIds = input.scope === "mine"
      ? [userId]
      : await resolveScopeAgentIds(supabase, input.scope);
    const { data, error } = await supabase
      .from("contract_requests")
      .select("id,agent_id,carrier_id,status,writing_number,commission_level,effective_date,products,requested_at,submitted_at,activated_at,issue_description,notes,carriers(name,agent_portal_url,is_annuity_carrier)")
      .in("agent_id", agentIds)
      .order("requested_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Whose contract it is, but only where that could be somebody else.
    let names = new Map<string, string>();
    if (input.scope !== "mine") {
      const owners = Array.from(new Set((data ?? []).map((r: any) => r.agent_id).filter(Boolean)));
      if (owners.length) {
        const { data: people } = await supabase
          .from("profiles").select("id, first_name, last_name").in("id", owners);
        names = new Map((people ?? []).map((p: any) =>
          [p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()]));
      }
    }
    // The number comes from `writing_numbers` now, falling back to the column
    // on this row when there is no record yet — either because the backfill
    // has not run or because the pair could not be mapped to an org carrier.
    const numbers = await loadWritingNumbers(supabase, agentIds);

    return {
      rows: (data ?? []).map((r: any) => ({
        ...r,
        writing_number:
          numbers.get(writingNumberKey(r.agent_id, r.carrier_id)) ?? r.writing_number ?? null,
        agent_name: names.get(r.agent_id) ?? null,
      })),
    };
  });

export const createContractRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ carrier_id: z.string().uuid(), notes: z.string().max(1000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const { data: carrier, error: cErr } = await supabase
      .from("carriers").select("id,name,is_annuity_carrier").eq("id", data.carrier_id).single();
    if (cErr || !carrier) throw new Error("Carrier not found");

    if (carrier.is_annuity_carrier) {
      const { data: cert } = await supabase
        .from("producer_documents")
        .select("id,file_url")
        .eq("agent_id", userId)
        .eq("doc_type", "aml_certificate")
        .not("file_url", "is", null)
        .maybeSingle();
      if (!cert) throw new Error("Upload your Annuity Training Certificate first.");
    }

    const { data: existing } = await supabase
      .from("contract_requests")
      .select("id,status")
      .eq("agent_id", userId)
      .eq("carrier_id", data.carrier_id)
      .neq("status", "rejected")
      .maybeSingle();
    if (existing) throw new Error(`You already have a ${existing.status} contract request with ${carrier.name}.`);

    // ── Both records, or the request is invisible ──────────────────────────
    //
    // This used to insert a `contract_requests` row and stop. Contracting Ops
    // reads `contracting_requests`, a different table, so the agent saw their
    // own request and the people who work requests saw nothing: no queue item
    // on any filter, "REQUESTS IN PROGRESS: 0" on the ops home, and no
    // notification. The only place it surfaced was Contracts at Agency scope,
    // which is a list, not a work queue.
    //
    // `assignInviteCarriers` already creates both halves correctly — including
    // the `org_carriers` row the workflow half needs, and a `draft` status
    // whose REQUEST_STATUS_META entry is `open: true`, which is what
    // getStaffQueue filters on. Reusing it is the point: one way requests get
    // created, so the two cannot drift apart again.
    const orgId = await getMyPrimaryOrgId(userId);

    const created = await assignInviteCarriers({
      client: supabaseAdmin,
      agentId: userId,
      organizationId: orgId,
      createdBy: userId,
      assignments: [{ carrier_id: data.carrier_id }],
      contractStatus: "requested",
      contractNote: data.notes ?? "Requested by the agent",
      requestNote: data.notes
        ? `Requested by the agent: ${data.notes}`
        : "Requested by the agent",
      // The agent asked; nobody has picked it up. Leaving this null is what
      // puts it in the Unassigned tab rather than under whoever created it.
      directUplineId: null,
    });

    if (!created.length) {
      throw new Error("Could not raise that request. Nothing was saved — please try again.");
    }

    // ── Tell the people who have to work it ────────────────────────────────
    //
    // The audit asked for a `routed_to` column to be populated. There is no
    // such column on `contracting_requests`, so routing is expressed the way
    // the rest of this module already expresses it: the request sits
    // unassigned in the queue, and the people who own that queue are notified.
    if (orgId) {
      const [{ data: org }, { data: me }] = await Promise.all([
        supabaseAdmin.from("organizations").select("owner_id").eq("id", orgId).maybeSingle(),
        supabaseAdmin.from("profiles").select("upline_id, first_name, last_name").eq("id", userId).maybeSingle(),
      ]);

      const who = `${me?.first_name ?? ""} ${me?.last_name ?? ""}`.trim() || "An agent";
      const recipients = [...new Set([org?.owner_id, me?.upline_id].filter(Boolean))] as string[];

      if (recipients.length) {
        // Best effort. A notification that fails must not lose the request
        // that has already been written.
        const { error: notifyError } = await supabaseAdmin.from("notifications").insert(
          recipients.map((id) => ({
            user_id: id,
            title: "New carrier request",
            description: `${who} requested contracting with ${carrier.name}.`,
            type: "contracting",
          })),
        );
        if (notifyError) {
          console.error("[contracting] request saved but notification failed:", notifyError.message);
        }
      }
    }

    return { ok: true };
  });

const StatusEnum = z.enum(["requested","submitted","processing","issue","active","rejected"]);

export const updateContractStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    status: StatusEnum,
    writing_number: z.string().max(64).optional(),
    issue_description: z.string().max(1000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const update: any = { status: data.status };
    if (data.status === "submitted") update.submitted_at = new Date().toISOString();
    if (data.status === "active") update.activated_at = new Date().toISOString();
    // Moving off active clears the activation stamp, or the contract keeps
    // claiming a date it was never active from.
    if (data.status !== "active") update.activated_at = null;
    if (data.writing_number !== undefined) update.writing_number = data.writing_number;
    if (data.issue_description !== undefined) update.issue_description = data.issue_description;

    // .select() so a row row-level security hides reports as a refusal rather
    // than as success — an update that matches nothing is not an error in
    // Postgres, and this one used to return { ok: true } either way.
    const { data: touched, error } = await supabase
      .from("contract_requests").update(update).eq("id", data.id).select("id,agent_id,carrier_id");
    if (error) throw new Error(error.message);
    if (!touched?.length) throw new Error("You don't have permission to change that contract.");

    // Only after the update is known to have landed — recording a number
    // against a contract the caller could not change would be worse than not
    // recording it at all.
    if (data.writing_number) {
      const row = touched[0] as any;
      await recordWritingNumber(supabase, {
        agentId: row.agent_id,
        orgId: await getOrgId(supabase, row.agent_id),
        carrierId: row.carrier_id,
        writingNumber: data.writing_number,
        // Staff setting a number on somebody else's contract is a different
        // claim from an agent stating their own.
        source: row.agent_id === userId ? "self_reported" : "manual_entry",
      });
    }
    return { ok: true };
  });

// ---------- downline matrix ----------
export const listDownlineMatrix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;

    // Was .eq("upline_id", userId) — direct reports only. A manager two
    // levels above an agent saw nothing, which is not what "downline" means
    // anywhere else in the app.
    //
    // ...OrNone rather than the throwing variant: this view has no scope
    // label to be wrong about, so an empty matrix is a worse answer but not
    // an incorrect one, while a throw takes the tab out entirely.
    const teamIds = (await resolveScopeAgentIdsOrNone(supabase, "team")).filter((id) => id !== userId);
    const { data: agents, error: aErr } = await supabase
      .from("profiles")
      .select("id,first_name,last_name,email")
      .in("id", teamIds.length ? teamIds : ["00000000-0000-0000-0000-000000000000"])
      .order("first_name", { ascending: true });
    if (aErr) throw new Error(aErr.message);

    // The agency's carriers, not the platform's.
    //
    // This read the global `carriers` table, so every agency's matrix carried a
    // column for every carrier on the platform — seventeen of them — including
    // ones they had never contracted with and never would. A matrix is meant to
    // show gaps worth closing; a column per carrier in existence shows noise.
    //
    // `org_carriers` is the per-agency layer and has been since
    // `20260730160000_contracting-ops-carriers.sql`. Note the filter is
    // `status`, not `active` — org_carriers has no boolean, it has
    // ('active','paused','not_contracted','terminated'), and a paused carrier
    // should stop appearing as an assignment target.
    //
    // Depends on `20260802200000_backfill-org-carrier-links.sql`. Without it,
    // carriers in use but never linked simply vanish from the matrix.
    const { data: orgCarriers, error: cErr } = await supabase
      .from("org_carriers")
      .select("carrier_id, carriers(id,name,is_annuity_carrier)")
      .eq("status", "active");
    if (cErr) throw new Error(cErr.message);

    const carriers = (orgCarriers ?? [])
      .map((oc: any) => oc.carriers)
      .filter((c: any) => c && c.id)
      .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));

    const agentIds = (agents ?? []).map((a: any) => a.id);
    let requests: any[] = [];
    if (agentIds.length) {
      const { data: cr } = await supabase
        .from("contract_requests")
        .select("id,agent_id,carrier_id,status,writing_number,commission_level")
        .in("agent_id", agentIds);
      requests = cr ?? [];
    }

    // The levels the assign dialog actually writes.
    //
    // The matrix cell used to read `contract_requests.commission_level` — a
    // numeric column nothing in the app has ever written — while the dialog
    // wrote `agent_commission_levels`. So you assigned a level, the save
    // succeeded, and the cell still showed a dot. Two tables, one of them
    // never filled in, and the screen was reading the empty one.
    let levels: any[] = [];
    if (agentIds.length) {
      const { data: lv } = await supabase
        .from("agent_commission_levels")
        .select("agent_id,carrier_id,commission_level,assigned_pct")
        .in("agent_id", agentIds);
      levels = lv ?? [];
    }

    // Same substitution as My Contracts: the cell shows the authoritative
    // number, falling back to the legacy column on the request row.
    const numbers = await loadWritingNumbers(supabase, agentIds);
    requests = requests.map((r: any) => ({
      ...r,
      writing_number:
        numbers.get(writingNumberKey(r.agent_id, r.carrier_id)) ?? r.writing_number ?? null,
    }));

    return { agents: agents ?? [], carriers, requests, levels };
  });

export const assignDownlineContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    agent_id: z.string().uuid(),
    carrier_id: z.string().uuid(),
    level_pct: z.number().min(0).max(200),
    level_name: z.string().max(64).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const myPct = await getMyLevelPct(supabase, userId, data.carrier_id);
    if (myPct !== null && data.level_pct > myPct) {
      throw new Error(`You cannot assign a level above your own (${myPct}%).`);
    }

    const { error: lvlErr } = await supabase
      .from("agent_commission_levels")
      .upsert({
        agent_id: data.agent_id,
        carrier_id: data.carrier_id,
        assigned_pct: data.level_pct,
        commission_level: data.level_name ?? null,
        assigned_by: userId,
        assigned_at: new Date().toISOString(),
      }, { onConflict: "agent_id,carrier_id" });
    if (lvlErr) throw new Error(lvlErr.message);

    const { data: existing } = await supabase
      .from("contract_requests")
      .select("id")
      .eq("agent_id", data.agent_id)
      .eq("carrier_id", data.carrier_id)
      .neq("status", "rejected")
      .maybeSingle();
    if (!existing) {
      const { error } = await supabase.from("contract_requests").insert({
        agent_id: data.agent_id,
        carrier_id: data.carrier_id,
        status: "requested",
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------- work inbox ----------
export const listWorkInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;

    // Same one-level bug as the matrix above: work from an agent two levels
    // down never reached the person responsible for it. Same reasoning on
    // ...OrNone, too.
    const teamIds = (await resolveScopeAgentIdsOrNone(supabase, "team")).filter((id) => id !== userId);
    const { data: agents } = await supabase
      .from("profiles").select("id,first_name,last_name")
      .in("id", teamIds.length ? teamIds : ["00000000-0000-0000-0000-000000000000"]);
    const downlineIds = (agents ?? []).map((a: any) => a.id);
    const nameOf = (id: string) => {
      const a = (agents ?? []).find((x: any) => x.id === id);
      return a ? `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim() : "Agent";
    };

    const items: {
      id: string; agent: string; description: string;
      priority: "high" | "normal"; kind: string;
      agent_id?: string; carrier_id?: string;
      /** Workflow items only: how close the packet is to submittable. */
      readiness_pct?: number;
      /** Workflow items only: what is missing, as labels. */
      blockers?: string[];
      /** Workflow items only: how long it has sat at this status. */
      days_in_status?: number;
      status?: string;
    }[] = [];

    if (downlineIds.length) {
      const { data: pending } = await supabase
        .from("contract_requests")
        .select("id,agent_id,carriers(name)")
        .in("agent_id", downlineIds)
        .in("status", ["requested","issue"]);
      (pending ?? []).forEach((p: any) => items.push({
        id: p.id,
        agent: nameOf(p.agent_id),
        description: `Contract awaiting your review — ${p.carriers?.name ?? "carrier"}`,
        priority: "normal",
        kind: "contract",
      }));
    }

    const { data: transfers } = await supabase
      .from("transfer_requests")
      .select("id,agent_id,status,carriers(name)")
      .eq("to_upline_id", userId)
      .eq("status", "pending");
    (transfers ?? []).forEach((t: any) => items.push({
      id: t.id,
      agent: nameOf(t.agent_id),
      description: `Transfer request — ${t.carriers?.name ?? "carrier"}`,
      priority: "high",
      kind: "transfer",
    }));

    if (downlineIds.length) {
      const { data: commReqs } = await supabase
        .from("commission_level_requests")
        .select("id,agent_id,carrier_id,message,carriers(name)")
        .in("agent_id", downlineIds)
        .eq("status", "pending");
      (commReqs ?? []).forEach((r: any) => items.push({
        id: r.id,
        agent: nameOf(r.agent_id),
        // Carried so the inbox can send you somewhere useful. A row that only
        // knows how to describe itself can only ever be read.
        agent_id: r.agent_id,
        carrier_id: r.carrier_id,
        description: `Commission level request — ${r.carriers?.name ?? "carrier"}${r.message ? `: ${r.message}` : ""}`,
        priority: "normal",
        kind: "commission_request",
      }));
    }

    // The fourth source: the operational workflow.
    //
    // `contracting_requests` is the unit of work — 17 statuses, a readiness
    // score, an assignee, an audit trail — and nothing surfaced it as something
    // waiting on you. The suggestion was to repoint this whole function at it
    // instead, which would have silently dropped the transfers and
    // commission-level requests above; those have their own tabs but nothing
    // else tells you they are waiting.
    //
    // So it is added, not substituted. `readiness_pct` and the blocker labels
    // ride along, because "review this" without "it is 40% ready and missing
    // an E&O certificate" is the same dead end the Review button was.
    if (downlineIds.length) {
      const { data: workflow } = await supabase
        .from("contracting_requests")
        .select(`
          id, agent_id, status, readiness_pct, readiness_blockers, priority,
          updated_at, created_at,
          org_carriers ( carriers ( name ) )
        `)
        .in("agent_id", downlineIds)
        .not("status", "in", '("approved","writing_number_issued","declined","cancelled","closed")');

      const now = Date.now();
      (workflow ?? []).forEach((w: any) => {
        // `updated_at`, not a status-change stamp — `contracting_requests`
        // has no `status_changed_at`, and selecting one that does not exist
        // fails the whole query with 42703, which would have made this entire
        // source vanish from the inbox without a word. The exact per-status
        // dwell time lives in `contracting_status_history`; joining it per row
        // is not worth it for an age hint, and `updated_at` moves on every
        // status change anyway.
        const since = w.updated_at ?? w.created_at;
        const days = since
          ? Math.floor((now - new Date(since).getTime()) / 86_400_000)
          : undefined;
        // Stored as jsonb; readers elsewhere accept either shape, so normalise
        // to labels here rather than making the UI guess.
        const raw = Array.isArray(w.readiness_blockers) ? w.readiness_blockers : [];
        const blockers = raw
          .map((b: any) => (typeof b === "string" ? b : b?.label ?? b?.key))
          .filter(Boolean) as string[];

        items.push({
          id: w.id,
          agent: nameOf(w.agent_id),
          agent_id: w.agent_id,
          description: `Contracting — ${w.org_carriers?.carriers?.name ?? "carrier"}`,
          // A request that has sat two weeks is not "normal" any more,
          // whatever it was filed as.
          priority: w.priority === "urgent" || w.priority === "high" || (days ?? 0) >= 14
            ? "high" : "normal",
          kind: "contracting_request",
          status: w.status,
          readiness_pct: typeof w.readiness_pct === "number" ? w.readiness_pct : undefined,
          blockers,
          days_in_status: days,
        });
      });
    }

    return { items };
  });

/**
 * Answer a commission level request.
 *
 * There was no way to. The table shipped with two policies — the agent's own
 * row, and a read for their direct upline — so a request could be raised and
 * seen and never resolved by anybody except the agent who raised it, which is
 * not a decision they should be making about their own commission. Every
 * request ever made was still sitting in somebody's Work Inbox.
 *
 * Approving does not set the level. Setting a level is the matrix's job and it
 * needs a carrier, a percentage and a name that matches a comp grid exactly —
 * far more than this request carries. This closes the question; the assign
 * dialog answers it.
 */
export const resolveCommissionLevelRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      decision: z.enum(["approved", "declined"]),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const { data: updated, error } = await supabase
      .from("commission_level_requests")
      .update({
        status: data.decision,
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
      })
      .eq("id", data.id)
      .eq("status", "pending")
      .select("id");

    // `resolved_at`/`resolved_by` arrive with 20260802201000. Before it lands,
    // write the status alone rather than failing the whole action.
    if (error?.code === "42703") {
      const { data: retry, error: retryErr } = await supabase
        .from("commission_level_requests")
        .update({ status: data.decision })
        .eq("id", data.id).eq("status", "pending").select("id");
      if (retryErr) throw new Error(retryErr.message);
      if (!retry?.length) throw new Error("That request has already been answered.");
      return { ok: true };
    }
    if (error) throw new Error(error.message);

    // Nothing updated means either somebody answered it first, or RLS refused —
    // the update policy arrives with the same migration.
    if (!updated?.length) {
      throw new Error(
        "That request couldn't be answered — it may already have been resolved, or your account may not have permission.",
      );
    }
    return { ok: true };
  });

// ---------- transfers ----------
export const listTransferRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data, error } = await supabase
      .from("transfer_requests")
      .select("id,status,created_at,carriers(name),from:from_upline_id(first_name,last_name),to:to_upline_id(first_name,last_name)")
      .or(`agent_id.eq.${userId},to_upline_id.eq.${userId},from_upline_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const respondTransferRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), decision: z.enum(["accepted","declined"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { error } = await supabase.from("transfer_requests").update({ status: data.decision }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- invitations ----------
export const listInvitationLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data, error } = await supabase
      .from("invitation_links")
      .select("id,name,token,carrier_assignments,created_at")
      .eq("created_by", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

const AssignmentSchema = z.object({
  carrier_id: z.string().uuid(),
  carrier_name: z.string(),
  level_name: z.string().optional().nullable(),
  level_pct: z.number().min(0).max(200),
});

export const createInvitationLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    name: z.string().trim().min(1).max(120),
    assignments: z.array(AssignmentSchema).min(1).max(50),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    // verify each level is at or below user's own
    for (const a of data.assignments) {
      const myPct = await getMyLevelPct(supabase, userId, a.carrier_id);
      if (myPct !== null && a.level_pct > myPct) {
        throw new Error(`Level for ${a.carrier_name} (${a.level_pct}%) exceeds your assigned level (${myPct}%).`);
      }
    }

    const token = crypto.randomUUID();
    const { error } = await supabase.from("invitation_links").insert({
      created_by: userId,
      name: data.name,
      token,
      carrier_assignments: data.assignments,
    });
    if (error) throw new Error(error.message);
    return { ok: true, token };
  });

export const deleteInvitationLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    // Scoped to the creator, so a link somebody else made matches nothing —
    // and a delete that matches nothing is not an error. Without the count,
    // this reported success and the link stayed live, which for an invitation
    // link is the difference between revoked and not.
    const { data: removed, error } = await supabase
      .from("invitation_links").delete().eq("id", data.id).eq("created_by", userId).select("id");
    if (error) throw new Error(error.message);
    if (!removed?.length) {
      throw new Error("That invite link couldn't be revoked — it was created by someone else.");
    }
    return { ok: true };
  });

// ---------- commission grids ----------
export const listMyCarrierLevels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data, error } = await supabase
      .from("agent_commission_levels")
      .select("carrier_id,assigned_pct,commission_level,carriers(name,is_annuity_carrier,active)")
      .eq("agent_id", userId);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const getCommissionGrid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    carrier_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    // Agent's assigned level for this carrier
    const { data: levelRow } = await supabase
      .from("agent_commission_levels")
      .select("assigned_pct, commission_level")
      .eq("agent_id", userId)
      .eq("carrier_id", data.carrier_id)
      .maybeSingle();

    const myPct       = levelRow ? Number(levelRow.assigned_pct) : null;
    const myLevelName = levelRow?.commission_level ?? null;

    // Super admins see ALL levels
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    const isSuperAdmin = !!roleRow;

    if (!isSuperAdmin && myPct === null) {
      return { myLevelName: null, myPct: null, rows: [], noLevelAssigned: true, isSuperAdmin: false };
    }

    let query = supabase
      .from("commission_grids")
      .select("id,product_name,age_group_min,age_group_max,level_name,year_1_pct,years_2_5_pct,years_6_plus_pct")
      .eq("carrier_id", data.carrier_id)
      .order("year_1_pct", { ascending: false })
      .order("age_group_min", { ascending: true, nullsFirst: true })
      .order("product_name", { ascending: true });

    // Non-super-admins only see their level and below
    if (!isSuperAdmin && myPct !== null) {
      query = query.lte("year_1_pct", myPct);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    return {
      myLevelName,
      myPct,
      rows: rows ?? [],
      noLevelAssigned: false,
      isSuperAdmin,
    };
  });

// ---------- annuity training ----------
export const getMyAnnuityCert = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data } = await supabase
      .from("producer_documents")
      .select("id,file_url,file_name,created_at")
      .eq("agent_id", userId)
      .eq("doc_type", "aml_certificate")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { cert: data ?? null };
  });

export const recordAnnuityCert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    storage_path: z.string().min(1).max(500),
    file_name: z.string().min(1).max(255),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    // ensure path under user's prefix
    if (!data.storage_path.startsWith(`${userId}/`)) throw new Error("Invalid path");
    // remove old rows
    await supabase.from("producer_documents").delete().eq("agent_id", userId).eq("doc_type", "aml_certificate");

    // Same reason as the producer-profile upload: an unstamped document never
    // reaches the staff queue that is supposed to review it.
    const { data: prof } = await supabase
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();

    const { error } = await supabase.from("producer_documents").insert({
      agent_id: userId,
      organization_id: (prof as any)?.organization_id ?? null,
      doc_type: "aml_certificate",
      file_url: data.storage_path,
      file_name: data.file_name,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const activateContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    contract_id: z.string().uuid(),
    writing_number: z.string().min(1).max(100),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: contract } = await supabase
      .from("contract_requests")
      .select("id, status, carrier_id")
      .eq("id", data.contract_id)
      .eq("agent_id", userId)
      .single();
    if (!contract) throw new Error("Contract not found");
    if (contract.status !== "assigned") throw new Error("Only assigned contracts can be activated this way");
    const { error } = await supabase
      .from("contract_requests")
      // Still written: see the note on the dual write in @/lib/writing-numbers.
      .update({ writing_number: data.writing_number, status: "active", activated_at: new Date().toISOString() })
      .eq("id", data.contract_id);
    if (error) throw new Error(error.message);

    await recordWritingNumber(supabase, {
      agentId: userId,
      orgId: await getOrgId(supabase, userId),
      carrierId: contract.carrier_id,
      writingNumber: data.writing_number,
      source: "self_reported",
    });
    return { ok: true };
  });

export const deleteContractRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: row } = await supabase.from("contract_requests")
      .select("agent_id, status").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("That contract request no longer exists.");
    if (row.agent_id !== userId) {
      // An upline or admin removing somebody else's request is legitimate; only
      // an unrelated agent is not.
      // `agency_owner` belongs here alongside `admin`. RLS lets the owner of
      // the organization remove the row — `is_org_owner(organization_id)` — so
      // leaving them out of this check refuses a delete the database would
      // have allowed, which reads as a bug to the one person who most expects
      // it to work.
      const [{ data: isDownline }, { data: isAdmin }, { data: isOwner }] = await Promise.all([
        (supabase as any).rpc("is_in_downline", { _upline: userId, _target: row.agent_id }),
        (supabase as any).rpc("has_role", { _user_id: userId, _role: "admin" }),
        (supabase as any).rpc("has_role", { _user_id: userId, _role: "agency_owner" }),
      ]);
      if (!isDownline && !isAdmin && !isOwner) {
        throw new Error("This contract request isn't yours to remove.");
      }
    }

    // "Contact your admin" was the old advice, which is no help to the person
    // who *is* the admin — and there was no admin path to this either. Say
    // what actually works instead.
    if (row.status === "active") {
      throw new Error(
        "This contract is marked active. Change its status first, then remove it — " +
        "so an appointment that is real cannot be deleted by one misclick.",
      );
    }
    // `.select()` so we can tell a delete apart from a delete that did nothing.
    //
    // The checks above run in TypeScript; the row is removed under RLS. When a
    // policy disagrees with them the delete matches zero rows and returns no
    // error at all — so this would report "Contract request removed", the list
    // would refetch unchanged, and the contract would still be there. An
    // upline or admin removing somebody else's request is exactly the case
    // where those two can disagree.
    const { data: removed, error } = await supabase
      .from("contract_requests").delete().eq("id", data.id).select("id");
    if (error) throw new Error(error.message);
    if (!removed?.length) {
      throw new Error(
        "That contract couldn't be removed — your account doesn't have permission to delete this one.",
      );
    }
    return { ok: true };
  });

// ---------- transfer workflow ----------

export const getTransferWorkflowStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("needs_transfer_request, transfer_workflow_carriers")
      .eq("id", userId)
      .maybeSingle();

    const { data: existing } = await supabase
      .from("transfer_requests")
      .select("id, status")
      .eq("agent_id", userId)
      .in("status", ["pending", "accepted", "complete"] as any)
      .limit(1);

    return {
      needs_transfer_request: (profile as any)?.needs_transfer_request ?? false,
      workflow_carriers:      (profile as any)?.transfer_workflow_carriers ?? [],
      transfer_complete:      ((existing ?? []) as any[]).length > 0,
    };
  });

export const submitTransferSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    rows: z.array(z.object({
      carrier_id:           z.string().optional(),
      carrier_name:         z.string().min(1),
      writing_number:       z.string().optional(),
      current_upline_name:  z.string().min(1),
      current_upline_email: z.string().email().optional().or(z.literal("")),
    })).min(1),
    reason: z.string().optional(),
    notes:  z.string().max(1000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    const { data: profile } = await supabase
      .from("profiles")
      .select("upline_id, first_name, last_name")
      .eq("id", userId)
      .maybeSingle();

    for (const row of data.rows) {
      let carrierId = row.carrier_id;
      if (!carrierId && row.carrier_name) {
        const { data: carrier } = await supabase
          .from("carriers")
          .select("id")
          .ilike("name", `%${row.carrier_name.split(" ")[0]}%`)
          .maybeSingle();
        carrierId = carrier?.id;
      }

      await (supabase as any).from("transfer_requests").insert({
        agent_id:             userId,
        carrier_id:           carrierId ?? null,
        to_upline_id:         profile?.upline_id ?? null,
        writing_number:       row.writing_number || null,
        current_upline_name:  row.current_upline_name,
        current_upline_email: row.current_upline_email || null,
        reason:               data.reason ?? null,
        notes:                data.notes ?? null,
        status:               "pending",
        requested_at:         new Date().toISOString(),
      });
    }

    if (profile?.upline_id) {
      // Falls back to "An agent" rather than rendering "Transfer Request
      // from " with nothing after it, which is what a blank profile produced.
      const agentName =
        `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "An agent";
      // `description`, not `body`/`link` — neither column exists on
      // `notifications`, so PostgREST rejected the row with PGRST204 and the
      // discarded result meant nothing surfaced. The upline was never told a
      // release request was waiting.
      await supabase.from("notifications").insert({
        user_id: profile.upline_id,
        title:   `Transfer Request from ${agentName}`,
        description: `${agentName} has submitted a carrier release request for ${data.rows.length} carrier${data.rows.length !== 1 ? "s" : ""}. Review in Transfer Requests.`,
        type:    "contracting",
        read:    false,
      }).catch(() => {});
    }

    return { ok: true, submitted: data.rows.length };
  });

// ── Add Carrier (agency owners/admins) — Carriers reference directory ────────
export const addCarrier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    name: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(40).optional(),
    hours: z.string().trim().max(120).optional(),
    pay_frequency: z.enum(["weekly", "monthly"]).optional(),
    advance_cap: z.string().trim().max(80).optional(),
    ideal_client: z.string().trim().max(200).optional(),
    website: z.string().trim().url().max(300).optional().or(z.literal("")),
    agent_portal_url: z.string().trim().url().max(300).optional().or(z.literal("")),
    training_url: z.string().trim().url().max(300).optional().or(z.literal("")),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", userId)
      .in("role", ["super_admin", "agency_owner", "admin"]).limit(1);
    if (!roleRow?.length) throw new Error("Only agency owners and admins can add carriers");

    const { data: profile } = await supabase
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    if (!profile?.organization_id) throw new Error("You are not in an agency.");

    const orgId = profile.organization_id;

    // Reuse the catalogue entry when there is one.
    //
    // "Add a carrier" from an agency's point of view means "put this carrier on
    // my list", not "invent a carrier nobody has heard of". Creating a second
    // private Transamerica beside the catalogue's would give this agency its own
    // carrier id — and every grid, contract and commission keyed to the wrong
    // one, invisibly, forever.
    const { data: existing } = await (supabase as any)
      .from("carriers").select("id").ilike("name", data.name).limit(2);

    let carrierId: string | undefined = (existing ?? []).length === 1 ? existing[0].id : undefined;

    if (!carrierId) {
      // Private to this agency, not added to the shared catalogue.
      //
      // This used to insert a plain `carriers` row with no `is_private` and no
      // owner — a carrier one agency invented appearing in the directory of
      // every other agency on the platform. RLS `carriers_private_write`
      // requires is_private, so depending on which legacy policy is still live
      // it either failed for the owner or leaked. Both answers were wrong.
      const { data: made, error } = await (supabase as any).from("carriers").insert({
        name: data.name,
        phone: data.phone || null,
        hours: data.hours || null,
        pay_frequency: data.pay_frequency ?? null,
        advance_cap: data.advance_cap || null,
        ideal_client: data.ideal_client || null,
        website: data.website || null,
        agent_portal_url: data.agent_portal_url || null,
        training_url: data.training_url || null,
        active: true,
        is_private: true,
        owner_organization_id: orgId,
        created_by: userId,
      }).select("id").maybeSingle();
      if (error) throw new Error(error.message);
      carrierId = made?.id as string | undefined;
    }

    if (!carrierId) throw new Error("Couldn't add that carrier.");

    // The link row, which this function never wrote.
    //
    // `org_carriers` is what says a carrier belongs to this agency — comp
    // levels, requirements and contracting method all hang off it, and the
    // team matrix filters on it. Without this row the carrier existed but
    // belonged to nobody: absent from Carriers & Comp, unable to hold a comp
    // level, and offered right back to you under "carriers you could add".
    const { error: linkErr } = await (supabase as any).from("org_carriers").insert({
      organization_id: orgId,
      carrier_id: carrierId,
      status: "active",
      created_by: userId,
      updated_by: userId,
    });
    // Already on the agency's list is the outcome we wanted, reached by
    // somebody else first.
    //
    // Anything else is worth a sentence rather than a Postgres string. The
    // role check above admits the same set as `is_org_admin`, which is what the
    // `org_carriers` write policy uses, so a refusal here means the account's
    // profile is not on the organization it thinks it is.
    if (linkErr && linkErr.code !== "23505") {
      throw new Error(
        `Added ${data.name}, but couldn't put it on your agency's list: ${linkErr.message}`,
      );
    }

    // Returns the id so a caller can select what it just created rather than
    // making somebody find the name they only just typed.
    return { ok: true, id: carrierId };
  });

/**
 * Clear the commission levels assigned to *you*.
 *
 * There has never been a way to remove one. `adminAssignAgentLevel` upserts,
 * `bulkUpsertLicenses` upserts, the book import upserts — so a level set
 * once, or imported wrongly, stayed set forever and the only recourse was to
 * overwrite it with something else equally wrong.
 *
 * Deliberately self-only: `agent_id` is taken from the session and never from
 * the caller, so this cannot touch another agent's pay grade no matter who
 * runs it. Clearing somebody else's is an admin action and belongs with the
 * rest of them, not on a page an agent reads.
 *
 * `carrier_id` omitted clears every carrier — the "start again" case.
 */
export const clearMyCommissionLevels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ carrier_id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;

    let q = (supabase as any)
      .from("agent_commission_levels")
      .delete()
      .eq("agent_id", userId);
    if (data.carrier_id) q = q.eq("carrier_id", data.carrier_id);

    const { data: gone, error } = await q.select("id");
    if (error) throw new Error(error.message);
    return { cleared: (gone ?? []).length };
  });
