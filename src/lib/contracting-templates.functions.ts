import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId, OrgAccessError } from "@/lib/org-guard";
import { recordAudit } from "@/lib/contracting-ops/audit";
import {
  buildSpreadsheetRow, renderTemplate, unresolvedVariables, toCsv,
  type FieldMapping, type Packet,
} from "@/lib/contracting-ops/packet";

const supabaseAdmin = _admin as any;
type Ctx = { supabase: any; userId: string };

/**
 * Submission templates and generation.
 *
 * The builders themselves are pure functions in contracting-ops/packet.ts.
 * This file is the I/O around them: reading the agency's templates, resolving
 * the packet for a request, and recording what was generated.
 *
 * Every generated artefact is written to contracting_submissions with a
 * snapshot of the values used. A profile edited next week must not rewrite what
 * was actually sent to a carrier last week.
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

// ── Reading templates ───────────────────────────────────────────────────────

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as Ctx;
    const a = await resolveAccess(userId);
    if (!a.orgId) return { spreadsheets: [], emails: [], canManage: false };

    const [{ data: sheets }, { data: mappings }, { data: emails }] = await Promise.all([
      supabase.from("contracting_spreadsheet_templates")
        .select("*, org_carriers ( id, carriers ( name ) )").order("created_at"),
      supabase.from("contracting_field_mappings").select("*").order("sort_order"),
      supabase.from("contracting_email_templates")
        .select("*, org_carriers ( id, carriers ( name ) )").order("created_at"),
    ]);

    const byTemplate = new Map<string, any[]>();
    for (const m of mappings ?? []) {
      if (!byTemplate.has(m.template_id)) byTemplate.set(m.template_id, []);
      byTemplate.get(m.template_id)!.push(m);
    }

    return {
      canManage: a.isOrgAdmin || Boolean((a.perms as any).contracting_manage_carriers),
      spreadsheets: (sheets ?? []).map((s: any) => ({
        ...s,
        carrier_name: s.org_carriers?.carriers?.name ?? "Any carrier",
        mappings: byTemplate.get(s.id) ?? [],
      })),
      emails: (emails ?? []).map((e: any) => ({
        ...e, carrier_name: e.org_carriers?.carriers?.name ?? "Any carrier",
      })),
    };
  });

// ── Saving templates ────────────────────────────────────────────────────────

const SpreadsheetSchema = z.object({
  id: z.string().uuid().optional(),
  org_carrier_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).nullable().optional(),
  sheet_name: z.string().max(80).nullable().optional(),
  header_row: z.number().int().min(1).max(50).default(1),
  active: z.boolean().default(true),
  mappings: z.array(z.object({
    column_header: z.string().trim().min(1).max(120),
    column_index: z.number().int().min(0).max(500).nullable().optional(),
    source_key: z.string().trim().min(1).max(60),
    static_value: z.string().max(300).nullable().optional(),
    transform: z.enum(["upper", "lower", "title", "date_mdy", "date_iso", "digits_only"]).nullable().optional(),
    required: z.boolean().default(false),
  })).max(200).default([]),
});

export const saveSpreadsheetTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SpreadsheetSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await requireCapability(userId, ["contracting_manage_carriers"],
      "You don't have permission to manage submission templates.");

    if (data.org_carrier_id) {
      const { data: c } = await supabaseAdmin.from("org_carriers")
        .select("id").eq("id", data.org_carrier_id).eq("organization_id", orgId).maybeSingle();
      if (!c) throw new OrgAccessError("That carrier is not in your directory");
    }

    const { id, mappings, ...fields } = data;
    const { data: saved, error } = id
      ? await supabaseAdmin.from("contracting_spreadsheet_templates")
          .update(fields).eq("id", id).eq("organization_id", orgId).select("id").single()
      : await supabaseAdmin.from("contracting_spreadsheet_templates")
          .insert({ ...fields, organization_id: orgId, created_by: userId }).select("id").single();
    if (error) throw new Error(error.message);

    // Mappings are replaced wholesale: a column removed from the carrier's
    // sheet must disappear, and diffing them individually buys nothing.
    await supabaseAdmin.from("contracting_field_mappings").delete().eq("template_id", saved.id);
    if (mappings.length) {
      const { error: mErr } = await supabaseAdmin.from("contracting_field_mappings").insert(
        mappings.map((m, i) => ({
          ...m, organization_id: orgId, template_id: saved.id, sort_order: i,
        })),
      );
      if (mErr) throw new Error(mErr.message);
    }

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "carrier.updated",
      recordType: "contracting_spreadsheet_templates", recordId: saved.id,
      next: { ...fields, mapping_count: mappings.length },
    });
    return { ok: true, id: saved.id as string };
  });

const EmailSchema = z.object({
  id: z.string().uuid().optional(),
  org_carrier_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  applies_to: z.array(z.string().max(50)).max(20).default([]),
  to_email: z.string().email().max(200).nullable().optional(),
  cc_email: z.string().max(400).nullable().optional(),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20000),
  suggested_attachments: z.array(z.string().max(60)).max(20).default([]),
  active: z.boolean().default(true),
  is_default: z.boolean().default(false),
});

export const saveEmailTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EmailSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await requireCapability(userId, ["contracting_manage_carriers"],
      "You don't have permission to manage submission templates.");

    const { id, ...fields } = data;
    const { data: saved, error } = id
      ? await supabaseAdmin.from("contracting_email_templates")
          .update(fields).eq("id", id).eq("organization_id", orgId).select("id").single()
      : await supabaseAdmin.from("contracting_email_templates")
          .insert({ ...fields, organization_id: orgId, created_by: userId }).select("id").single();
    if (error) throw new Error(error.message);

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "carrier.updated",
      recordType: "contracting_email_templates", recordId: saved.id, next: fields,
    });
    return { ok: true, id: saved.id as string };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    kind: z.enum(["spreadsheet", "email"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await requireCapability(userId, ["contracting_manage_carriers"],
      "You don't have permission to manage submission templates.");

    const table = data.kind === "spreadsheet"
      ? "contracting_spreadsheet_templates" : "contracting_email_templates";
    // .select("id") for the same reason as everywhere else, but this one had a
    // second consequence: the audit write below recorded `{ deleted: true }`
    // whether or not a row was removed. A template belonging to another agency,
    // or an id that no longer exists, produced a clean success *and* an audit
    // entry attesting to a deletion that never happened.
    const { data: gone, error } = await supabaseAdmin.from(table)
      .delete().eq("id", data.id).eq("organization_id", orgId).select("id");
    if (error) throw new Error(error.message);
    if (!gone?.length) {
      throw new OrgAccessError("That template is not in your agency's directory.");
    }

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "carrier.updated",
      recordType: table, recordId: data.id, previous: { deleted: true },
    });
    return { ok: true };
  });

// ── Generation ──────────────────────────────────────────────────────────────

/**
 * Rebuilds the packet for a request.
 *
 * Deliberately calls the same server function the packet page uses rather than
 * duplicating the fact-gathering. Generation and display therefore cannot
 * disagree about an agent's NPN, which is the whole reason this module exists.
 */
async function packetFor(requestId: string, orgId: string, userId: string): Promise<Packet> {
  const { getContractingRequest } = await import("@/lib/contracting-ops.functions");
  const result = await (getContractingRequest as any)({ data: { id: requestId } });
  if (!result?.packet) throw new Error("Could not build the packet for that request");
  void orgId; void userId;
  return result.packet as Packet;
}

export const generateSpreadsheetRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    request_ids: z.array(z.string().uuid()).min(1).max(200),
    template_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await requireCapability(
      userId, ["contracting_submit", "contracting_export", "staff_submit_carrier_requests"],
      "You don't have permission to export contracting data.",
    );

    const [{ data: template }, { data: mappings }] = await Promise.all([
      supabaseAdmin.from("contracting_spreadsheet_templates")
        .select("*").eq("id", data.template_id).eq("organization_id", orgId).maybeSingle(),
      supabaseAdmin.from("contracting_field_mappings")
        .select("*").eq("template_id", data.template_id).order("sort_order"),
    ]);
    if (!template) throw new OrgAccessError("That template is not available to you");
    if (!(mappings ?? []).length) throw new Error("That template has no column mapping yet.");

    const headers: string[] = [];
    const rows: string[][] = [];
    const problems: { request_id: string; missing: string[] }[] = [];

    for (const requestId of data.request_ids) {
      const packet = await packetFor(requestId, orgId, userId);
      const row = buildSpreadsheetRow(mappings as FieldMapping[], packet);
      if (!headers.length) headers.push(...row.headers);
      rows.push(row.values);
      if (row.missing.length) problems.push({ request_id: requestId, missing: row.missing });
    }

    const csv = toCsv(headers, rows);

    await supabaseAdmin.from("contracting_submissions").insert({
      organization_id: orgId,
      request_id: data.request_ids.length === 1 ? data.request_ids[0] : null,
      artifact_type: data.request_ids.length === 1 ? "spreadsheet_row" : "spreadsheet_batch",
      method: "spreadsheet",
      template_id: data.template_id,
      payload_snapshot: { headers, rows },
      row_count: rows.length,
      generated_by: userId,
    });

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "spreadsheet.exported",
      recordType: "contracting_spreadsheet_templates", recordId: data.template_id,
      metadata: { rows: rows.length, template: template.name },
    });

    // Required-but-empty columns are reported, not silently exported. A carrier
    // rejecting a batch for one blank column costs days.
    return { ok: true, csv, headers, rows, problems, filename: `${template.name.replace(/\W+/g, "-").toLowerCase()}.csv` };
  });

export const generateEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    request_id: z.string().uuid(),
    template_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await requireCapability(
      userId, ["contracting_submit", "staff_submit_carrier_requests"],
      "You don't have permission to generate submission emails.",
    );

    const { data: template } = await supabaseAdmin
      .from("contracting_email_templates")
      .select("*").eq("id", data.template_id).eq("organization_id", orgId).maybeSingle();
    if (!template) throw new OrgAccessError("That template is not available to you");

    const packet = await packetFor(data.request_id, orgId, userId);

    const subject = renderTemplate(template.subject, packet);
    const body = renderTemplate(template.body, packet);
    const unresolved = [
      ...new Set([
        ...unresolvedVariables(template.subject, packet),
        ...unresolvedVariables(template.body, packet),
      ]),
    ];

    await supabaseAdmin.from("contracting_submissions").insert({
      organization_id: orgId,
      request_id: data.request_id,
      artifact_type: "email",
      method: "email",
      template_id: data.template_id,
      payload_snapshot: { subject, body, to: template.to_email ?? packet.carrier.contracting_email },
      recipient: template.to_email ?? packet.carrier.contracting_email,
      generated_by: userId,
    });

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "email.generated",
      recordType: "contracting_requests", recordId: data.request_id,
      metadata: { template: template.name, unresolved: unresolved.length },
    });

    return {
      ok: true,
      to: template.to_email ?? packet.carrier.contracting_email ?? "",
      cc: template.cc_email ?? "",
      subject,
      body,
      // Named so an operator proofreading the draft can see what did not fill
      // in, rather than discovering it after the carrier replies.
      unresolved,
      // Attachments are a suggestion. Nothing is attached automatically, and
      // sensitive documents never ride along without an explicit action.
      suggested_attachments: template.suggested_attachments ?? [],
    };
  });
