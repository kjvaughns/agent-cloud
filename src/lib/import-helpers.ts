/** Strip non-digits, return last 10 digits for comparison */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(-10);
}

/** 3-layer duplicate detection against an agent's existing clients */
export async function detectDuplicate(
  supabase: any,
  agentId: string,
  incoming: { phone?: string; first_name?: string; last_name?: string; dob?: string }
): Promise<{ type: string; confidence: number; existing_client_id: string } | null> {
  // Layer 1: phone match (95% confidence)
  if (incoming.phone) {
    const normalized = normalizePhone(incoming.phone);
    if (normalized.length >= 7) {
      const { data: phoneMatches } = await supabase
        .from("clients")
        .select("id, phone")
        .eq("agent_id", agentId)
        .ilike("phone", `%${normalized.slice(-7)}%`)
        .limit(5);

      for (const m of phoneMatches ?? []) {
        if (normalizePhone(m.phone ?? "").slice(-7) === normalized.slice(-7)) {
          return { type: "phone", confidence: 95, existing_client_id: m.id };
        }
      }
    }
  }

  // Layer 2: name + DOB match (85% confidence)
  if (incoming.first_name && incoming.last_name && incoming.dob) {
    const { data: nameDobMatches } = await supabase
      .from("clients")
      .select("id")
      .eq("agent_id", agentId)
      .ilike("first_name", incoming.first_name.trim())
      .ilike("last_name", incoming.last_name.trim())
      .eq("date_of_birth", incoming.dob)
      .limit(2);

    if ((nameDobMatches ?? []).length > 0) {
      return { type: "name_dob", confidence: 85, existing_client_id: nameDobMatches![0].id };
    }
  }

  // Layer 3: name only (50% confidence, flag for manual review)
  if (incoming.first_name && incoming.last_name) {
    const { data: nameMatches } = await supabase
      .from("clients")
      .select("id")
      .eq("agent_id", agentId)
      .ilike("first_name", incoming.first_name.trim())
      .ilike("last_name", incoming.last_name.trim())
      .limit(2);

    if ((nameMatches ?? []).length > 0) {
      return { type: "name_only", confidence: 50, existing_client_id: nameMatches![0].id };
    }
  }

  return null;
}

/**
 * Team-scoped duplicate detection: matches against rows owned by the upline
 * OR pre-assigned (via assigned_to_email) to ANY known team email.
 */
export async function detectTeamDuplicate(
  supabase: any,
  uplineId: string,
  teamEmails: string[],
  incoming: { phone?: string; first_name?: string; last_name?: string; dob?: string }
): Promise<{ type: string; confidence: number; existing_client_id: string } | null> {
  const emails = (teamEmails ?? []).filter(Boolean).map((e) => e.toLowerCase());
  const ownerFilter = emails.length
    ? `agent_id.eq.${uplineId},assigned_to_email.in.(${emails.map((e) => `"${e}"`).join(",")})`
    : `agent_id.eq.${uplineId}`;

  // Phone (last-7 digits)
  if (incoming.phone) {
    const norm = normalizePhone(incoming.phone);
    if (norm.length >= 7) {
      const last7 = norm.slice(-7);
      const { data } = await supabase
        .from("clients")
        .select("id, phone")
        .or(ownerFilter)
        .ilike("phone", `%${last7}%`)
        .limit(20);
      for (const m of data ?? []) {
        if (normalizePhone(m.phone ?? "").slice(-7) === last7) {
          return { type: "phone", confidence: 95, existing_client_id: m.id };
        }
      }
    }
  }

  // Name + DOB
  if (incoming.first_name && incoming.last_name && incoming.dob) {
    const { data } = await supabase
      .from("clients")
      .select("id")
      .or(ownerFilter)
      .ilike("first_name", incoming.first_name.trim())
      .ilike("last_name", incoming.last_name.trim())
      .eq("date_of_birth", incoming.dob)
      .limit(2);
    if ((data ?? []).length > 0) {
      return { type: "name_dob", confidence: 85, existing_client_id: data![0].id };
    }
  }

  // Name only
  if (incoming.first_name && incoming.last_name) {
    const { data } = await supabase
      .from("clients")
      .select("id")
      .or(ownerFilter)
      .ilike("first_name", incoming.first_name.trim())
      .ilike("last_name", incoming.last_name.trim())
      .limit(2);
    if ((data ?? []).length > 0) {
      return { type: "name_only", confidence: 50, existing_client_id: data![0].id };
    }
  }

  return null;
}

/** Returns existing policy id if policy number already exists for this agent */
export async function detectDuplicatePolicy(
  supabase: any,
  agentId: string,
  policyNumber: string
): Promise<string | null> {
  if (!policyNumber?.trim()) return null;
  const { data } = await supabase
    .from("policies")
    .select("id")
    .eq("agent_id", agentId)
    .eq("policy_number", policyNumber.trim())
    .maybeSingle();
  return data?.id ?? null;
}

/** Map AgentLink/generic stage strings to pipeline_stage enum */
export function mapStage(raw?: string): string {
  if (!raw) return "new";
  const r = raw.toLowerCase();
  if (r.includes("sold") || r.includes("active") || r.includes("issued")) return "sold";
  if (r.includes("callback") || r.includes("follow") || r.includes("pending")) return "callback";
  if (r.includes("close") || r.includes("almost") || r.includes("submitted")) return "almost_there";
  return "new";
}

/** Map AgentLink temperature strings or numeric scores to temperature enum */
export function mapTemperature(raw?: string | number): string {
  if (raw === undefined || raw === null || raw === "") return "cold";
  const r = String(raw).toLowerCase();
  if (r === "hot" || Number(raw) >= 80) return "hot";
  if (r === "warm" || Number(raw) >= 50) return "warm";
  return "cold";
}

/** Map AgentLink policy status strings to internal policy status values */
export function mapPolicyStatus(raw?: string): string {
  if (!raw) return "active";
  const r = raw.toLowerCase();
  if (r.includes("lapse") || r.includes("cancel")) return "lapsed";
  if (r.includes("review") || r.includes("pending")) return "in_review";
  if (r.includes("issued") || r.includes("not paid")) return "issued_not_paid";
  return "active";
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified record save: every import path funnels through this so health,
// banking, beneficiaries, policies (with carrier resolved), and notes all
// land in the right tables.
// ─────────────────────────────────────────────────────────────────────────────

export interface FullClientRecord {
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  born_country_state?: string | null;
  stage?: string;
  temperature?: string;
  ssn_last4?: string | null;
  tobacco_use?: boolean | null;
  height_ft?: number | null;
  height_in?: number | null;
  weight_lbs?: number | null;
  primary_physician?: string | null;
  primary_physician_phone?: string | null;
  conditions?: string | null;
  medications?: string | null;
  medical_notes?: string | null;
  bank_name?: string | null;
  routing_number?: string | null;
  account_number?: string | null;
  account_type?: string | null;
  draft_date?: number | null;
  payment_method?: string | null;
  policies?: Array<{
    carrier_name?: string | null;
    product?: string | null;
    policy_number?: string | null;
    monthly_premium?: number | null;
    annual_premium?: number | null;
    face_amount?: number | null;
    effective_date?: string | null;
    status?: string | null;
  }>;
  beneficiaries?: Array<{
    first_name: string;
    last_name?: string | null;
    relationship?: string | null;
    dob?: string | null;
    phone?: string | null;
    percentage?: number | null;
  }>;
  notes?: Array<{
    content: string;
    created_at?: string | null;
    note_type?: string | null;
  }>;
}

export async function saveClientFullRecord(
  supabase: any,
  agentId: string,
  c: FullClientRecord
): Promise<{ clientId: string; isNew: boolean }> {
  const phone = c.phone ? normalizePhone(c.phone) : null;

  // ── Duplicate check ────────────────────────────────────────────────
  const dupMatch = await detectDuplicate(supabase, agentId, {
    phone: phone ?? undefined,
    first_name: c.first_name,
    last_name: c.last_name,
    dob: c.date_of_birth ?? undefined,
  });

  let clientId: string;
  let isNew = false;

  if (dupMatch) {
    clientId = dupMatch.existing_client_id;
    // Merge only missing fields
    const { data: existing } = await supabase
      .from("clients")
      .select("email,date_of_birth,street_address,city,state,zip_code,born_country_state,ssn_last4")
      .eq("id", clientId)
      .maybeSingle();
    const patch: any = {};
    if (existing) {
      if (c.email && !existing.email) patch.email = c.email;
      if (c.date_of_birth && !existing.date_of_birth) patch.date_of_birth = c.date_of_birth;
      if (c.street_address && !existing.street_address) patch.street_address = c.street_address;
      if (c.city && !existing.city) patch.city = c.city;
      if (c.state && !existing.state) patch.state = c.state;
      if (c.zip_code && !existing.zip_code) patch.zip_code = c.zip_code;
      if (c.born_country_state && !existing.born_country_state) patch.born_country_state = c.born_country_state;
      if (c.ssn_last4 && !existing.ssn_last4) patch.ssn_last4 = c.ssn_last4;
    }
    if (Object.keys(patch).length > 0) {
      await supabase.from("clients").update(patch).eq("id", clientId);
    }
  } else {
    const insertRow: any = {
      agent_id: agentId,
      first_name: c.first_name || "Unknown",
      last_name: c.last_name || "Unknown",
      phone: phone || null,
      email: c.email || null,
      date_of_birth: c.date_of_birth || null,
      street_address: c.street_address || null,
      city: c.city || null,
      state: c.state || null,
      zip_code: c.zip_code || null,
      born_country_state: c.born_country_state || null,
      ssn_last4: c.ssn_last4 || null,
      stage: c.stage ?? "new",
      temperature: c.temperature ?? "cold",
    };
    const { data: newClient, error } = await supabase
      .from("clients")
      .insert(insertRow)
      .select("id")
      .single();
    if (error) throw new Error(`Client insert failed: ${error.message}`);
    clientId = newClient.id;
    isNew = true;
  }

  // ── Health ─────────────────────────────────────────────────────────
  const hasHealth =
    c.height_ft != null || c.height_in != null || c.weight_lbs != null ||
    c.tobacco_use != null || c.primary_physician || c.primary_physician_phone ||
    c.conditions || c.medications || c.medical_notes;
  if (hasHealth) {
    await supabase.from("client_health").upsert({
      client_id: clientId,
      height_ft: c.height_ft ?? null,
      height_in: c.height_in ?? null,
      weight_lbs: c.weight_lbs ?? null,
      tobacco_use: c.tobacco_use ?? null,
      primary_physician: c.primary_physician ?? null,
      primary_physician_phone: c.primary_physician_phone ?? null,
      conditions: c.conditions ?? null,
      medications: c.medications ?? null,
      medical_notes: c.medical_notes ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id" });
  }

  // ── Banking ────────────────────────────────────────────────────────
  const hasBanking = c.bank_name || c.routing_number || c.account_number || c.account_type;
  if (hasBanking) {
    const maskedAccount = c.account_number
      ? `****${c.account_number.slice(-4)}`
      : null;
    await supabase.from("client_banking").upsert({
      client_id: clientId,
      bank_name: c.bank_name ?? null,
      routing_number: c.routing_number ?? null,
      account_number_masked: maskedAccount,
      account_type: c.account_type ?? null,
      draft_date: c.draft_date ?? null,
      payment_method: c.payment_method ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id" });
  }

  // ── Policies ───────────────────────────────────────────────────────
  for (const pol of c.policies ?? []) {
    if (!pol.policy_number && !pol.carrier_name && !pol.monthly_premium) continue;

    if (pol.policy_number) {
      const { data: existingPol } = await supabase
        .from("policies")
        .select("id")
        .eq("agent_id", agentId)
        .eq("policy_number", pol.policy_number)
        .maybeSingle();
      if (existingPol) continue;
    }

    let carrierId: string | null = null;
    if (pol.carrier_name) {
      const firstWord = pol.carrier_name.trim().split(/\s+/)[0];
      if (firstWord) {
        const { data: carrier } = await supabase
          .from("carriers")
          .select("id")
          .ilike("name", `%${firstWord}%`)
          .maybeSingle();
        carrierId = carrier?.id ?? null;
      }
    }

    const monthly = Number(pol.monthly_premium ?? 0) || 0;
    const annual =
      Number(pol.annual_premium ?? 0) ||
      (monthly > 0 ? monthly * 12 : 0);

    await supabase.from("policies").insert({
      client_id: clientId,
      agent_id: agentId,
      carrier_id: carrierId,
      product: pol.product ?? "Final Expense",
      policy_number: pol.policy_number ?? null,
      monthly_premium: monthly || null,
      annual_premium: annual || null,
      face_amount: Number(pol.face_amount ?? 0) || null,
      effective_date: pol.effective_date ?? null,
      status: pol.status ?? "active",
      posted_at: new Date().toISOString(),
    });
  }

  // ── Beneficiaries (insert if not already present by name) ─────────
  for (const b of c.beneficiaries ?? []) {
    if (!b.first_name?.trim()) continue;
    const { data: existing } = await supabase
      .from("beneficiaries")
      .select("id")
      .eq("client_id", clientId)
      .ilike("first_name", b.first_name.trim())
      .ilike("last_name", b.last_name?.trim() ?? "")
      .maybeSingle();
    if (existing) continue;
    await supabase.from("beneficiaries").insert({
      client_id: clientId,
      first_name: b.first_name.trim(),
      last_name: b.last_name ?? null,
      relationship: b.relationship ?? null,
      dob: b.dob ?? null,
      phone: b.phone ?? null,
      percentage: b.percentage ?? 0,
    });
  }

  // ── Notes ──────────────────────────────────────────────────────────
  for (const note of c.notes ?? []) {
    if (!note.content?.trim()) continue;
    const isMedical =
      (note.note_type ?? "").toLowerCase().includes("medical") ||
      (note.note_type ?? "").toLowerCase().includes("health");
    await supabase.from("contact_history").insert({
      client_id: clientId,
      agent_id: agentId,
      contact_type: isMedical ? "medical_note" : "imported_note",
      note: note.content.trim(),
      created_at: note.created_at ?? new Date().toISOString(),
    });
  }

  return { clientId, isNew };
}

