/**
 * One-off: import the agency's migration workbook (Team Roster / All Clients /
 * Book of Business / Client Notes) through the same helpers the Import page
 * uses, backdated onto each policy's effective date.
 *
 *   bun scripts/run-migration-import.ts /tmp/migration.json <owner-profile-id> [--dry]
 *
 * Every created id is written to a log file so the batch can be undone exactly.
 */

import { createClient } from "@supabase/supabase-js";
import {
  saveClientFullRecord,
  upsertPendingAgent,
  normalizePhone,
  mapStage,
  type FullClientRecord,
} from "../src/lib/import-helpers";

const [jsonPath, ownerId, ...flags] = process.argv.slice(2);
const DRY = flags.includes("--dry");
if (!jsonPath || !ownerId) throw new Error("usage: run-migration-import.ts <json> <ownerProfileId> [--dry]");

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const book = JSON.parse(await Bun.file(jsonPath).text()) as Record<string, Record<string, string>[]>;
const roster = book["Team Roster"] ?? [];
const clients = book["All Clients"] ?? [];
const policies = book["Book of Business"] ?? [];
const notes = book["Client Notes"] ?? [];

const TODAY = new Date().toISOString().slice(0, 10);
const log: any = { created_clients: [], created_policies: [], bad_dates: [], orphan_policies: [], orphan_notes: [], skipped_policies: [], owners: {}, errors: [] };

const splitName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
};
const num = (v?: string) => {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
};

/** A birth date is history by definition — validate the shape only. */
function birthDate(raw: string): string | null {
  const d = (raw ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/** Effective date sanity: the future is not production, and 1906 is a typo. */
function cleanDate(raw: string, label: string): string | null {
  const d = (raw ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (d < "2000-01-01") { log.bad_dates.push({ label, date: d, action: "no production date" }); return null; }
  if (d > TODAY) { log.bad_dates.push({ label, date: d, action: `clamped to ${TODAY}` }); return TODAY; }
  return d;
}

// ── 1. Roster → pending agents for anyone without an account ─────────────────
const rosterEmailByName = new Map<string, string>();
for (const r of roster) {
  const name = (r["Agent Name"] ?? "").trim();
  const email = (r["Email"] ?? "").trim().toLowerCase();
  if (!name || !email) continue;
  rosterEmailByName.set(name.toLowerCase(), email);
  const { first, last } = splitName(name);
  if (DRY) continue;
  try {
    const res = await upsertPendingAgent(supabase, ownerId, ownerId, {
      email, first_name: first, last_name: last,
      location: r["Location"] || null,
      status_label: r["Status"] || null,
      depth: r["Depth"] || null,
      contracts_label: r["Contracts"] || null,
      joined_date: cleanDate(r["Date Joined"] ?? "", `roster ${name}`) ?? null,
      last_active_label: r["Last Active"] || null,
    }, "migration-workbook");
    if (res.status === "created") log.created_clients.push({ pending_agent: res.pendingAgentId, email });
  } catch (e: any) {
    log.errors.push({ roster: name, error: e?.message });
  }
}

// ── 2. Owner resolution: account first, then roster email ────────────────────
const { data: profiles } = await supabase
  .from("profiles").select("id, first_name, last_name, email, organization_id")
  .eq("organization_id", (await supabase.from("profiles").select("organization_id").eq("id", ownerId).maybeSingle()).data?.organization_id ?? "")
  .limit(2000);
const byName = new Map<string, { id: string; email: string | null }>();
const nameCount = new Map<string, number>();
for (const p of profiles ?? []) {
  const k = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim().toLowerCase();
  if (!k) continue;
  nameCount.set(k, (nameCount.get(k) ?? 0) + 1);
  if (!byName.has(k)) byName.set(k, { id: p.id, email: p.email });
}
function resolveOwner(agentName: string): { agentId: string; assignedEmail: string | null; how: string } {
  const k = (agentName ?? "").trim().toLowerCase();
  const hit = byName.get(k);
  if (hit && nameCount.get(k) === 1) return { agentId: hit.id, assignedEmail: null, how: "account" };
  const email = rosterEmailByName.get(k);
  if (email) return { agentId: ownerId, assignedEmail: email, how: "assigned (no account yet)" };
  return { agentId: ownerId, assignedEmail: null, how: "fell back to importer" };
}

// ── 3. Existing book, agency-wide, so nothing is written twice ───────────────
const orgAgentIds = (profiles ?? []).map((p) => p.id);
const { data: existingClients } = await supabase
  .from("clients").select("id, first_name, last_name, phone, email, date_of_birth")
  .in("agent_id", orgAgentIds).limit(20000);
const byPhone = new Map<string, string>();
const byEmail = new Map<string, string>();
const byNameDob = new Map<string, string>();
const byFullName = new Map<string, string>();
for (const c of existingClients ?? []) {
  const nm = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim().toLowerCase();
  if (c.phone) byPhone.set(normalizePhone(c.phone), c.id);
  if (c.email) byEmail.set(c.email.toLowerCase(), c.id);
  if (nm && c.date_of_birth) byNameDob.set(`${nm}|${c.date_of_birth}`, c.id);
  if (nm && !byFullName.has(nm)) byFullName.set(nm, c.id);
}
const { data: existingPolicies } = await supabase
  .from("policies").select("policy_number").in("agent_id", orgAgentIds).limit(50000);
const knownPolicyNumbers = new Set(
  (existingPolicies ?? []).map((p) => String(p.policy_number ?? "").trim().toLowerCase()).filter(Boolean),
);

// ── 4. Cross-sheet assembly ──────────────────────────────────────────────────
const clientKey = (first: string, last: string) => `${first} ${last}`.trim().toLowerCase();
const clientRows = new Map<string, Record<string, string>>();
for (const c of clients) {
  const k = clientKey(c["First Name"] ?? "", c["Last Name"] ?? "");
  if (k) clientRows.set(k, c);
}

const polsByClient = new Map<string, Record<string, string>[]>();
for (const p of policies) {
  const k = (p["Client Name"] ?? "").trim().toLowerCase();
  if (!k) continue;
  if (!clientRows.has(k) && !byFullName.has(k)) { log.orphan_policies.push({ client: p["Client Name"], policy: p["Policy #"] }); continue; }
  (polsByClient.get(k) ?? polsByClient.set(k, []).get(k)!).push(p);
}
const notesByClient = new Map<string, Record<string, string>[]>();
for (const n of notes) {
  const k = (n["Client Name"] ?? "").trim().toLowerCase();
  if (!k) continue;
  if (!clientRows.has(k) && !byFullName.has(k)) { log.orphan_notes.push({ client: n["Client Name"] }); continue; }
  (notesByClient.get(k) ?? notesByClient.set(k, []).get(k)!).push(n);
}

// Clients only present on the policy/notes sheets still need a record.
const allKeys = new Set<string>([...clientRows.keys(), ...polsByClient.keys(), ...notesByClient.keys()]);

// ── 5. Write ─────────────────────────────────────────────────────────────────
let done = 0;
for (const key of allKeys) {
  const row = clientRows.get(key);
  const pols = polsByClient.get(key) ?? [];
  const nts = notesByClient.get(key) ?? [];

  const agentName = row?.["Agent"] || pols[0]?.["Agent"] || nts[0]?.["Author"] || "";
  const owner = resolveOwner(agentName);
  log.owners[agentName || "(none)"] = owner.how;

  const nameParts = row
    ? { first: row["First Name"] ?? "", last: row["Last Name"] ?? "" }
    : (() => { const s = splitName(key); return { first: s.first, last: s.last }; })();

  const phoneNorm = row?.["Phone"] ? normalizePhone(row["Phone"]) : "";
  const dob = row?.["Date of Birth"] ? birthDate(row["Date of Birth"]) : null;
  const existingId =
    (phoneNorm && byPhone.get(phoneNorm)) ||
    (row?.["Email"] && byEmail.get(row["Email"].toLowerCase())) ||
    (dob && byNameDob.get(`${key}|${dob}`)) ||
    byFullName.get(key) ||
    null;

  const rec: FullClientRecord = {
    first_name: nameParts.first || "Unknown",
    last_name: nameParts.last || "Unknown",
    phone: row?.["Phone"] || null,
    email: row?.["Email"] || null,
    date_of_birth: dob,
    street_address: row?.["Street Address"] || null,
    city: row?.["City"] || null,
    state: row?.["State"] || null,
    zip_code: row?.["ZIP"] || null,
    born_country_state: row?.["Born In"] || null,
    stage: mapStage(row?.["Stage"] ?? (pols.length ? "sold" : undefined)),
    assigned_to_email: owner.assignedEmail,
    tobacco_use: row?.["Smoker"] ? /^(y|yes|true|1)$/i.test(row["Smoker"]) : null,
    medical_notes: row?.["Medical Notes"] || null,
    monthly_income: num(row?.["Monthly Income"]),
    employment: row?.["Employment"] || null,
    pitch_carrier: row?.["Pitch Carrier"] || null,
    pitch_face_amount: num(row?.["Face Amount"]),
    reminder_notes: row?.["Reminder Notes"] || null,
    callback_date: row?.["Callback Date"] || null,
    policies: pols.map((p) => ({
      carrier_name: p["Carrier"] || null,
      product: p["Product"] || null,
      policy_number: p["Policy #"] || null,
      monthly_premium: num(p["Monthly Premium"]),
      annual_premium: num(p["Annual Premium"]),
      effective_date: cleanDate(p["Effective Date"] ?? "", `policy ${p["Policy #"] || key}`),
      status: p["Status"]?.trim() || "Active",
    })),
    notes: nts.map((n) => ({
      content: n["Note Content"] ?? "",
      note_type: n["Note Type"] || null,
      author: n["Author"] || null,
      created_at: cleanDate(n["Date"] ?? "", `note ${key}`),
    })),
  };

  if (DRY) { done++; continue; }
  try {
    const res = await saveClientFullRecord(supabase, owner.agentId, rec, {
      match: { existing_client_id: existingId },
      backdate: true,
      buildCommissions: true,
      knownPolicyNumbers,
    });
    if (res.isNew) log.created_clients.push({ client: res.clientId, name: key, owner: owner.agentId });
    for (const p of rec.policies ?? []) if (p.policy_number) knownPolicyNumbers.add(p.policy_number.trim().toLowerCase());
  } catch (e: any) {
    log.errors.push({ client: key, error: e?.message });
  }
  if (++done % 25 === 0) console.log(`  ${done}/${allKeys.size}`);
}

const outPath = `/mnt/documents/import-log-${Date.now()}.json`;
await Bun.write(outPath, JSON.stringify(log, null, 2));
console.log(JSON.stringify({
  dry: DRY, clients_considered: allKeys.size,
  created: log.created_clients.length, orphan_policies: log.orphan_policies.length,
  orphan_notes: log.orphan_notes.length, bad_dates: log.bad_dates.length,
  errors: log.errors.slice(0, 10), error_count: log.errors.length, owners: log.owners, log: outPath,
}, null, 2));
