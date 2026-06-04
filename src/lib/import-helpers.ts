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
