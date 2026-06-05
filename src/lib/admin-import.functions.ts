import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { detectDuplicate, mapStage, mapTemperature, mapPolicyStatus } from "@/lib/import-helpers";

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

const EXTRACTION_SYSTEM_PROMPT = `You are a data extraction assistant for a life-insurance CRM migration tool.
You will be given an export from AgentLink (agentlink.insuracloud.ai) — could be a spreadsheet text dump, CSV, PDF, or screenshot of an agent's book of business.

Extract every client/contact you can find and return STRICT JSON only — no prose, no markdown fences.

Output schema:
{
  "source_description": "what the file appears to be",
  "clients": [
    {
      "first_name": "string",
      "last_name": "string",
      "phone": "digits only, 10 digits if possible, else null",
      "email": "string or null",
      "date_of_birth": "YYYY-MM-DD or null",
      "street_address": "string or null",
      "city": "string or null",
      "state": "2-letter US state code or null",
      "zip_code": "string or null",
      "stage": "new | callback | almost_there | sold",
      "temperature": "hot | warm | cold",
      "ssn_last4": "4 digits or null",
      "tobacco_use": true/false/null,
      "bank_name": "string or null",
      "routing_number": "string or null",
      "account_number": "string or null",
      "primary_physician": "string or null",
      "medical_notes": "string or null",
      "policies": [
        {
          "carrier": "string or null",
          "product": "string or null",
          "policy_number": "string or null",
          "monthly_premium": number,
          "annual_premium": number,
          "face_amount": number,
          "effective_date": "YYYY-MM-DD or null",
          "status": "active|in_review|lapse_pending|lapsed|cancelled|withdrawn"
        }
      ],
      "notes": ["string"]
    }
  ]
}

Rules:
- Always return a top-level "clients" array, even if empty.
- Skip rows that have no name at all.
- If a value is unclear, use null (not empty string).
- Default stage to "new" and temperature to "cold" if not indicated.
- Return JSON only.`;

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
    // try to pull JSON block out of text
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
    const wb = XLSX.read(buf, { type: "buffer" });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      parts.push(`=== Sheet: ${name} ===\n${csv}`);
    }
    const combined = parts.join("\n\n").slice(0, 200_000);
    return [{ type: "text", text: `File: ${file_name}\n\nSpreadsheet contents:\n\n${combined}` }];
  }

  // fallback: treat as text
  const txt = Buffer.from(file_base64, "base64").toString("utf-8").slice(0, 200_000);
  return [{ type: "text", text: `File: ${file_name}\n\nContents:\n\n${txt}` }];
}

// ─── Create import job + run extraction ───────────────────────────────────────
export const createAdminImportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        target_agent_id: z.string().uuid(),
        scrape_request_id: z.string().uuid().optional().nullable(),
        file_name: z.string().min(1).max(255),
        file_type: z.string().max(120),
        file_base64: z.string().min(10).max(35_000_000), // ~25MB
      })
      .parse(d)
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
      const userContent = await fileToUserContent(data.file_base64, data.file_type, data.file_name);
      const extracted = await extractWithAI(userContent);

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

// ─── Confirm import → write into target agent's records ───────────────────────
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
    const clients: any[] = job.extracted_json?.clients ?? [];

    let clientsImported = 0;
    let policiesImported = 0;
    let notesImported = 0;
    let duplicatesSkipped = 0;

    for (const c of clients) {
      const firstName = (c.first_name ?? "").trim();
      const lastName = (c.last_name ?? "").trim();
      if (!firstName && !lastName) continue;

      const dup = await detectDuplicate(supabase, targetAgent, {
        phone: c.phone ?? undefined,
        first_name: firstName,
        last_name: lastName,
        dob: c.date_of_birth ?? undefined,
      });
      if (dup) {
        duplicatesSkipped++;
        continue;
      }

      const { data: newClient, error: clientErr } = await supabase
        .from("clients")
        .insert({
          agent_id: targetAgent,
          first_name: firstName || "Unknown",
          last_name: lastName || "Unknown",
          phone: c.phone || null,
          email: c.email || null,
          date_of_birth: c.date_of_birth || null,
          street_address: c.street_address || null,
          city: c.city || null,
          state: c.state || null,
          zip_code: c.zip_code || null,
          stage: mapStage(c.stage),
          temperature: mapTemperature(c.temperature),
        })
        .select("id")
        .single();

      if (clientErr || !newClient) {
        duplicatesSkipped++;
        continue;
      }
      clientsImported++;
      const clientId = newClient.id;

      for (const p of c.policies ?? []) {
        const annual = Number(p.annual_premium ?? 0) || 0;
        const monthly = Number(p.monthly_premium ?? (annual ? annual / 12 : 0)) || 0;
        await supabase.from("policies").insert({
          client_id: clientId,
          agent_id: targetAgent,
          product: p.product ?? p.carrier ?? "Unknown",
          policy_number: p.policy_number ?? null,
          annual_premium: annual,
          monthly_premium: monthly,
          face_amount: Number(p.face_amount ?? 0) || 0,
          effective_date: p.effective_date ?? null,
          status: mapPolicyStatus(p.status),
          posted_at: new Date().toISOString(),
        });
        policiesImported++;
      }

      const noteParts: string[] = [];
      if (c.ssn_last4) noteParts.push(`SSN last 4: ${c.ssn_last4}`);
      if (c.tobacco_use !== null && c.tobacco_use !== undefined)
        noteParts.push(`Tobacco use: ${c.tobacco_use ? "yes" : "no"}`);
      if (c.bank_name) noteParts.push(`Bank: ${c.bank_name}`);
      if (c.routing_number) noteParts.push(`Routing: ${c.routing_number}`);
      if (c.account_number) noteParts.push(`Account: ${c.account_number}`);
      if (c.primary_physician) noteParts.push(`Primary physician: ${c.primary_physician}`);
      if (c.medical_notes) noteParts.push(`Medical: ${c.medical_notes}`);
      if (noteParts.length > 0) {
        await supabase.from("contact_history").insert({
          client_id: clientId,
          agent_id: targetAgent,
          contact_type: "note",
          note: `[Imported from AgentLink]\n${noteParts.join("\n")}`,
        });
        notesImported++;
      }
      for (const n of c.notes ?? []) {
        const body = typeof n === "string" ? n : (n?.content ?? n?.body ?? n?.text ?? "");
        if (!body.trim()) continue;
        await supabase.from("contact_history").insert({
          client_id: clientId,
          agent_id: targetAgent,
          contact_type: "note",
          note: `[Imported from AgentLink] ${body}`,
        });
        notesImported++;
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
      description: `${clientsImported} clients, ${policiesImported} policies, ${notesImported} notes added to your account. Check your Pipeline.`,
      read: false,
    });

    return {
      ok: true,
      clients_imported: clientsImported,
      policies_imported: policiesImported,
      notes_imported: notesImported,
      duplicates_skipped: duplicatesSkipped,
    };
  });

// ─── Discard job ──────────────────────────────────────────────────────────────
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
