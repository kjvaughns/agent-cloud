import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  detectTeamDuplicate,
  mapStage,
  mapTemperature,
  mapPolicyStatus,
  normalizePhone,
  saveClientFullRecord,
} from "@/lib/import-helpers";

type Ctx = { supabase: any; userId: string };

async function requireAdminOrManager(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "manager"])
    .maybeSingle();
  if (!data) throw new Error("Forbidden: admin or manager role required");
}

// ─── AgentLink multi-sheet detection & parser ────────────────────────────────

const AL_SHEET_NAMES = ["Team Roster", "Book of Business", "All Clients", "Client Notes"];

type ParsedRoster = {
  email: string;
  first_name: string;
  last_name: string;
  location: string | null;
  status_label: string | null;
  depth: string | null;
  contracts_label: string | null;
  joined_date: string | null;
  last_active_label: string | null;
};

type ParsedClient = {
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  born_country_state: string | null;
  stage: string;
  smoker: string | null;
  monthly_income: string | null;
  employment: string | null;
  pitch_carrier: string | null;
  face_amount: string | null;
  policy_number: string | null;
  medical_notes: string | null;
  reminder_notes: string | null;
  callback_date: string | null;
  agent_label: string | null; // raw "Agent" column value
};

type ParsedPolicy = {
  client_label: string;
  carrier: string | null;
  product: string | null;
  policy_number: string | null;
  status: string | null;
  monthly_premium: number;
  annual_premium: number;
  effective_date: string | null;
  agent_label: string | null;
};

type ParsedNote = {
  client_label: string;
  date: string | null;
  author: string | null;
  note_type: string | null;
  content: string;
};

type AgentLinkExport = {
  roster: ParsedRoster[];
  clients: ParsedClient[];
  policies: ParsedPolicy[];
  notes: ParsedNote[];
};

function cleanStr(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s === "—" || s === "-" || s.toLowerCase() === "nan") return null;
  return s;
}

function parseMoney(v: any): number {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/[$,\s]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseDateMaybe(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  // Real Date object (from XLSX cellDates:true)
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  // Excel serial number (days since 1899-12-30)
  if (typeof v === "number" && Number.isFinite(v) && v > 59 && v < 80000) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // MM/DD/YYYY or M/D/YY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    let [, mm, dd, yyyy] = m;
    if (yyyy.length === 2) yyyy = (Number(yyyy) >= 50 ? "19" : "20") + yyyy;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  // DD-MMM-YYYY (e.g. 05-Jan-2026)
  const m2 = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2}|\d{4})$/);
  if (m2) {
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const mi = months.indexOf(m2[2].slice(0, 3).toLowerCase());
    if (mi >= 0) {
      let yyyy = m2[3];
      if (yyyy.length === 2) yyyy = (Number(yyyy) >= 50 ? "19" : "20") + yyyy;
      return `${yyyy}-${String(mi + 1).padStart(2, "0")}-${m2[1].padStart(2, "0")}`;
    }
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function rowsToObjects(rows: any[][], headerRowIdx: number): Record<string, any>[] {
  const headers = (rows[headerRowIdx] ?? []).map((h) => cleanStr(h) ?? "");
  const out: Record<string, any>[] = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const obj: Record<string, any> = {};
    let any = false;
    headers.forEach((h, idx) => {
      if (!h) return;
      const val = r[idx];
      obj[h] = val;
      if (val !== null && val !== undefined && String(val).trim() !== "") any = true;
    });
    if (any) out.push(obj);
  }
  return out;
}

function findHeaderRow(rows: any[][], required: string[]): number {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const r = (rows[i] ?? []).map((c) => String(c ?? "").toLowerCase().trim());
    const hits = required.filter((req) => r.some((c) => c === req.toLowerCase())).length;
    if (hits >= Math.min(required.length, 2)) return i;
  }
  return 0;
}

async function parseAgentLinkExport(file_base64: string): Promise<AgentLinkExport | null> {
  const XLSX = await import("xlsx");
  const buf = Buffer.from(file_base64, "base64");
  let wb;
  try {
    wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  } catch {
    return null;
  }

  const hasAll = AL_SHEET_NAMES.every((n) =>
    wb.SheetNames.some((s) => s.toLowerCase() === n.toLowerCase()),
  );
  if (!hasAll) return null;

  const sheet = (name: string) =>
    wb.Sheets[wb.SheetNames.find((s) => s.toLowerCase() === name.toLowerCase())!];

  const toRows = (name: string): any[][] =>
    XLSX.utils.sheet_to_json(sheet(name), { header: 1, raw: false, defval: null }) as any[][];

  // Roster
  const rRows = toRows("Team Roster");
  const rHdr = findHeaderRow(rRows, ["Agent Name", "Email"]);
  const roster: ParsedRoster[] = rowsToObjects(rRows, rHdr)
    .filter((r) => cleanStr(r["Agent Name"]) && cleanStr(r["Email"]))
    .map((r) => {
      const full = (cleanStr(r["Agent Name"]) ?? "").split(/\s+/);
      return {
        email: (cleanStr(r["Email"]) ?? "").toLowerCase(),
        first_name: full[0] ?? "",
        last_name: full.slice(1).join(" "),
        location: cleanStr(r["Location"]),
        status_label: cleanStr(r["Status"]),
        depth: cleanStr(r["Depth"]),
        contracts_label: cleanStr(r["Contracts"]),
        joined_date: cleanStr(r["Date Joined"]),
        last_active_label: cleanStr(r["Last Active"]),
      };
    });

  // Clients
  const cRows = toRows("All Clients");
  const cHdr = findHeaderRow(cRows, ["First Name", "Last Name"]);
  const clients: ParsedClient[] = rowsToObjects(cRows, cHdr)
    .filter((r) => cleanStr(r["First Name"]) || cleanStr(r["Last Name"]))
    .map((r) => ({
      first_name: cleanStr(r["First Name"]) ?? "",
      last_name: cleanStr(r["Last Name"]) ?? "",
      phone: cleanStr(r["Phone"]),
      email: cleanStr(r["Email"]),
      date_of_birth: parseDateMaybe(r["Date of Birth"]),
      street_address: cleanStr(r["Street Address"]),
      city: cleanStr(r["City"]),
      state: cleanStr(r["State"]),
      zip_code: cleanStr(r["ZIP"] ?? r["Zip"] ?? r["Zip Code"]),
      born_country_state: cleanStr(r["Born In"]),
      stage: mapStage(cleanStr(r["Stage"]) ?? undefined),
      smoker: cleanStr(r["Smoker"]),
      monthly_income: cleanStr(r["Monthly Income"]),
      employment: cleanStr(r["Employment"]),
      pitch_carrier: cleanStr(r["Pitch Carrier"]),
      face_amount: cleanStr(r["Face Amount"]),
      policy_number: cleanStr(r["Policy #"]),
      medical_notes: cleanStr(r["Medical Notes"]),
      reminder_notes: cleanStr(r["Reminder Notes"]),
      callback_date: parseDateMaybe(r["Callback Date"]),
      agent_label: cleanStr(r["Agent"]),
    }));

  // Policies (Book of Business)
  const pRows = toRows("Book of Business");
  const pHdr = findHeaderRow(pRows, ["Client Name", "Carrier"]);
  const policies: ParsedPolicy[] = rowsToObjects(pRows, pHdr)
    .filter((r) => {
      const cn = cleanStr(r["Client Name"]);
      if (!cn) return false;
      // Skip footer/summary rows like "TOTALS", "TOTAL", "Grand Total"
      if (/^\s*(grand\s*)?totals?\s*$/i.test(cn)) return false;
      return true;
    })
    .map((r) => ({
      client_label: cleanStr(r["Client Name"]) ?? "",
      carrier: cleanStr(r["Carrier"]),
      product: cleanStr(r["Product"]),
      policy_number: cleanStr(r["Policy #"]),
      status: cleanStr(r["Status"]),
      monthly_premium: parseMoney(r["Monthly Premium"]),
      annual_premium: parseMoney(r["Annual Premium"]),
      effective_date: parseDateMaybe(r["Effective Date"]),
      agent_label: cleanStr(r["Agent"]),
    }));

  // Notes
  const nRows = toRows("Client Notes");
  const nHdr = findHeaderRow(nRows, ["Client Name", "Note Content"]);
  const notes: ParsedNote[] = rowsToObjects(nRows, nHdr)
    .filter((r) => cleanStr(r["Client Name"]) && cleanStr(r["Note Content"]))
    .map((r) => ({
      client_label: cleanStr(r["Client Name"]) ?? "",
      date: parseDateMaybe(r["Date"]),
      author: cleanStr(r["Author"]),
      note_type: cleanStr(r["Note Type"]),
      content: cleanStr(r["Note Content"]) ?? "",
    }));

  return { roster, clients, policies, notes };
}

// ─── AI fallback (single-sheet / unknown formats) ────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are a data extraction assistant for a life-insurance CRM migration tool.
You will be given an export from AgentLink (agentlink.insuracloud.ai) — could be a spreadsheet text dump, CSV, PDF, or screenshot.

Extract every client/contact you can find and return STRICT JSON only — no prose, no markdown fences.

Output schema:
{
  "source_description": "what the file appears to be",
  "clients": [
    {
      "first_name": "string", "last_name": "string",
      "phone": "digits only", "email": "string|null",
      "date_of_birth": "YYYY-MM-DD|null",
      "street_address": "string|null", "city": "string|null", "state": "2-letter|null", "zip_code": "string|null",
      "born_country_state": "string|null",
      "stage": "new|callback|almost_there|sold",
      "temperature": "hot|warm|cold",
      "ssn_last4": "string|null",
      "tobacco_use": true/false/null,
      "height_ft": 0, "height_in": 0, "weight_lbs": 0,
      "primary_physician": "string|null", "primary_physician_phone": "string|null",
      "conditions": "string|null", "medications": "string|null", "medical_notes": "string|null",
      "bank_name": "string|null", "routing_number": "string|null", "account_number": "string|null",
      "account_type": "checking|savings|null", "draft_date": 0, "payment_method": "string|null",
      "policies": [{"carrier_name":"","product":"","policy_number":"","monthly_premium":0,"annual_premium":0,"face_amount":0,"effective_date":null,"status":"active"}],
      "beneficiaries": [{"first_name":"","last_name":"","relationship":"","dob":null,"phone":null,"percentage":0}],
      "notes": [{"content":"","created_at":null,"note_type":null}]
    }
  ]
}
Rules: always return a top-level "clients" array; nulls (not empty strings) for missing; numeric fields default to 0; default stage=new, temperature=cold; parse SSN last-4 from notes when visible; parse heights like 5'10" into ft/in; JSON only.`;

async function extractWithAI(userContent: any[]): Promise<any> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("AI not configured (missing LOVABLE_API_KEY)");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (res.status === 429) throw new Error("AI rate limit — try again in a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted — add funds in workspace settings.");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI extraction failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const text = (json?.choices?.[0]?.message?.content ?? "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("AI returned unparseable response");
  }
}

async function fileToUserContent(file_base64: string, file_type: string, file_name: string): Promise<any[]> {
  const lower = file_name.toLowerCase();
  const isImage = file_type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(lower);
  const isPdf = file_type === "application/pdf" || /\.pdf$/i.test(lower);
  const isCsv = file_type === "text/csv" || /\.csv$/i.test(lower);
  const isXls = /spreadsheet|excel/i.test(file_type) || /\.xlsx?$/i.test(lower);

  if (isImage || isPdf) {
    const mime = file_type || (isPdf ? "application/pdf" : "image/png");
    return [
      { type: "text", text: `Extract all client/policy data from this ${isPdf ? "PDF" : "image"} (${file_name}).` },
      { type: "image_url", image_url: { url: `data:${mime};base64,${file_base64}` } },
    ];
  }
  if (isCsv) {
    const csvText = Buffer.from(file_base64, "base64").toString("utf-8").slice(0, 200_000);
    return [{ type: "text", text: `File: ${file_name}\n\nCSV contents:\n\n${csvText}` }];
  }
  if (isXls) {
    const XLSX = await import("xlsx");
    const buf = Buffer.from(file_base64, "base64");
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      parts.push(`=== Sheet: ${name} ===\n${csv}`);
    }
    const combined = parts.join("\n\n").slice(0, 200_000);
    return [{ type: "text", text: `File: ${file_name}\n\nSpreadsheet contents:\n\n${combined}` }];
  }
  const txt = Buffer.from(file_base64, "base64").toString("utf-8").slice(0, 200_000);
  return [{ type: "text", text: `File: ${file_name}\n\nContents:\n\n${txt}` }];
}

// ─── Owner resolution helpers ────────────────────────────────────────────────

function normName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function buildAgentEmailMap(roster: ParsedRoster[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of roster) {
    const full = `${r.first_name} ${r.last_name}`.trim();
    if (full && r.email) m.set(normName(full), r.email.toLowerCase());
  }
  return m;
}

// ─── Create import job + run extraction ──────────────────────────────────────

export const createAdminImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        target_agent_id: z.string().uuid(),
        scrape_request_id: z.string().uuid().optional().nullable(),
        file_name: z.string().min(1).max(255),
        file_type: z.string().max(120),
        file_base64: z.string().min(10).max(35_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireAdminOrManager(supabase, userId);

    const { data: job, error: jobErr } = await supabase
      .from("admin_import_jobs")
      .insert({
        admin_id: userId,
        target_agent_id: data.target_agent_id,
        scrape_request_id: data.scrape_request_id ?? null,
        file_name: data.file_name,
        file_type: data.file_type,
        status: "extracting",
      })
      .select("id")
      .single();
    if (jobErr) throw new Error(`Failed to create job: ${jobErr.message}`);

    try {
      // Try deterministic AgentLink multi-sheet parser first
      let extracted: any;
      const al = await parseAgentLinkExport(data.file_base64).catch(() => null);
      if (al) {
        extracted = {
          format: "agentlink_multisheet",
          source_description: "AgentLink multi-sheet export (Summary, Team Roster, Book of Business, All Clients, Client Notes)",
          counts: {
            roster: al.roster.length,
            clients: al.clients.length,
            policies: al.policies.length,
            notes: al.notes.length,
          },
          roster: al.roster,
          clients_raw: al.clients,
          policies_raw: al.policies,
          notes_raw: al.notes,
        };
      } else {
        const userContent = await fileToUserContent(data.file_base64, data.file_type, data.file_name);
        const aiResult = await extractWithAI(userContent);
        extracted = { format: "ai", ...aiResult };
      }

      await supabase
        .from("admin_import_jobs")
        .update({ status: "ready_for_review", extracted_json: extracted })
        .eq("id", job.id);

      return { job_id: job.id, extracted };
    } catch (e: any) {
      await supabase
        .from("admin_import_jobs")
        .update({ status: "error", ai_error: e?.message ?? String(e) })
        .eq("id", job.id);
      throw e;
    }
  });

// ─── Confirm import ──────────────────────────────────────────────────────────

export const confirmAdminImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ job_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireAdminOrManager(supabase, userId);

    const { data: job, error: jobErr } = await supabase
      .from("admin_import_jobs")
      .select("*")
      .eq("id", data.job_id)
      .single();
    if (jobErr || !job) throw new Error("Job not found");
    if (job.status !== "ready_for_review") {
      throw new Error(`Job is not ready for review (status: ${job.status})`);
    }

    await supabase.from("admin_import_jobs").update({ status: "importing" }).eq("id", job.id);

    const targetAgent = job.target_agent_id as string;
    const ex = job.extracted_json ?? {};

    let clientsImported = 0;
    let policiesImported = 0;
    let notesImported = 0;
    let duplicatesSkipped = 0;
    let pendingAgentsImported = 0;

    if (ex.format === "agentlink_multisheet") {
      const roster: ParsedRoster[] = ex.roster ?? [];
      const clientsRaw: ParsedClient[] = ex.clients_raw ?? [];
      const policiesRaw: ParsedPolicy[] = ex.policies_raw ?? [];
      const notesRaw: ParsedNote[] = ex.notes_raw ?? [];

      const nameToEmail = buildAgentEmailMap(roster);
      const allTeamEmails = Array.from(new Set(roster.map((r) => r.email).filter(Boolean)));

      // 1. Upsert pending_agents
      for (const r of roster) {
        if (!r.email) continue;
        // Skip if a real profile already exists with this email
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .ilike("email", r.email)
          .maybeSingle();
        if (existing) continue;

        const { error: upErr } = await supabase
          .from("pending_agents")
          .upsert(
            {
              email: r.email,
              first_name: r.first_name,
              last_name: r.last_name,
              location: r.location,
              status_label: r.status_label,
              depth: r.depth,
              contracts_label: r.contracts_label,
              upline_id: targetAgent,
              joined_date: r.joined_date,
              last_active_label: r.last_active_label,
              source: "agentlink_import",
              created_by: userId,
            },
            { onConflict: "email" },
          );
        if (!upErr) {
          pendingAgentsImported++;
          // Notify the importing admin that this roster member isn't on Agent Cloud yet
          await supabase.from("notifications").insert({
            user_id: userId,
            type: "missing_team_member",
            title: "Team member not on Agent Cloud",
            description: `${r.first_name} ${r.last_name} (${r.email}) was in your AgentLink roster but has no account yet. Consider sending them an invite.`,
            read: false,
          });
        }
      }

      // 2. Clients — track id by label for note attachment
      const clientIdByLabel = new Map<string, { id: string; ownerEmail: string | null }>();

      for (const c of clientsRaw) {
        const firstName = c.first_name.trim();
        const lastName = c.last_name.trim();
        if (!firstName && !lastName) continue;

        const ownerEmail = c.agent_label ? nameToEmail.get(normName(c.agent_label)) ?? null : null;

        const dup = await detectTeamDuplicate(supabase, targetAgent, allTeamEmails, {
          phone: c.phone ?? undefined,
          first_name: firstName,
          last_name: lastName,
          dob: c.date_of_birth ?? undefined,
        });
        if (dup) {
          duplicatesSkipped++;
          clientIdByLabel.set(normName(`${firstName} ${lastName}`), {
            id: dup.existing_client_id,
            ownerEmail,
          });
          continue;
        }

        // Split structured fields into individual Notes-tab entries (contact_history rows)
        // instead of stuffing them into the client's free-form notes blob.
        const importedNotes: string[] = [];
        if (c.medical_notes) importedNotes.push(`Medical: ${c.medical_notes}`);
        if (c.reminder_notes) importedNotes.push(`Reminder: ${c.reminder_notes}`);
        const detailBits: string[] = [];
        if (c.smoker) detailBits.push(`Smoker: ${c.smoker}`);
        if (c.monthly_income) detailBits.push(`Monthly income: ${c.monthly_income}`);
        if (c.employment) detailBits.push(`Employment: ${c.employment}`);
        if (c.pitch_carrier) detailBits.push(`Pitch carrier: ${c.pitch_carrier}`);
        if (c.face_amount) detailBits.push(`Face amount: ${c.face_amount}`);
        if (c.policy_number) detailBits.push(`Policy #: ${c.policy_number}`);
        if (c.callback_date) detailBits.push(`Callback: ${c.callback_date}`);
        if (detailBits.length) importedNotes.push(`Imported details:\n${detailBits.join("\n")}`);

        const { data: newClient, error: clientErr } = await supabase
          .from("clients")
          .insert({
            agent_id: targetAgent,
            assigned_to_email: ownerEmail,
            first_name: firstName || "Unknown",
            last_name: lastName || "Unknown",
            phone: c.phone,
            email: c.email,
            date_of_birth: c.date_of_birth,
            street_address: c.street_address,
            city: c.city,
            state: c.state,
            zip_code: c.zip_code,
            born_country_state: c.born_country_state,
            stage: c.stage,
            temperature: mapTemperature(undefined),
            notes: null,
          })
          .select("id")
          .single();

        if (clientErr || !newClient) continue;
        clientsImported++;
        clientIdByLabel.set(normName(`${firstName} ${lastName}`), {
          id: newClient.id,
          ownerEmail,
        });

        // Persist each structured bit as its own Notes-tab entry
        for (const body of importedNotes) {
          const { error: nErr } = await supabase.from("contact_history").insert({
            client_id: newClient.id,
            agent_id: targetAgent,
            assigned_to_email: ownerEmail,
            contact_type: "imported_note",
            note: body,
          });
          if (!nErr) notesImported++;
        }
      }

      // 3. Policies — match by client name from Book of Business
      // Build a carrier name → id map once for fast resolution
      const { data: carrierRows } = await supabase.from("carriers").select("id, name");
      const carrierByName = new Map<string, string>(
        (carrierRows ?? []).map((c: any) => [String(c.name).toLowerCase().trim(), c.id as string]),
      );
      const resolveCarrierId = (raw?: string | null): string | null => {
        if (!raw) return null;
        const k = raw.toLowerCase().trim();
        if (carrierByName.has(k)) return carrierByName.get(k)!;
        for (const [name, id] of carrierByName) {
          if (name.includes(k) || k.includes(name)) return id;
        }
        return null;
      };

      for (const p of policiesRaw) {
        const key = normName(p.client_label);
        const c = clientIdByLabel.get(key);
        if (!c) continue;

        const ownerEmail = p.agent_label ? nameToEmail.get(normName(p.agent_label)) ?? c.ownerEmail : c.ownerEmail;
        // Use effective date as the business "posted" date so historical
        // production lands in the correct month; fall back to now() only
        // when the source row has no effective date.
        const postedAt = p.effective_date
          ? new Date(`${p.effective_date}T12:00:00Z`).toISOString()
          : new Date().toISOString();

        // Team-wide policy dedupe by (policy_number) — skip if any team
        // member already has this policy number to prevent double imports
        if (p.policy_number) {
          const { data: existing } = await supabase
            .from("policies")
            .select("id")
            .eq("policy_number", p.policy_number)
            .limit(1)
            .maybeSingle();
          if (existing) { duplicatesSkipped++; continue; }
        }

        const { data: insertedPol, error } = await supabase.from("policies").insert({
          client_id: c.id,
          agent_id: targetAgent,
          assigned_to_email: ownerEmail,
          carrier_id: resolveCarrierId(p.carrier),
          product: p.product ?? p.carrier ?? "Unknown",
          policy_number: p.policy_number,
          monthly_premium: p.monthly_premium,
          annual_premium: p.annual_premium || p.monthly_premium * 12,
          effective_date: p.effective_date,
          status: mapPolicyStatus(p.status ?? undefined),
          posted_at: postedAt,
        }).select("id").single();
        if (!error && insertedPol) {
          policiesImported++;
          try {
            const { calculateAndInsertAllCommissions } = await import("@/lib/commission-calculator");
            await calculateAndInsertAllCommissions(supabase, {
              policyId: insertedPol.id,
              agentId: targetAgent,
              carrierId: resolveCarrierId(p.carrier),
              product: p.product ?? p.carrier ?? "Unknown",
              monthlyPremium: Number(p.monthly_premium ?? 0),
              effectiveDate: p.effective_date ?? null,
              clientName: "",
            });
          } catch (commErr) {
            console.warn("[import] commission calc failed:", (commErr as Error).message);
          }
        }
      }

      // 4. Notes
      for (const n of notesRaw) {
        const c = clientIdByLabel.get(normName(n.client_label));
        if (!c) continue;
        const body = [
          n.date ? `[${n.date}]` : null,
          n.author ? `(${n.author})` : null,
          n.note_type ? `${n.note_type}:` : null,
          n.content,
        ]
          .filter(Boolean)
          .join(" ");
        const { error } = await supabase.from("contact_history").insert({
          client_id: c.id,
          agent_id: targetAgent,
          assigned_to_email: c.ownerEmail,
          contact_type: "imported_note",
          note: body,
        });
        if (!error) notesImported++;
      }
    } else {
      // ─── Legacy AI-extracted path — funnel through saveClientFullRecord ──
      const clients: any[] = ex?.clients ?? [];
      for (const c of clients) {
        const firstName = (c.first_name ?? "").trim();
        const lastName = (c.last_name ?? "").trim();
        if (!firstName && !lastName) continue;

        const normalizedNotes = (c.notes ?? [])
          .map((n: any) => {
            if (!n) return null;
            if (typeof n === "string") return { content: n };
            return {
              content: n.content ?? n.body ?? n.text ?? "",
              created_at: n.created_at ?? n.date ?? null,
              note_type: n.note_type ?? null,
            };
          })
          .filter((n: any) => n && String(n.content).trim());

        const normalizedPolicies = (c.policies ?? []).map((p: any) => ({
          carrier_name: p.carrier_name ?? p.carrier ?? null,
          product: p.product ?? null,
          policy_number: p.policy_number ?? null,
          monthly_premium: Number(p.monthly_premium ?? 0) || null,
          annual_premium: Number(p.annual_premium ?? 0) || null,
          face_amount: Number(p.face_amount ?? 0) || null,
          effective_date: p.effective_date ?? null,
          status: mapPolicyStatus(p.status),
        }));

        try {
          const { isNew } = await saveClientFullRecord(supabase, targetAgent, {
            first_name: firstName || "Unknown",
            last_name: lastName || "Unknown",
            phone: c.phone ?? null,
            email: c.email ?? null,
            date_of_birth: c.date_of_birth ?? null,
            street_address: c.street_address ?? null,
            city: c.city ?? null,
            state: c.state ?? null,
            zip_code: c.zip_code ?? null,
            born_country_state: c.born_country_state ?? null,
            stage: mapStage(c.stage),
            temperature: mapTemperature(c.temperature),
            ssn_last4: c.ssn_last4 ?? null,
            tobacco_use: c.tobacco_use ?? null,
            height_ft: c.height_ft ?? null,
            height_in: c.height_in ?? null,
            weight_lbs: c.weight_lbs ?? null,
            primary_physician: c.primary_physician ?? null,
            primary_physician_phone: c.primary_physician_phone ?? null,
            conditions: c.conditions ?? null,
            medications: c.medications ?? null,
            medical_notes: c.medical_notes ?? null,
            bank_name: c.bank_name ?? null,
            routing_number: c.routing_number ?? null,
            account_number: c.account_number ?? null,
            account_type: c.account_type ?? null,
            draft_date: c.draft_date ?? null,
            payment_method: c.payment_method ?? null,
            policies: normalizedPolicies,
            beneficiaries: c.beneficiaries ?? [],
            notes: normalizedNotes,
          });
          if (isNew) clientsImported++;
          else duplicatesSkipped++;
          policiesImported += normalizedPolicies.length;
          notesImported += normalizedNotes.length;
        } catch {
          // skip on failure, keep going
        }
      }
    }

    await supabase
      .from("admin_import_jobs")
      .update({
        status: "completed",
        clients_imported: clientsImported,
        policies_imported: policiesImported,
        notes_imported: notesImported,
        duplicates_skipped: duplicatesSkipped,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    if (job.scrape_request_id) {
      await supabase
        .from("scrape_requests")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", job.scrape_request_id);
    }

    await supabase.from("notifications").insert({
      user_id: targetAgent,
      type: "import_complete",
      title: "Your AgentLink book has been imported",
      description: `${clientsImported} clients, ${policiesImported} policies, ${notesImported} notes added to your account.${
        pendingAgentsImported ? ` ${pendingAgentsImported} downline agents pre-seeded.` : ""
      }`,
      read: false,
    });

    return {
      ok: true,
      clients_imported: clientsImported,
      policies_imported: policiesImported,
      notes_imported: notesImported,
      duplicates_skipped: duplicatesSkipped,
      pending_agents_imported: pendingAgentsImported,
    };
  });

// ─── Discard job ─────────────────────────────────────────────────────────────

export const discardAdminImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ job_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireAdminOrManager(supabase, userId);
    await supabase
      .from("admin_import_jobs")
      .update({ status: "discarded", completed_at: new Date().toISOString() })
      .eq("id", data.job_id);
    return { ok: true };
  });

// Silence unused-import warning when the helper isn't called in some branches
void normalizePhone;

// ─── Replay policies for an already-completed multi-sheet job ────────────────
// Use this when a prior import landed clients/notes but policies failed
// silently (e.g. a downstream trigger rejected the insert). Re-runs only
// the policies loop against clients that already exist in the DB.

export const replayAdminImportPolicies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        job_id: z.string().uuid().optional(),
        scrape_request_id: z.string().uuid().optional(),
      })
      .refine((v) => v.job_id || v.scrape_request_id, "job_id or scrape_request_id required")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await requireAdminOrManager(supabase, userId);

    let jobId = data.job_id;
    if (!jobId && data.scrape_request_id) {
      const { data: j } = await supabase
        .from("admin_import_jobs")
        .select("id")
        .eq("scrape_request_id", data.scrape_request_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!j) throw new Error("No import job found for that request");
      jobId = j.id;
    }

    const { data: job, error: jobErr } = await supabase
      .from("admin_import_jobs")
      .select("*")
      .eq("id", jobId!)
      .single();
    if (jobErr || !job) throw new Error("Job not found");

    const ex = job.extracted_json ?? {};
    if (ex.format !== "agentlink_multisheet") {
      throw new Error("Replay only supports AgentLink multi-sheet jobs");
    }

    const targetAgent = job.target_agent_id as string;
    const roster: ParsedRoster[] = ex.roster ?? [];
    const policiesRaw: ParsedPolicy[] = ex.policies_raw ?? [];
    const nameToEmail = buildAgentEmailMap(roster);

    // Load existing clients for this target agent, key by normalized name
    const { data: existingClients } = await supabase
      .from("clients")
      .select("id, first_name, last_name, assigned_to_email")
      .eq("agent_id", targetAgent);

    const clientByName = new Map<string, { id: string; ownerEmail: string | null }>();
    for (const c of existingClients ?? []) {
      const key = normName(`${c.first_name ?? ""} ${c.last_name ?? ""}`);
      if (key) clientByName.set(key, { id: c.id, ownerEmail: c.assigned_to_email ?? null });
    }

    let inserted = 0;
    let clientsCreated = 0;
    let errors = 0;
    const errorSamples: string[] = [];

    for (const p of policiesRaw) {
      const label = (p.client_label ?? "").trim();
      if (!label) continue;
      const key = normName(label);
      let c = clientByName.get(key);

      const ownerEmail = p.agent_label
        ? nameToEmail.get(normName(p.agent_label)) ?? c?.ownerEmail ?? null
        : c?.ownerEmail ?? null;

      // Auto-create a "sold" client stub if this downline policy has no client yet
      if (!c) {
        const [firstName, ...rest] = label.split(/\s+/);
        const lastName = rest.join(" ");
        const { data: newClient, error: cErr } = await supabase
          .from("clients")
          .insert({
            agent_id: targetAgent,
            first_name: firstName,
            last_name: lastName,
            stage: "sold",
            assigned_to_email: ownerEmail,
          })
          .select("id")
          .single();
        if (cErr || !newClient) {
          errors++;
          if (errorSamples.length < 3) errorSamples.push(cErr?.message ?? "client create failed");
          continue;
        }
        c = { id: newClient.id, ownerEmail };
        clientByName.set(key, c);
        clientsCreated++;
      }

      if (p.policy_number) {
        const { data: dup } = await supabase
          .from("policies")
          .select("id")
          .eq("client_id", c.id)
          .eq("policy_number", p.policy_number)
          .maybeSingle();
        if (dup) continue;
      }

      const { error } = await supabase.from("policies").insert({
        client_id: c.id,
        agent_id: targetAgent,
        assigned_to_email: ownerEmail,
        product: p.product ?? p.carrier ?? "Unknown",
        policy_number: p.policy_number,
        monthly_premium: p.monthly_premium,
        annual_premium: p.annual_premium || (p.monthly_premium ?? 0) * 12,
        effective_date: p.effective_date,
        status: mapPolicyStatus(p.status ?? undefined),
        posted_at: new Date().toISOString(),
      });
      if (error) {
        errors++;
        if (errorSamples.length < 3) errorSamples.push(error.message);
      } else {
        inserted++;
      }
    }

    await supabase
      .from("admin_import_jobs")
      .update({ policies_imported: (job.policies_imported ?? 0) + inserted })
      .eq("id", job.id);

    return {
      ok: true,
      policies_inserted: inserted,
      clients_created: clientsCreated,
      errors,
      error_samples: errorSamples,
    };
  });
