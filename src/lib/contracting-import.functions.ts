import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId, OrgAccessError } from "@/lib/org-guard";
import { recordAudit } from "@/lib/contracting-ops/audit";

const supabaseAdmin = _admin as any;
type Ctx = { supabase: any; userId: string };

/**
 * CSV import.
 *
 * Parsing happens in the browser — a CSV is text, and shipping it to the server
 * to be split on commas buys nothing. What the server does is the part that
 * must not be trusted to a client: resolving names to ids inside the caller's
 * organization, rejecting rows that point outside it, detecting duplicates, and
 * writing.
 *
 * Every import is dry-run first. An importer that writes 400 rows and then
 * reports the 12 that failed has already made a mess someone has to clean up.
 */

export const IMPORT_KINDS = ["writing_numbers", "licenses", "carriers"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

/** The columns each import understands, in the order a template offers them. */
export const IMPORT_COLUMNS: Record<ImportKind, { key: string; label: string; required?: boolean }[]> = {
  writing_numbers: [
    { key: "agent_npn", label: "Agent NPN" },
    { key: "agent_email", label: "Agent email" },
    { key: "carrier_name", label: "Carrier name", required: true },
    { key: "writing_number", label: "Writing number", required: true },
    { key: "number_type", label: "Type" },
    { key: "state_code", label: "State" },
    { key: "product_line", label: "Product line" },
    { key: "effective_date", label: "Effective date" },
    { key: "status", label: "Status" },
    { key: "upline_writing_number", label: "Upline writing number" },
  ],
  licenses: [
    { key: "agent_npn", label: "Agent NPN" },
    { key: "agent_email", label: "Agent email" },
    { key: "state_code", label: "State", required: true },
    { key: "license_number", label: "License number" },
    { key: "loa", label: "Lines of authority" },
    { key: "is_resident", label: "Resident (yes/no)" },
    { key: "issued_date", label: "Issued date" },
    { key: "expires_date", label: "Expires date" },
    { key: "status", label: "Status" },
  ],
  carriers: [
    { key: "carrier_name", label: "Carrier name", required: true },
    { key: "contracting_email", label: "Contracting email" },
    { key: "contracting_portal_url", label: "Portal URL" },
    { key: "surelc_url", label: "SureLC URL" },
    { key: "turnaround_days", label: "Turnaround days" },
    { key: "support_email", label: "Support email" },
  ],
};

type RowResult = {
  row: number;
  status: "create" | "update" | "skip" | "error";
  message: string;
  values?: Record<string, string>;
};

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

async function requireImportRights(userId: string, kind: ImportKind) {
  const a = await resolveAccess(userId);
  if (!a.orgId) throw new OrgAccessError("No organization on your account");
  const flags = kind === "licenses"
    ? ["contracting_manage_licenses", "contracting_manage_carriers"]
    : ["contracting_manage_carriers", "contracting_submit"];
  if (a.isOrgAdmin || flags.some((f) => Boolean((a.perms as any)[f]))) return a.orgId;
  throw new Error("You don't have permission to import this kind of record.");
}

/** Lookup tables for resolving human-readable columns to ids, org-scoped. */
async function buildLookups(orgId: string) {
  const [{ data: members }, { data: carriers }] = await Promise.all([
    supabaseAdmin.from("organization_memberships")
      .select("profile_id").eq("organization_id", orgId).eq("status", "active"),
    supabaseAdmin.from("org_carriers")
      .select("id, carriers ( name )").eq("organization_id", orgId),
  ]);

  const ids = (members ?? []).map((m: any) => m.profile_id);
  const { data: profiles } = ids.length
    ? await supabaseAdmin.from("profiles").select("id, email, npn_number").in("id", ids)
    : { data: [] };

  const byNpn = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const p of profiles ?? []) {
    if (p.npn_number) byNpn.set(String(p.npn_number).trim(), p.id);
    if (p.email) byEmail.set(String(p.email).trim().toLowerCase(), p.id);
  }

  const carrierByName = new Map<string, string>();
  for (const c of carriers ?? []) {
    const name = c.carriers?.name;
    if (name) carrierByName.set(String(name).trim().toLowerCase(), c.id);
  }

  return { byNpn, byEmail, carrierByName };
}

const norm = (v: unknown) => String(v ?? "").trim();
const yes = (v: unknown) => /^(y|yes|true|1|resident)$/i.test(norm(v));

const ImportSchema = z.object({
  kind: z.enum(IMPORT_KINDS),
  rows: z.array(z.record(z.string(), z.string())).min(1).max(2000),
  /** False runs a dry run and writes nothing. */
  commit: z.boolean().default(false),
});

export const importContractingRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const orgId = await requireImportRights(userId, data.kind);
    const { byNpn, byEmail, carrierByName } = await buildLookups(orgId);

    const results: RowResult[] = [];
    const writes: any[] = [];

    // Duplicates inside the file itself, which are as common as duplicates
    // against the database and much easier to miss.
    const seen = new Set<string>();

    for (let i = 0; i < data.rows.length; i++) {
      const raw = data.rows[i];
      const rowNo = i + 1;

      const resolveAgent = (): { id?: string; error?: string } => {
        const npn = norm(raw.agent_npn);
        const email = norm(raw.agent_email).toLowerCase();
        if (npn && byNpn.has(npn)) return { id: byNpn.get(npn) };
        if (email && byEmail.has(email)) return { id: byEmail.get(email) };
        if (!npn && !email) return { error: "No agent NPN or email in this row" };
        return { error: `No agent in your agency matches ${npn || email}` };
      };

      if (data.kind === "carriers") {
        const name = norm(raw.carrier_name);
        if (!name) { results.push({ row: rowNo, status: "error", message: "Carrier name is required" }); continue; }
        const key = `c:${name.toLowerCase()}`;
        if (seen.has(key)) { results.push({ row: rowNo, status: "skip", message: "Duplicate row in this file" }); continue; }
        seen.add(key);

        if (carrierByName.has(name.toLowerCase())) {
          results.push({ row: rowNo, status: "skip", message: `${name} is already in your directory` });
          continue;
        }
        writes.push({ _kind: "carrier", name, row: rowNo, fields: {
          contracting_email: norm(raw.contracting_email) || null,
          contracting_portal_url: norm(raw.contracting_portal_url) || null,
          surelc_url: norm(raw.surelc_url) || null,
          support_email: norm(raw.support_email) || null,
          turnaround_days: norm(raw.turnaround_days) ? Number(raw.turnaround_days) : null,
        }});
        results.push({ row: rowNo, status: "create", message: `Add ${name}`, values: { name } });
        continue;
      }

      const agent = resolveAgent();
      if (!agent.id) { results.push({ row: rowNo, status: "error", message: agent.error! }); continue; }

      if (data.kind === "licenses") {
        const state = norm(raw.state_code).toUpperCase();
        if (state.length !== 2) { results.push({ row: rowNo, status: "error", message: "State must be two letters" }); continue; }
        const key = `l:${agent.id}:${state}`;
        if (seen.has(key)) { results.push({ row: rowNo, status: "skip", message: "Duplicate row in this file" }); continue; }
        seen.add(key);

        writes.push({ _kind: "license", row: rowNo, fields: {
          organization_id: orgId,
          agent_id: agent.id,
          state_code: state,
          license_number: norm(raw.license_number) || null,
          loa: norm(raw.loa) || null,
          is_resident: yes(raw.is_resident),
          issued_date: norm(raw.issued_date) || null,
          expires_date: norm(raw.expires_date) || null,
          status: norm(raw.status).toLowerCase() || "active",
          last_verified_at: new Date().toISOString(),
          verified_by: userId,
          verification_source: "import",
        }});
        results.push({ row: rowNo, status: "create", message: `${state} licence`, values: { state } });
        continue;
      }

      // writing_numbers
      const carrierName = norm(raw.carrier_name);
      const carrierId = carrierByName.get(carrierName.toLowerCase());
      if (!carrierId) {
        results.push({ row: rowNo, status: "error", message: `“${carrierName}” is not in your carrier directory` });
        continue;
      }
      const number = norm(raw.writing_number);
      if (!number) { results.push({ row: rowNo, status: "error", message: "Writing number is required" }); continue; }

      const state = norm(raw.state_code).toUpperCase();
      const product = norm(raw.product_line);
      const key = `w:${agent.id}:${carrierId}:${number}:${state}:${product}`;
      if (seen.has(key)) { results.push({ row: rowNo, status: "skip", message: "Duplicate row in this file" }); continue; }
      seen.add(key);

      writes.push({ _kind: "writing_number", row: rowNo, fields: {
        organization_id: orgId,
        agent_id: agent.id,
        org_carrier_id: carrierId,
        writing_number: number,
        number_type: norm(raw.number_type).toLowerCase() || "individual",
        scope: state ? "state" : product ? "product" : "national",
        state_code: state || null,
        product_line: product || null,
        effective_date: norm(raw.effective_date) || null,
        status: norm(raw.status).toLowerCase() || "active",
        upline_writing_number: norm(raw.upline_writing_number) || null,
        source: "import",
        created_by: userId,
        updated_by: userId,
      }});
      results.push({ row: rowNo, status: "create", message: `${carrierName} — ${number}`, values: { number } });
    }

    const summary = {
      total: data.rows.length,
      create: results.filter((r) => r.status === "create").length,
      skip: results.filter((r) => r.status === "skip").length,
      error: results.filter((r) => r.status === "error").length,
    };

    if (!data.commit) return { ok: true, dryRun: true, summary, results };

    // Commit. Rows that fail at the database are reported individually rather
    // than failing the batch — one bad row should not discard 300 good ones.
    let written = 0;
    for (const w of writes) {
      try {
        if (w._kind === "carrier") {
          const { data: created, error } = await supabaseAdmin.from("carriers")
            .insert({ name: w.name, active: true, is_private: true, owner_organization_id: orgId, created_by: userId })
            .select("id").single();
          if (error) throw new Error(error.message);
          const { error: ocErr } = await supabaseAdmin.from("org_carriers").insert({
            organization_id: orgId, carrier_id: created.id, ...w.fields,
            created_by: userId, updated_by: userId,
          });
          if (ocErr) throw new Error(ocErr.message);
        } else {
          const table = w._kind === "license" ? "state_licenses" : "writing_numbers";
          const { error } = await supabaseAdmin.from(table).insert(w.fields);
          if (error) throw new Error(error.message);
        }
        written += 1;
      } catch (err: any) {
        const target = results.find((r) => r.row === w.row);
        if (target) {
          target.status = "error";
          target.message = String(err?.message ?? "Could not write this row");
        }
      }
    }

    await recordAudit({
      organizationId: orgId, actorId: userId, action: "spreadsheet.exported",
      recordType: `import:${data.kind}`,
      metadata: { total: summary.total, written, errors: summary.error },
    });

    await supabaseAdmin.from("export_log").insert({
      organization_id: orgId, performed_by: userId,
      export_type: `import_${data.kind}`, row_count: written,
      filters: { total: summary.total },
    });

    return {
      ok: true,
      dryRun: false,
      summary: { ...summary, written, error: results.filter((r) => r.status === "error").length },
      results,
    };
  });
