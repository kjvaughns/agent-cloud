import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  normalizePhone,
  detectDuplicate,
  detectDuplicatePolicy,
  mapStage,
  mapTemperature,
} from "@/lib/import-helpers";

const AL_BASE = "https://agentlink.insuracloud.ai";

async function alCall(supabase: any, userId: string, path: string): Promise<any> {
  const { data: keyRow, error: keyErr } = await supabase
    .from("agent_integrations")
    .select("api_key")
    .eq("agent_id", userId)
    .eq("platform", "bookImport")
    .maybeSingle();

  if (keyErr) throw new Error(`DB error fetching API key: ${keyErr.message}`);
  if (!keyRow?.api_key) {
    throw new Error(
      "NO_KEY: No API key saved. Add your key in Producer Profile → Integrations."
    );
  }

  let res: Response;
  try {
    res = await fetch(`${AL_BASE}${path}`, {
      method: "GET",
      headers: { "x-api-key": keyRow.api_key, Accept: "application/json" },
    });
  } catch (e: any) {
    throw new Error(`NETWORK: Could not reach the import API — ${e.message}`);
  }

  if (res.status === 401)
    throw new Error(
      "AUTH: API key is invalid or expired. Generate a new one in your previous platform, under Producer Profile → Integrations."
    );
  if (res.status === 403)
    throw new Error("FORBIDDEN: Your API key doesn't have permission for this endpoint.");
  if (res.status === 404)
    throw new Error(`NOT_FOUND: Import endpoint ${path} not found. The API may have changed.`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API_ERROR ${res.status}: ${body.slice(0, 300)}`);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    const body = await res.text();
    throw new Error(`UNEXPECTED_RESPONSE: Expected JSON but got ${ct}. Body: ${body.slice(0, 200)}`);
  }

  return res.json();
}

// ─── Save API Key ─────────────────────────────────────────────────────────────
export const saveBookImportKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ api_key: z.string().min(10, "API key must be at least 10 characters") }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase.from("agent_integrations").upsert(
      {
        agent_id: userId,
        platform: "bookImport",
        api_key: data.api_key.trim(),
        connected_at: new Date().toISOString(),
        sync_status: "idle",
        last_error: null,
      },
      { onConflict: "agent_id,platform" }
    );
    if (error) throw new Error(`Failed to save key: ${error.message}`);
    return { ok: true };
  });

// ─── Get Key Status ───────────────────────────────────────────────────────────
export const getBookImportKeyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data, error } = await supabase
      .from("agent_integrations")
      .select("api_key, last_synced_at, sync_status, last_error")
      .eq("agent_id", userId)
      .eq("platform", "bookImport")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { connected: false };
    return {
      connected: true,
      masked_suffix: data.api_key?.slice(-6) ?? "??????",
      last_synced: data.last_synced_at
        ? new Date(data.last_synced_at).toLocaleDateString()
        : null,
      sync_status: data.sync_status,
      last_error: data.last_error,
    };
  });

// ─── Remove Key ───────────────────────────────────────────────────────────────
export const removeBookImportKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    // The result was discarded entirely, so a failure to remove a stored API
    // key reported success — the one outcome a user needs to be able to trust.
    // No row-count assertion: removing a key that was never saved is the state
    // the caller asked for, not a failure.
    const { error } = await supabase
      .from("agent_integrations")
      .delete()
      .eq("agent_id", userId)
      .eq("platform", "bookImport");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Test Connection ──────────────────────────────────────────────────────────
export const testBookImportKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    try {
      const data = await alCall(supabase, userId, "/api/v1/book-of-business");
      const clients = Array.isArray(data)
        ? data
        : (data?.clients ?? data?.contacts ?? data?.data ?? []);
      return { ok: true, client_count: clients.length };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

// ─── Main Import ──────────────────────────────────────────────────────────────
export const importBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        skip_duplicates: z.boolean().default(false),
        merge_duplicates: z.boolean().default(false),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: job, error: jobErr } = await supabase
      .from("import_jobs")
      .insert({ agent_id: userId, source: "agentlink_api", status: "running" })
      .select("id")
      .single();
    if (jobErr) throw new Error(`Failed to create import job: ${jobErr.message}`);
    const jobId = job.id;

    const updateJob = (patch: any) =>
      supabase.from("import_jobs").update(patch).eq("id", jobId);

    try {
      const bobData = await alCall(supabase, userId, "/api/v1/book-of-business");
      const rawClients: any[] = Array.isArray(bobData)
        ? bobData
        : (bobData?.clients ?? bobData?.contacts ?? bobData?.data ?? bobData?.records ?? []);

      await updateJob({ total_found: rawClients.length });

      let imported = 0,
        duplicates_found = 0,
        skipped = 0,
        policy_count = 0,
        note_count = 0;

      for (const contact of rawClients) {
        const firstName = (contact.first_name ?? contact.firstName ?? "").trim();
        const lastName = (contact.last_name ?? contact.lastName ?? "").trim();
        const phone = (
          contact.phone ??
          contact.phone_number ??
          contact.mobile ??
          ""
        ).trim();
        const email = (contact.email ?? "").trim();
        const dob =
          contact.date_of_birth ?? contact.dob ?? contact.dateOfBirth ?? null;
        const street =
          contact.address?.street ??
          contact.street_address ??
          contact.address ??
          "";
        const city = contact.address?.city ?? contact.city ?? "";
        const state = contact.address?.state ?? contact.state ?? "";
        const zip =
          contact.address?.zip ??
          contact.zip ??
          contact.zip_code ??
          contact.postal_code ??
          "";

        if (!firstName && !lastName) {
          skipped++;
          continue;
        }

        const dupMatch = await detectDuplicate(supabase, userId, {
          phone,
          first_name: firstName,
          last_name: lastName,
          dob: typeof dob === "string" ? dob : undefined,
        });

        if (dupMatch) {
          duplicates_found++;
          await supabase.from("import_duplicates").insert({
            import_job_id: jobId,
            agent_id: userId,
            match_type: dupMatch.type,
            confidence: dupMatch.confidence,
            incoming_data: contact,
            existing_client_id: dupMatch.existing_client_id,
            resolution: data.merge_duplicates
              ? "merge"
              : data.skip_duplicates
              ? "skip"
              : "pending",
          });

          if (data.skip_duplicates) {
            skipped++;
            continue;
          }

          if (data.merge_duplicates) {
            const patch: any = {};
            if (email) patch.email = email;
            if (street) patch.street_address = street;
            if (city) patch.city = city;
            if (state) patch.state = state;
            if (zip) patch.zip_code = zip;
            if (dob) patch.date_of_birth = dob;
            if (Object.keys(patch).length > 0) {
              await supabase
                .from("clients")
                .update(patch)
                .eq("id", dupMatch.existing_client_id);
            }
            const policies: any[] =
              contact.policies ?? contact.policy_records ?? [];
            for (const pol of policies) {
              const pn = pol.policy_number ?? pol.policyNumber ?? null;
              if (pn && (await detectDuplicatePolicy(supabase, userId, pn)))
                continue;
              await supabase.from("policies").insert(buildPolicy(dupMatch.existing_client_id, userId, pol));
              policy_count++;
            }
            imported++;
            continue;
          }

          skipped++;
          continue;
        }

        // No duplicate — insert new client
        const { data: newClient, error: clientErr } = await supabase
          .from("clients")
          .insert({
            agent_id: userId,
            first_name: firstName,
            last_name: lastName,
            phone: phone || null,
            email: email || null,
            date_of_birth: dob || null,
            street_address: street || null,
            city: city || null,
            state: state || null,
            zip_code: zip || null,
            stage: mapStage(contact.status ?? contact.stage),
            temperature: mapTemperature(contact.temperature ?? contact.lead_score),
          })
          .select("id")
          .single();

        if (clientErr) {
          if (clientErr.code === "23505") {
            duplicates_found++;
          }
          skipped++;
          continue;
        }

        const clientId = newClient.id;
        imported++;

        const policies: any[] = contact.policies ?? contact.policy_records ?? [];
        for (const pol of policies) {
          const pn = pol.policy_number ?? pol.policyNumber ?? null;
          if (pn && (await detectDuplicatePolicy(supabase, userId, pn))) continue;
          await supabase.from("policies").insert(buildPolicy(clientId, userId, pol));
          policy_count++;
        }

        const notes: any[] = contact.notes ?? contact.agent_notes ?? [];
        for (const note of notes) {
          const body =
            typeof note === "string"
              ? note
              : (note.content ?? note.body ?? note.text ?? "");
          if (!body.trim()) continue;
          await supabase.from("contact_history").insert({
            client_id: clientId,
            agent_id: userId,
            contact_type: "note",
            note: `[Imported from a previous platform] ${body}`,
            created_at: note.created_at ?? note.createdAt ?? new Date().toISOString(),
          });
          note_count++;
        }
      }

      const needsReview =
        duplicates_found > 0 && !data.skip_duplicates && !data.merge_duplicates;
      await updateJob({
        status: needsReview ? "review" : "done",
        imported,
        duplicates_found,
        skipped,
        completed_at: new Date().toISOString(),
      });

      await supabase
        .from("agent_integrations")
        .update({
          last_synced_at: new Date().toISOString(),
          sync_status: "idle",
          last_error: null,
        })
        .eq("agent_id", userId)
        .eq("platform", "bookImport");

      return {
        job_id: jobId,
        imported,
        duplicates_found,
        skipped,
        policy_count,
        note_count,
        needs_review: needsReview,
      };
    } catch (err: any) {
      await updateJob({
        status: "error",
        error_log: err.message,
        completed_at: new Date().toISOString(),
      });
      await supabase
        .from("agent_integrations")
        .update({ sync_status: "error", last_error: err.message })
        .eq("agent_id", userId)
        .eq("platform", "bookImport");
      throw err;
    }
  });

function buildPolicy(clientId: string, agentId: string, pol: any) {
  return {
    client_id: clientId,
    agent_id: agentId,
    policy_number: pol.policy_number ?? pol.policyNumber ?? null,
    product: pol.product ?? pol.product_name ?? pol.plan_name ?? "Unknown",
    status: pol.status ?? "active",
    annual_premium: Number(pol.annual_premium ?? pol.annualPremium ?? 0),
    monthly_premium: Number(
      pol.monthly_premium ?? pol.monthlyPremium ?? pol.premium ?? 0
    ),
    face_amount: Number(pol.face_amount ?? pol.faceAmount ?? pol.coverage ?? 0),
    effective_date: pol.effective_date ?? pol.effectiveDate ?? null,
    posted_at: pol.created_at ?? new Date().toISOString(),
  };
}

// ─── Resolve Duplicate ────────────────────────────────────────────────────────
export const resolveDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        duplicate_id: z.string().uuid(),
        resolution: z.enum(["merge", "skip", "keep_both"]),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const { data: dup } = await supabase
      .from("import_duplicates")
      .select("*")
      .eq("id", data.duplicate_id)
      .eq("agent_id", userId)
      .single();
    if (!dup) throw new Error("Duplicate record not found");

    if (data.resolution === "merge" && dup.existing_client_id) {
      const inc = dup.incoming_data;
      const patch: any = {};
      if (inc.email) patch.email = inc.email;
      if (inc.street_address ?? inc.address)
        patch.street_address = inc.street_address ?? inc.address;
      if (inc.city) patch.city = inc.city;
      if (inc.state) patch.state = inc.state;
      if (inc.zip ?? inc.zip_code) patch.zip_code = inc.zip ?? inc.zip_code;
      if (Object.keys(patch).length > 0) {
        await supabase
          .from("clients")
          .update(patch)
          .eq("id", dup.existing_client_id);
      }
    } else if (data.resolution === "keep_both") {
      const inc = dup.incoming_data;
      await supabase.from("clients").insert({
        agent_id: userId,
        first_name: inc.first_name ?? "",
        last_name: inc.last_name ?? "",
        phone: inc.phone ?? null,
        email: inc.email ?? null,
        date_of_birth: inc.dob ?? inc.date_of_birth ?? null,
        stage: "new",
        temperature: "cold",
      });
    }

    await supabase
      .from("import_duplicates")
      .update({ resolution: data.resolution, resolved_at: new Date().toISOString() })
      .eq("id", data.duplicate_id);

    return { ok: true };
  });

// ─── Get Pending Duplicates ───────────────────────────────────────────────────
export const getPendingDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ job_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { data: dups } = await supabase
      .from("import_duplicates")
      .select(
        "*, clients!existing_client_id(first_name, last_name, phone, email, stage)"
      )
      .eq("agent_id", userId)
      .eq("import_job_id", data.job_id)
      .eq("resolution", "pending")
      .order("confidence", { ascending: false });
    return { duplicates: dups ?? [] };
  });

// ─── Test Connection (new name) ───────────────────────────────────────────────
export const testImportConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    try {
      const data = await alCall(supabase, userId, "/api/v1/book-of-business");
      const clients = Array.isArray(data)
        ? data
        : (data?.clients ?? data?.contacts ?? data?.data ?? []);
      return { ok: true, count: clients.length };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

// ─── Basic Import (phone-only dup check, policies + carrier auto-detection) ───
export const basicImportFromBookImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;

    const bobData = await alCall(supabase, userId, "/api/v1/book-of-business");
    const rawClients: any[] = Array.isArray(bobData)
      ? bobData
      : (bobData?.clients ?? bobData?.contacts ?? bobData?.data ?? bobData?.records ?? []);

    let imported = 0, skipped = 0, duplicates = 0;

    for (const contact of rawClients) {
      const firstName = (contact.first_name ?? contact.firstName ?? "").trim();
      const lastName  = (contact.last_name  ?? contact.lastName  ?? "").trim();
      const rawPhone  = (contact.phone ?? contact.phone_number ?? contact.mobile ?? "").trim();
      const phone     = rawPhone ? normalizePhone(rawPhone) : null;
      const email     = (contact.email ?? "").trim();
      const dob       = contact.date_of_birth ?? contact.dob ?? contact.dateOfBirth ?? null;
      const street    = contact.address?.street ?? contact.street_address ?? contact.address ?? "";
      const city      = contact.address?.city  ?? contact.city  ?? "";
      const state     = contact.address?.state ?? contact.state ?? "";
      const zip       = contact.address?.zip ?? contact.zip ?? contact.zip_code ?? contact.postal_code ?? "";

      if (!firstName && !lastName) { skipped++; continue; }

      if (phone) {
        const { data: existing } = await supabase
          .from("clients")
          .select("id")
          .eq("agent_id", userId)
          .eq("phone", phone)
          .maybeSingle();
        if (existing) { duplicates++; continue; }
      }

      const { data: newClient, error: clientErr } = await supabase.from("clients").insert({
        agent_id: userId,
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
        email: email || null,
        date_of_birth: dob || null,
        street_address: street || null,
        city: city || null,
        state: state || null,
        zip_code: zip || null,
        stage: mapStage(contact.status ?? contact.stage),
        temperature: mapTemperature(contact.temperature ?? contact.lead_score),
      }).select("id").single();

      if (clientErr) {
        if (clientErr.code === "23505") { duplicates++; } else { skipped++; }
        continue;
      }

      imported++;
      const clientId = newClient.id;

      const policies: any[] = contact.policies ?? contact.policy_records ?? [];
      for (const pol of policies) {
        const pn = pol.policy_number ?? pol.policyNumber ?? null;
        if (pn && (await detectDuplicatePolicy(supabase, userId, pn))) continue;
        await supabase.from("policies").insert(buildPolicy(clientId, userId, pol));
      }
    }

    await supabase
      .from("agent_integrations")
      .update({ last_synced_at: new Date().toISOString(), sync_status: "idle", last_error: null })
      .eq("agent_id", userId)
      .eq("platform", "bookImport");

    // Auto-detect carriers from all agent policies
    const { data: agentPolicies } = await supabase
      .from("policies")
      .select("carrier_id")
      .eq("agent_id", userId)
      .not("carrier_id", "is", null);

    const counts = new Map<string, number>();
    for (const p of agentPolicies ?? []) {
      if (!p.carrier_id) continue;
      counts.set(p.carrier_id, (counts.get(p.carrier_id) ?? 0) + 1);
    }
    const uniqueCarrierIds = [...counts.keys()];

    // Detected, NOT created.
    //
    // This used to insert a `contract_requests` row with status 'assigned' for
    // every carrier it saw — which is the system asserting, on the agent's
    // behalf and without asking, that they hold a contract with that carrier.
    // A contract is a legal relationship; inferring one from a spreadsheet
    // cell is not a shortcut, it is a claim about the agent's business that
    // may simply be false. Anything the carrier matcher was unsure of would
    // have been asserted just as confidently as anything it was certain of.
    //
    // So the list comes back and the agent ticks what is theirs.
    // `confirmDetectedCarriers` does the writing.
    let detected: { carrier_id: string; name: string; policy_count: number }[] = [];
    if (uniqueCarrierIds.length > 0) {
      const [{ data: carrierRows }, { data: existingContracts }] = await Promise.all([
        supabase.from("carriers").select("id, name").in("id", uniqueCarrierIds),
        supabase.from("contract_requests").select("carrier_id").eq("agent_id", userId).in("carrier_id", uniqueCarrierIds),
      ]);
      const already = new Set((existingContracts ?? []).map((r: any) => r.carrier_id));
      const nameById = new Map<string, string>((carrierRows ?? []).map((c: any) => [c.id as string, String(c.name ?? "")]));

      detected = uniqueCarrierIds
        .filter((id) => !already.has(id))
        .map((id) => ({
          carrier_id: id,
          name: nameById.get(id) ?? "Unknown carrier",
          policy_count: counts.get(id) ?? 0,
        }))
        // Most policies first: the carrier they write most is the one they are
        // most certain about, and it should be the first thing they see.
        .sort((a, b) => b.policy_count - a.policy_count);
    }

    return {
      imported,
      skipped,
      duplicates,
      total: rawClients.length,
      carriers_detected: detected.length,
      detected_carriers: detected,
    };
  });

/**
 * The credential-import path is gone.
 *
 * `submitFullImportRequest` and `submitScrapeRequest` accepted an agent's
 * email and password for another platform, base64-encoded the password —
 * beneath a dialog that told them it was "stored encrypted" — wrote it to
 * `scrape_requests`, and offered admins a reveal button. Asking a customer for
 * their credentials to a third-party system is not something to do carefully;
 * it is something not to do. The Cowork migration flow replaces it: the agency
 * drives their own browser session and nothing is handed over.
 *
 * The rows already written are cleared by `20260805100000_drop-scrape-credentials.sql`.
 */


/**
 * Add the carriers the agent confirmed — and only those.
 *
 * The import detects; this commits. Splitting them is the point: a contract is
 * a legal relationship between an agent and a carrier, and the previous code
 * inferred one from a spreadsheet cell and wrote `status: 'assigned'` without
 * ever asking. That is the system making a claim about somebody's business on
 * their behalf, and it was as confident about a carrier the matcher had
 * guessed at as about one it was certain of.
 *
 * Two rows per confirmed carrier, because a contract that the agency cannot
 * see is only half a contract:
 *
 *   - `contract_requests` — the agent's side.
 *   - `org_carriers` — the agency overlay every dropdown in the product reads.
 *     Without it the policies show against a carrier that does not appear in
 *     the agency's own carrier list.
 */
export const confirmDetectedCarriers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ carrierIds: z.array(z.string().uuid()).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    if (data.carrierIds.length === 0) return { added: 0 };

    // Re-checked here rather than trusted from the client. The list came from
    // us, but it came back through a browser, and "which carriers am I
    // contracted with" is not a question to take an unverified answer to.
    const { data: existing } = await supabase
      .from("contract_requests")
      .select("carrier_id")
      .eq("agent_id", userId)
      .in("carrier_id", data.carrierIds);
    const already = new Set((existing ?? []).map((r: any) => r.carrier_id));
    const toAdd = data.carrierIds.filter((id) => !already.has(id));
    if (toAdd.length === 0) return { added: 0 };

    const { error } = await supabase.from("contract_requests").insert(
      toAdd.map((carrierId) => ({
        agent_id: userId,
        carrier_id: carrierId,
        status: "assigned",
        source: "confirmed_import",
        notes: "Confirmed by the agent after a book import. Add your writing number to activate.",
        requested_at: new Date().toISOString(),
      })),
    );
    if (error) throw new Error(error.message);

    const { data: profile } = await supabase
      .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
    const orgId = profile?.organization_id ?? null;

    if (orgId) {
      const { data: existingOrg } = await supabase
        .from("org_carriers")
        .select("carrier_id")
        .eq("organization_id", orgId)
        .in("carrier_id", toAdd);
      const haveOrg = new Set((existingOrg ?? []).map((r: any) => r.carrier_id));
      const newOrgCarriers = toAdd
        .filter((id) => !haveOrg.has(id))
        .map((carrierId) => ({
          organization_id: orgId,
          carrier_id: carrierId,
          status: "active",
          created_by: userId,
        }));
      if (newOrgCarriers.length > 0) {
        // Not fatal. The contract is the thing the agent asked for; a missing
        // org overlay is a gap somebody can fill from the carrier page, and
        // failing the whole confirmation over it would be worse.
        const { error: ocErr } = await supabase.from("org_carriers").insert(newOrgCarriers);
        if (ocErr) console.warn("[import] could not add org carriers:", ocErr.message);
      }
    }

    return { added: toAdd.length };
  });
