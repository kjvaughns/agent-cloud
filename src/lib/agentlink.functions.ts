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
    .eq("platform", "agentlink")
    .maybeSingle();

  if (keyErr) throw new Error(`DB error fetching API key: ${keyErr.message}`);
  if (!keyRow?.api_key) {
    throw new Error(
      "NO_KEY: No AgentLink API key saved. Add your key in Producer Profile → Integrations."
    );
  }

  let res: Response;
  try {
    res = await fetch(`${AL_BASE}${path}`, {
      method: "GET",
      headers: { "x-api-key": keyRow.api_key, Accept: "application/json" },
    });
  } catch (e: any) {
    throw new Error(`NETWORK: Could not reach AgentLink — ${e.message}`);
  }

  if (res.status === 401)
    throw new Error(
      "AUTH: API key is invalid or expired. Generate a new one in AgentLink → Producer Profile → Integrations."
    );
  if (res.status === 403)
    throw new Error("FORBIDDEN: Your API key doesn't have permission for this endpoint.");
  if (res.status === 404)
    throw new Error(`NOT_FOUND: AgentLink endpoint ${path} not found. The API may have changed.`);
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
export const saveAgentLinkKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ api_key: z.string().min(10, "API key must be at least 10 characters") }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase.from("agent_integrations").upsert(
      {
        agent_id: userId,
        platform: "agentlink",
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
export const getAgentLinkKeyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data, error } = await supabase
      .from("agent_integrations")
      .select("api_key, last_synced_at, sync_status, last_error")
      .eq("agent_id", userId)
      .eq("platform", "agentlink")
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
export const removeAgentLinkKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await supabase
      .from("agent_integrations")
      .delete()
      .eq("agent_id", userId)
      .eq("platform", "agentlink");
    return { ok: true };
  });

// ─── Test Connection ──────────────────────────────────────────────────────────
export const testAgentLinkKey = createServerFn({ method: "POST" })
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
export const importFromAgentLink = createServerFn({ method: "POST" })
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
            note: `[Imported from AgentLink] ${body}`,
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
        .eq("platform", "agentlink");

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
        .eq("platform", "agentlink");
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

// ─── Submit Scrape Request ────────────────────────────────────────────────────
export const submitScrapeRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        agentlink_username: z.string().email("Must be a valid email"),
        agentlink_password: z.string().min(1),
        notes: z.string().optional(),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    const obfuscated = Buffer.from(data.agentlink_password).toString("base64");

    const { data: req, error } = await supabase
      .from("scrape_requests")
      .insert({
        requesting_agent_id: userId,
        agentlink_username: data.agentlink_username,
        agentlink_password_encrypted: obfuscated,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "manager"]);

    for (const admin of admins ?? []) {
      await supabase.from("notifications").insert({
        user_id: admin.user_id,
        type: "scrape_request",
        title: "New Full Import Request",
        body: "An agent has submitted a full AgentLink import request. Review in Admin → Import Requests.",
        link: "/admin/import-requests",
        read: false,
      });
    }

    return { request_id: req.id, ok: true };
  });
