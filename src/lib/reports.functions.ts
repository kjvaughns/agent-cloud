import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin as _admin } from "@/integrations/supabase/client.server";
import { getMyPrimaryOrgId } from "@/lib/org-guard";

const supabaseAdmin = _admin as any;

type Ctx = { supabase: any; userId: string };

/**
 * Reporting and export.
 *
 * Every query runs on the RLS-bound client, so a report can only ever contain
 * rows the caller is already entitled to. The service-role client appears once,
 * to write the export audit entry — deliberately, so a user cannot suppress
 * their own record of taking data out.
 */

const RANGE = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function rangeBounds(r: { from?: string; to?: string }) {
  const to = r.to ? new Date(r.to + "T23:59:59.999Z") : new Date();
  const from = r.from
    ? new Date(r.from + "T00:00:00.000Z")
    : new Date(Date.UTC(to.getUTCFullYear(), 0, 1));
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/**
 * Quote a CSV cell.
 *
 * The leading apostrophe on =, +, - and @ is deliberate: without it a cell like
 * "=cmd|..." is executed as a formula when the file is opened in Excel. That is
 * CSV injection, and an insurance book of business is exactly the kind of file
 * that gets opened in a spreadsheet.
 */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}

async function logExport(
  userId: string,
  type: string,
  rowCount: number,
  filters: Record<string, unknown>,
) {
  const orgId = await getMyPrimaryOrgId(userId);
  await supabaseAdmin.from("export_log").insert({
    organization_id: orgId,
    performed_by: userId,
    export_type: type,
    row_count: rowCount,
    filters,
  });
}

// ── Reports ──────────────────────────────────────────────────────────────────

export const getProductionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RANGE.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { fromIso, toIso } = rangeBounds(data);

    const { data: rows, error } = await supabase
      .from("policies")
      .select("id, agent_id, annual_premium, monthly_premium, status, product, carrier_id, posted_at")
      .gte("posted_at", fromIso)
      .lte("posted_at", toIso)
      .limit(20000);
    if (error) throw new Error(error.message);

    const all = rows ?? [];
    const byAgent = new Map<string, { policies: number; alp: number }>();
    const byProduct = new Map<string, { policies: number; alp: number }>();
    const byStatus = new Map<string, number>();

    for (const p of all) {
      const alp = Number(p.annual_premium ?? 0);
      const a = byAgent.get(p.agent_id) ?? { policies: 0, alp: 0 };
      byAgent.set(p.agent_id, { policies: a.policies + 1, alp: a.alp + alp });
      const key = p.product || "Unspecified";
      const pr = byProduct.get(key) ?? { policies: 0, alp: 0 };
      byProduct.set(key, { policies: pr.policies + 1, alp: pr.alp + alp });
      byStatus.set(p.status, (byStatus.get(p.status) ?? 0) + 1);
    }

    const ids = Array.from(byAgent.keys());
    const nameById = new Map<string, string>();
    if (ids.length) {
      const { data: people } = await supabase.from("profiles").select("id, first_name, last_name").in("id", ids);
      for (const p of people ?? []) nameById.set(p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim());
    }

    const totalAlp = all.reduce((a: number, p: any) => a + Number(p.annual_premium ?? 0), 0);

    return {
      totals: {
        policies: all.length,
        alp: totalAlp,
        avgPolicy: all.length ? totalAlp / all.length : 0,
        producingAgents: byAgent.size,
      },
      byAgent: Array.from(byAgent.entries())
        .map(([id, v]) => ({ id, name: nameById.get(id) || "—", ...v }))
        .sort((a, b) => b.alp - a.alp),
      byProduct: Array.from(byProduct.entries())
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.alp - a.alp),
      byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
    };
  });

export const getCommissionReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RANGE.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    const { fromIso, toIso } = rangeBounds(data);

    const { data: rows, error } = await supabase
      .from("commission_schedule")
      .select("agent_id, amount, status, payment_date, payment_type, carrier")
      .gte("payment_date", fromIso.slice(0, 10))
      .lte("payment_date", toIso.slice(0, 10))
      .limit(20000);
    if (error) throw new Error(error.message);

    const all = rows ?? [];
    const sum = (f: (r: any) => boolean) =>
      all.filter(f).reduce((a: number, r: any) => a + Number(r.amount ?? 0), 0);

    const byCarrier = new Map<string, number>();
    for (const r of all) {
      const k = r.carrier || "Unspecified";
      byCarrier.set(k, (byCarrier.get(k) ?? 0) + Number(r.amount ?? 0));
    }

    return {
      totals: {
        scheduled: sum(() => true),
        paid: sum((r) => r.status === "paid"),
        pending: sum((r) => r.status !== "paid"),
        entries: all.length,
      },
      byCarrier: Array.from(byCarrier.entries())
        .map(([carrier, amount]) => ({ carrier, amount }))
        .sort((a, b) => b.amount - a.amount),
    };
  });

// ── Exports ──────────────────────────────────────────────────────────────────

const ExportInput = z.object({
  type: z.enum(["clients", "policies", "commissions", "agents", "retention"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const exportCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    const { fromIso, toIso } = rangeBounds(data);
    const LIMIT = 50000;

    let headers: string[] = [];
    let body: unknown[][] = [];
    let filename = "export.csv";

    if (data.type === "clients") {
      const { data: rows, error } = await supabase
        .from("clients")
        .select("first_name, last_name, email, phone, state, date_of_birth, created_at")
        .limit(LIMIT);
      if (error) throw new Error(error.message);
      headers = ["First Name", "Last Name", "Email", "Phone", "State", "Date of Birth", "Created"];
      body = (rows ?? []).map((c: any) => [
        c.first_name, c.last_name, c.email, c.phone, c.state, c.date_of_birth,
        c.created_at?.slice(0, 10),
      ]);
      filename = "clients.csv";
    }

    if (data.type === "policies") {
      const { data: rows, error } = await supabase
        .from("policies")
        .select("policy_number, product, status, monthly_premium, annual_premium, face_amount, effective_date, posted_at, clients(first_name, last_name), carriers(name)")
        .gte("posted_at", fromIso)
        .lte("posted_at", toIso)
        .limit(LIMIT);
      if (error) throw new Error(error.message);
      headers = ["Policy Number", "Client", "Carrier", "Product", "Status", "Monthly Premium", "Annual Premium", "Face Amount", "Effective Date", "Posted"];
      body = (rows ?? []).map((p: any) => [
        p.policy_number,
        p.clients ? `${p.clients.first_name ?? ""} ${p.clients.last_name ?? ""}`.trim() : "",
        p.carriers?.name ?? "",
        p.product, p.status, p.monthly_premium, p.annual_premium, p.face_amount,
        p.effective_date, p.posted_at?.slice(0, 10),
      ]);
      filename = "policies.csv";
    }

    if (data.type === "commissions") {
      const { data: rows, error } = await supabase
        .from("commission_schedule")
        .select("carrier, client_name, product, amount, commission_pct, payment_type, payment_date, status, policy_year, month_number")
        .gte("payment_date", fromIso.slice(0, 10))
        .lte("payment_date", toIso.slice(0, 10))
        .limit(LIMIT);
      if (error) throw new Error(error.message);
      headers = ["Carrier", "Client", "Product", "Amount", "Rate %", "Type", "Payment Date", "Status", "Policy Year", "Month"];
      body = (rows ?? []).map((c: any) => [
        c.carrier, c.client_name, c.product, c.amount, c.commission_pct,
        c.payment_type, c.payment_date, c.status, c.policy_year, c.month_number,
      ]);
      filename = "commissions.csv";
    }

    if (data.type === "agents") {
      const { data: rows, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, email, phone, status, npn_number, created_at")
        .limit(LIMIT);
      if (error) throw new Error(error.message);
      // Deliberately excludes ssn_last4, date_of_birth, drivers_license_number
      // and street_address. An agent roster export is not a reason to move
      // identity documents out of the platform.
      headers = ["First Name", "Last Name", "Email", "Phone", "Status", "NPN", "Joined"];
      body = (rows ?? []).map((p: any) => [
        p.first_name, p.last_name, p.email, p.phone, p.status, p.npn_number,
        p.created_at?.slice(0, 10),
      ]);
      filename = "agents.csv";
    }

    if (data.type === "retention") {
      const { data: rows, error } = await supabase
        .from("retention_cases")
        .select("risk_reason, risk_score, status, premium_at_risk, opened_at, contacted_at, resolved_at, outcome_note")
        .limit(LIMIT);
      if (error) throw new Error(error.message);
      headers = ["Reason", "Risk Score", "Status", "Premium at Risk", "Opened", "Contacted", "Resolved", "Outcome"];
      body = (rows ?? []).map((r: any) => [
        r.risk_reason, r.risk_score, r.status, r.premium_at_risk,
        r.opened_at?.slice(0, 10), r.contacted_at?.slice(0, 10), r.resolved_at?.slice(0, 10),
        r.outcome_note,
      ]);
      filename = "retention.csv";
    }

    await logExport(userId, data.type, body.length, { from: data.from, to: data.to });

    return { filename, csv: toCsv(headers, body), rowCount: body.length };
  });

export const listExportLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data, error } = await supabase
      .from("export_log")
      .select("id, export_type, row_count, created_at, performed_by")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return { entries: [] };

    const ids = Array.from(new Set((data ?? []).map((e: any) => e.performed_by).filter(Boolean)));
    const nameById = new Map<string, string>();
    if (ids.length) {
      const { data: people } = await supabase.from("profiles").select("id, first_name, last_name").in("id", ids);
      for (const p of people ?? []) nameById.set(p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim());
    }

    return {
      entries: (data ?? []).map((e: any) => ({ ...e, actor: nameById.get(e.performed_by) ?? "—" })),
    };
  });
