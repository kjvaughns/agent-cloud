import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";

// Generated DB types predate the transfer_requests migration; cast until regenerated.
const supabaseAdmin = _admin as any;

type Ctx = { supabase: any; userId: string };

export const TRANSFER_TYPES = ["hierarchy_transfer", "full_release", "add_state", "writing_number_transfer"] as const;
export const TRANSFER_STATUSES = [
  "draft", "submitted", "pending_agent", "pending_carrier",
  "pending_receiving_agency", "completed", "rejected", "cancelled",
] as const;

export type TransferRequest = {
  id: string;
  agent_id: string;
  carrier_id: string | null;
  transfer_type: (typeof TRANSFER_TYPES)[number];
  from_agency_id: string | null;
  to_agency_id: string | null;
  to_agency_name: string | null;
  current_level: string | null;
  reason: string;
  status: (typeof TRANSFER_STATUSES)[number];
  notes: string | null;
  created_at: string;
  agent?: { first_name: string | null; last_name: string | null } | null;
  carrier?: { name: string } | null;
  from_agency?: { name: string } | null;
  to_agency?: { name: string } | null;
  direction?: "incoming" | "outgoing" | "own";
};

async function myOrgIds(userId: string): Promise<{ memberOf: string | null; owns: string[] }> {
  const [{ data: profile }, { data: owned }] = await Promise.all([
    supabaseAdmin.from("profiles").select("organization_id").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("organizations").select("id").eq("owner_id", userId),
  ]);
  return { memberOf: profile?.organization_id ?? null, owns: (owned ?? []).map((o: any) => o.id) };
}

// ── List (RLS does the scoping; we add direction labels) ─────────────────────

export const listTransferRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const { data, error } = await supabase
      .from("transfer_requests")
      .select("*, agent:profiles!transfer_requests_agent_id_fkey(first_name,last_name), carrier:carriers(name), from_agency:organizations!transfer_requests_from_agency_id_fkey(name), to_agency:organizations!transfer_requests_to_agency_id_fkey(name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { owns } = await myOrgIds(userId);
    const rows = (data ?? []).map((r: any) => ({
      ...r,
      direction:
        r.agent_id === userId ? "own"
        : r.to_agency_id && owns.includes(r.to_agency_id) ? "incoming"
        : "outgoing",
    }));
    return { rows: rows as TransferRequest[] };
  });

// ── Create ───────────────────────────────────────────────────────────────────

const CreateSchema = z.object({
  agent_id: z.string().uuid().optional(),        // defaults to caller
  carrier_id: z.string().uuid(),
  transfer_type: z.enum(TRANSFER_TYPES),
  to_agency_id: z.string().uuid().nullable().optional(),
  to_agency_name: z.string().trim().max(120).nullable().optional(),
  current_level: z.string().trim().max(60).nullable().optional(),
  reason: z.string().trim().min(1).max(2000),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const createTransferRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const agentId = data.agent_id ?? userId;
    const { memberOf, owns } = await myOrgIds(userId);

    // Submitting for someone else requires owning the org they belong to.
    if (agentId !== userId) {
      const { data: agent } = await supabaseAdmin.from("profiles").select("organization_id").eq("id", agentId).maybeSingle();
      if (!agent?.organization_id || !owns.includes(agent.organization_id)) {
        throw new Error("You can only submit transfer requests for agents in your agency");
      }
    }
    const { data: agentProfile } = await supabaseAdmin.from("profiles").select("organization_id").eq("id", agentId).maybeSingle();
    const orgId = agentProfile?.organization_id ?? memberOf;

    // Auto-fill current level from the contract record when present.
    let currentLevel = data.current_level ?? null;
    if (!currentLevel) {
      const { data: contract } = await supabaseAdmin
        .from("contract_requests")
        .select("commission_level")
        .eq("agent_id", agentId)
        .eq("carrier_id", data.carrier_id)
        .maybeSingle();
      if (contract?.commission_level != null) currentLevel = `${Number(contract.commission_level)}%`;
    }

    const { data: created, error } = await supabaseAdmin
      .from("transfer_requests")
      .insert({
        organization_id: orgId,
        agent_id: agentId,
        carrier_id: data.carrier_id,
        transfer_type: data.transfer_type,
        from_agency_id: orgId,
        to_agency_id: data.to_agency_id ?? null,
        to_agency_name: data.to_agency_name ?? null,
        current_level: currentLevel,
        reason: data.reason,
        notes: data.notes ?? null,
        status: "submitted",
        submitted_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("transfer_request_activity").insert({
      transfer_request_id: created.id,
      performed_by: userId,
      action: "created",
      new_status: "submitted",
      note: data.reason,
    });

    // Notify the agency owner when an agent submits their own request.
    if (orgId) {
      const { data: org } = await supabaseAdmin.from("organizations").select("owner_id, name").eq("id", orgId).maybeSingle();
      if (org?.owner_id && org.owner_id !== userId) {
        await supabaseAdmin.from("notifications").insert({
          user_id: org.owner_id,
          title: "New transfer request",
          description: "An agent submitted a carrier transfer request. Review it in Contracts → Transfer Requests.",
          type: "contracting",
        });
      }
    }
    return { ok: true, id: created.id };
  });

// ── Update status + notes (timeline logged) ──────────────────────────────────

export const updateTransferStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(TRANSFER_STATUSES),
      note: z.string().trim().max(2000).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    // Read via the caller's client so RLS enforces visibility, then update.
    const { data: existing, error: readErr } = await supabase
      .from("transfer_requests")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr || !existing) throw new Error("Transfer request not found");

    const { error } = await supabase
      .from("transfer_requests")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("transfer_request_activity").insert({
      transfer_request_id: data.id,
      performed_by: userId,
      action: "status_changed",
      previous_status: existing.status,
      new_status: data.status,
      note: data.note ?? null,
    });
    return { ok: true };
  });

export const addTransferNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), note: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { data: existing } = await supabase
      .from("transfer_requests").select("id").eq("id", data.id).maybeSingle();
    if (!existing) throw new Error("Transfer request not found");
    await supabaseAdmin.from("transfer_request_activity").insert({
      transfer_request_id: data.id,
      performed_by: userId,
      action: "note_added",
      note: data.note,
    });
    return { ok: true };
  });

export const getTransferTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    // Visibility gate via parent row.
    const { data: parent } = await supabase.from("transfer_requests").select("id").eq("id", data.id).maybeSingle();
    if (!parent) throw new Error("Transfer request not found");
    const { data: events } = await supabaseAdmin
      .from("transfer_request_activity")
      .select("*, performer:profiles!transfer_request_activity_performed_by_fkey(first_name,last_name)")
      .eq("transfer_request_id", data.id)
      .order("created_at", { ascending: false });
    return { events: events ?? [] };
  });

// ── Agency search (for the receiving-agency picker) ──────────────────────────

export const searchAgencies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(2).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { data: orgs } = await supabaseAdmin
      .from("organizations")
      .select("id, name")
      .ilike("name", `%${data.q}%`)
      .eq("active", true)
      .limit(8);
    return { orgs: orgs ?? [] };
  });
