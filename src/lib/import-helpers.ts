import { normalizePolicyStatus } from "@/lib/import-normalize";

/** Strip non-digits, return last 10 digits for comparison */
export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(-10);
}

export type RosterRow = {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  location?: string | null;
  status_label?: string | null;
  depth?: string | null;
  contracts_label?: string | null;
  joined_date?: string | null;
  last_active_label?: string | null;
};

/**
 * Put one roster member into `pending_agents`, or report why not.
 *
 * Somebody who already has an account is not pending anything, so an existing
 * profile with that email is a skip rather than a write — otherwise importing
 * a roster would create a shadow record beside a real agent and the team page
 * would list them twice.
 *
 * Shared between the admin multi-sheet import and Import, so the "already has
 * an account" rule has one definition rather than two that drift.
 */
export async function upsertPendingAgent(
  supabase: any,
  userId: string,
  uplineId: string,
  row: RosterRow,
  source = "import",
): Promise<{ status: "created" | "skipped"; reason?: string; pendingAgentId?: string | null }> {
  const email = (row.email ?? "").trim().toLowerCase();
  if (!email) return { status: "skipped", reason: "No email on this row" };

  const { data: existing } = await supabase
    .from("profiles").select("id").ilike("email", email).maybeSingle();
  if (existing) return { status: "skipped", reason: "Already has an Agent Cloud account" };

  const { data, error } = await supabase.from("pending_agents").upsert(
    {
      email,
      first_name: row.first_name ?? null,
      last_name: row.last_name ?? null,
      location: row.location ?? null,
      status_label: row.status_label ?? null,
      depth: row.depth ?? null,
      contracts_label: row.contracts_label ?? null,
      upline_id: uplineId,
      joined_date: row.joined_date ?? null,
      last_active_label: row.last_active_label ?? null,
      source,
      created_by: userId,
    },
    { onConflict: "email" },
  ).select("id").maybeSingle();
  if (error) throw new Error(error.message);

  await supabase.from("notifications").insert({
    user_id: userId,
    type: "missing_team_member",
    title: "Team member not on Agent Cloud",
    description: `${[row.first_name, row.last_name].filter(Boolean).join(" ") || email} (${email}) was on the roster you imported but has no account yet. Consider sending them an invite.`,
    read: false,
  });

  // The id comes back so an import batch can be rolled back. Returning only
  // a status meant an undo had nothing to delete for these rows and would have
  // reported success while leaving every imported agent in place.
  return { status: "created", pendingAgentId: (data as any)?.id ?? null };
}

/**
 * Find the carrier a policy names, or admit we could not.
 *
 * This used to match on the first word of the carrier name: "American
 * Amicable" was looked up as `%American%`. Against a catalogue holding
 * "American Home Life" and not "American Amicable", that is a single match —
 * so the policy was filed under the wrong carrier, silently, and every
 * commission calculated from it was wrong.
 *
 * Returning null is the right answer when we are not sure. An unresolved
 * carrier is a visible gap someone can fix; a confidently wrong one is not.
 */
export async function resolveCarrierId(
  supabase: any,
  carrierName: string | null | undefined,
): Promise<string | null> {
  const raw = (carrierName ?? "").trim();
  if (!raw) return null;

  // Exact, ignoring case. `ilike` without wildcards is an equality test.
  const { data: exact } = await supabase
    .from("carriers").select("id").ilike("name", raw).limit(2);
  if ((exact ?? []).length === 1) return exact[0].id;

  // The whole name as a substring — catches "GTL" inside "GTL (Guarantee
  // Trust Life)" — but only when it picks out exactly one carrier.
  const { data: partial } = await supabase
    .from("carriers").select("id").ilike("name", `%${raw}%`).limit(5);
  if ((partial ?? []).length === 1) return partial[0].id;

  return null;
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

/** Map Source stage strings to pipeline_stage enum */
export function mapStage(raw?: string): string {
  if (!raw) return "new";
  const r = raw.toLowerCase();
  if (r.includes("sold") || r.includes("active") || r.includes("issued")) return "sold";
  if (r.includes("callback") || r.includes("follow") || r.includes("pending")) return "callback";
  if (r.includes("close") || r.includes("almost") || r.includes("submitted")) return "almost_there";
  return "new";
}

/** Map Source temperature strings or numeric scores to temperature enum */
export function mapTemperature(raw?: string | number): string {
  if (raw === undefined || raw === null || raw === "") return "cold";
  const r = String(raw).toLowerCase();
  if (r === "hot" || Number(raw) >= 80) return "hot";
  if (r === "warm" || Number(raw) >= 50) return "warm";
  return "cold";
}

/**
 * Map a source policy status onto ours.
 *
 * Was four `includes` tests with everything else falling through to "active".
 * Two problems with that, both of which put a dead policy into somebody's
 * production numbers:
 *
 *   - `cancel` mapped to `lapsed`. A cancelled policy and a lapsed one are
 *     different outcomes with different retention work attached.
 *   - Single-letter statuses — `A`, `IF`, `L`, `NT` — matched none of the
 *     tests, so every one of them became "active". `NT` is *not taken*: the
 *     application never became a policy at all.
 *
 * Now goes through the dictionary in `import-normalize.ts`, which knows the
 * abbreviations carriers actually use.
 *
 * The residual: an unrecognised non-empty status still falls back to "active",
 * because `policies.status` needs a value and the enum has no "unknown"
 * member. That is a deliberately narrow default — the dictionary covers the
 * vocabularies seen in real exports, so reaching it means a genuinely novel
 * string. Callers that can surface the ambiguity should use
 * `normalizePolicyStatus` directly and handle the null themselves.
 */
export function mapPolicyStatus(raw?: string): string {
  if (!raw) return "active";
  return normalizePolicyStatus(raw) ?? "active";
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified record save: every import path funnels through this so health,
// banking, beneficiaries, policies (with carrier resolved), and notes all
// land in the right tables.
// ─────────────────────────────────────────────────────────────────────────────

export interface FullClientRecord {
  /** The stage exactly as the source spelled it — mapped, never trusted. */
  stage_raw?: string | null;
  /** The agent named on the row. Resolution happens before this is called. */
  agent_name?: string | null;
  assigned_to_email?: string | null;
  monthly_income?: number | null;
  employment?: string | null;
  pitch_carrier?: string | null;
  pitch_face_amount?: number | null;
  reminder_notes?: string | null;
  callback_date?: string | null;
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
    author?: string | null;
  }>;
}

/**
 * Is this policy number trustworthy enough to dedupe a whole policy on?
 *
 * Exports written by hand are full of placeholders: "000", "AHL", "RN",
 * "Trans", "12345" — a carrier abbreviation or a row of zeros standing in for a
 * number nobody had at the time. Treating those as identity means the second
 * client with "000" is read as the first client's policy and silently dropped;
 * one import lost 45 real policies (~$52k of annual premium) that way, all of
 * them different people who shared a placeholder.
 *
 * A number counts as real when it is at least six characters and contains a
 * digit, and is not a run of one repeated character or a keyboard sequence.
 * Anything weaker falls back to matching within the client.
 */
export function isRealPolicyNumber(raw?: string | null): boolean {
  const t = String(raw ?? "").trim();
  if (t.length < 6) return false;
  const compact = t.replace(/[^a-z0-9]/gi, "");
  if (compact.length < 6) return false;
  if (!/[0-9]/.test(compact)) return false;
  if (/^(.)\1+$/.test(compact)) return false; // 000000, aaaaaa
  if (/^0+$/.test(compact)) return false;
  if ("0123456789012345678901234567890".includes(compact) && /^[0-9]+$/.test(compact)) return false; // 12345678
  return true;
}

export async function saveClientFullRecord(
  supabase: any,
  agentId: string,
  c: FullClientRecord,
  opts?: {
    /**
     * A match already decided by the caller. Import passes this: it has run
     * the whole file through `import-match.ts` and, where the answer was
     * ambiguous, asked a human. Re-running `detectDuplicate` here would throw
     * that decision away and substitute a worse one — its name-only layer
     * reports a match at 50% confidence, and the merge below then folds two
     * different people who happen to share a name into a single client.
     *
     * `{ existing_client_id: null }` means "decided: this is new".
     */
    match?: { existing_client_id: string | null } | null;
    /**
     * Backdate the policy to its effective date and build the commission
     * schedule from there.
     *
     * An imported book is history. Stamping `production_date` with today would
     * put two years of business into this month — every past month reads zero
     * and the leaderboard is wrong — and skipping the commission build leaves
     * an imported policy earning nothing at all.
     */
    backdate?: boolean;
    buildCommissions?: boolean;
    /**
     * Policy numbers already on file anywhere in the agency, lowercased.
     *
     * The per-policy lookup below can only see what RLS lets this agent read,
     * which excludes their upline's rows — the exact rows an agent's own upload
     * would otherwise duplicate. This set is gathered once, with the agency's
     * view, before applying.
     */
    knownPolicyNumbers?: Set<string>;
  },
): Promise<{ clientId: string; isNew: boolean }> {
  const phone = c.phone ? normalizePhone(c.phone) : null;

  // ── Duplicate check ────────────────────────────────────────────────
  const dupMatch =
    opts?.match !== undefined
      ? opts.match?.existing_client_id
        ? { existing_client_id: opts.match.existing_client_id }
        : null
      : await detectDuplicate(supabase, agentId, {
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
      stage: c.stage ?? mapStage(c.stage_raw ?? undefined),
      assigned_to_email: c.assigned_to_email ?? null,
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

  // ── Financials ─────────────────────────────────────────────────────
  // Monthly income and employment are what an underwriter and a needs analysis
  // both ask for first, and `client_financials` is where the app already reads
  // them from — so they go there rather than into a note nobody queries.
  if (c.monthly_income != null || c.employment) {
    await supabase.from("client_financials").upsert({
      client_id: clientId,
      earned_income: c.monthly_income ?? null,
      employment_status: c.employment ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "client_id" });
  }

  /**
   * Pipeline intent has no column, so it becomes a note rather than vanishing.
   *
   * A callback date, a reminder and the carrier being pitched are the working
   * notes of an unsold lead. There is nowhere in the schema that holds them,
   * and dropping a "call back on the 4th" is the kind of silent loss that makes
   * somebody distrust the whole import — so they are written as one dated note.
   */
  /*
    Notes are content, not rows with keys, so re-uploading a book would stack a
    second identical copy of every note onto the timeline. Existing text is read
    once and used to skip repeats.
  */
  const existingNotes = new Set<string>();
  if (!isNew) {
    const { data: priorNotes } = await supabase
      .from("contact_history")
      .select("note")
      .eq("client_id", clientId)
      .limit(500);
    for (const n of priorNotes ?? []) {
      const t = String(n?.note ?? "").trim().toLowerCase();
      if (t) existingNotes.add(t);
    }
  }
  const alreadyNoted = (text: string) => existingNotes.has(text.trim().toLowerCase());

  const intent = [
    c.callback_date ? `Callback: ${c.callback_date}` : null,
    c.pitch_carrier ? `Pitching: ${c.pitch_carrier}` : null,
    c.pitch_face_amount ? `Face amount discussed: $${Number(c.pitch_face_amount).toLocaleString()}` : null,
    c.reminder_notes ? c.reminder_notes : null,
  ].filter(Boolean).join(" · ");
  if (intent && !alreadyNoted(intent)) {
    await supabase.from("contact_history").insert({
      client_id: clientId,
      agent_id: agentId,
      assigned_to_email: c.assigned_to_email ?? null,
      contact_type: "imported_note",
      note: intent,
      created_at: new Date().toISOString(),
    });
    existingNotes.add(intent.trim().toLowerCase());
  }

  // ── Policies ───────────────────────────────────────────────────────
  for (const pol of c.policies ?? []) {
    if (!pol.policy_number && !pol.carrier_name && !pol.monthly_premium) continue;

    if (pol.policy_number && isRealPolicyNumber(pol.policy_number)) {
      // Agency-wide first: a policy the upline imported is the one most likely
      // to arrive again in the agent's own export, and re-inserting it doubles
      // the production it counts toward.
      if (opts?.knownPolicyNumbers?.has(pol.policy_number.trim().toLowerCase())) continue;
      const { data: existingPol } = await supabase
        .from("policies")
        .select("id")
        .eq("policy_number", pol.policy_number)
        .limit(1)
        .maybeSingle();
      if (existingPol) continue;
    } else {
      // Placeholder or missing number: identity is the client, the carrier and
      // the premium. Scoped to this client, so two people sharing "000" are two
      // policies rather than one.
      const monthlyGuess = Number(pol.monthly_premium ?? 0) || 0;
      const { data: sameClient } = await supabase
        .from("policies")
        .select("id, monthly_premium, effective_date, carrier_id")
        .eq("client_id", clientId)
        .limit(50);
      const dupe = (sameClient ?? []).some((p: any) =>
        (monthlyGuess > 0 && Math.abs(Number(p.monthly_premium ?? 0) - monthlyGuess) < 0.5) &&
        (!pol.effective_date || !p.effective_date || String(p.effective_date) === String(pol.effective_date)),
      );
      if (dupe) continue;
    }

    /**
     * `policies_agent_policy_number_uniq` is a unique index on
     * (agent_id, policy_number). A placeholder like "000" appearing on thirty
     * clients therefore inserts once and every later insert fails — silently,
     * because the insert result was never checked. The placeholder is worth
     * less than the policy, so it is dropped when it would collide.
     */
    let policyNumber = pol.policy_number?.trim() || null;
    if (policyNumber) {
      const { data: taken } = await supabase
        .from("policies")
        .select("id")
        .eq("agent_id", agentId)
        .eq("policy_number", policyNumber)
        .limit(1)
        .maybeSingle();
      if (taken) policyNumber = null;
    }

    const carrierId = await resolveCarrierId(supabase, pol.carrier_name);

    const monthly = Number(pol.monthly_premium ?? 0) || 0;
    const annual =
      Number(pol.annual_premium ?? 0) ||
      (monthly > 0 ? monthly * 12 : 0);

    const now = new Date().toISOString();
    // History counts in the month it was written. `production_date` is what the
    // dashboard and the leaderboard window on, so an imported policy anchors
    // there rather than on the day of the upload.
    const productionDate = opts?.backdate && pol.effective_date
      ? new Date(`${pol.effective_date}T12:00:00Z`).toISOString()
      : now;

    const { data: insertedPol, error: polError } = await supabase.from("policies").insert({
      client_id: clientId,
      agent_id: agentId,
      assigned_to_email: c.assigned_to_email ?? null,
      carrier_id: carrierId,
      product: pol.product ?? "Final Expense",
      policy_number: policyNumber,
      monthly_premium: monthly || null,
      annual_premium: annual || null,
      face_amount: Number(pol.face_amount ?? 0) || null,
      effective_date: pol.effective_date ?? null,
      status: mapPolicyStatus(pol.status ?? undefined),
      // Book of Business sorts and dates on `posted_at`, so a backdated import
      // has to stamp it with the effective date too — otherwise the book showed
      // a year of history as posted the day of the upload.
      posted_at: productionDate,
      production_date: productionDate,
    }).select("id").maybeSingle();
    // Never silent: a dropped policy is production the agency cannot see.
    if (polError) console.error("Import: policy insert failed", policyNumber, polError.message);

    /**
     * An imported policy with no commission schedule is a policy that earns
     * nothing on the Finances page, which is indistinguishable from a bug.
     *
     * Built on the effective date, not today, so advances and renewals fall in
     * the months they were actually due. Wrapped because the commonest reason
     * this fails is a missing comp grid for the product — a real gap, surfaced
     * elsewhere as a setup issue, and never a reason to fail the import of the
     * policy itself.
     */
    if (opts?.buildCommissions && insertedPol?.id && carrierId && pol.effective_date && monthly > 0) {
      try {
        const { calculateAndInsertAllCommissions } = await import("@/lib/commission-calculator");
        await calculateAndInsertAllCommissions(supabase, {
          policyId: insertedPol.id,
          agentId,
          carrierId,
          product: pol.product ?? "Final Expense",
          monthlyPremium: monthly,
           annualPremium: annual || null,
          effectiveDate: pol.effective_date,
          clientName: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
        });
      } catch (e) {
        console.error("Import: commission build failed for policy", insertedPol.id, e);
      }
    }
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
    const text = note.author ? `${note.content.trim()} — ${note.author}` : note.content.trim();
    if (alreadyNoted(text)) continue;
    await supabase.from("contact_history").insert({
      client_id: clientId,
      agent_id: agentId,
      assigned_to_email: c.assigned_to_email ?? null,
      contact_type: isMedical ? "medical_note" : "imported_note",
      note: text,
      created_at: note.created_at
        ? new Date(`${note.created_at}T12:00:00Z`).toISOString()
        : new Date().toISOString(),
    });
    existingNotes.add(text.trim().toLowerCase());
  }

  return { clientId, isNew };
}


/**
 * The agent named on a row → an account, a roster email, or nothing.
 *
 * Resolved once per chunk rather than per row: a book of business names the
 * same dozen agents five hundred times, and a query per row is a query too
 * many. Matching is on the full name as written, because that is all these
 * exports carry — an email would be better and is used when the roster sheet
 * supplies one for that name.
 *
 * Ambiguity is not resolved. Two teammates called "Chris Taylor" return
 * nothing, so the row stays with the uploader instead of being filed under a
 * coin toss.
 */
export async function resolveAgentOwners(
  supabase: any,
  userId: string,
  rows: Record<string, any>[],
): Promise<Map<string, { agentId: string | null; email: string | null }>> {
  const out = new Map<string, { agentId: string | null; email: string | null }>();

  const names = new Set<string>();
  for (const r of rows) {
    const n = String(r?.agent_name ?? "").trim().toLowerCase();
    if (n) names.add(n);
  }
  if (!names.size) return out;

  const { data: me } = await supabase
    .from("profiles").select("organization_id").eq("id", userId).maybeSingle();
  const orgId = me?.organization_id ?? null;

  let q = supabase.from("profiles").select("id, first_name, last_name, email");
  if (orgId) q = q.eq("organization_id", orgId);
  const { data: profiles } = await q.limit(2000);

  const counts = new Map<string, number>();
  const firstHit = new Map<string, { agentId: string; email: string | null }>();
  for (const p of profiles ?? []) {
    const key = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim().toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!firstHit.has(key)) firstHit.set(key, { agentId: p.id, email: p.email ?? null });
  }

  for (const n of names) {
    const hit = firstHit.get(n);
    if (hit && counts.get(n) === 1) out.set(n, { agentId: hit.agentId, email: hit.email });
  }

  // Anyone still unresolved may be on the roster — imported from the same
  // workbook, most likely — in which case the email is what carries ownership
  // forward until they have an account.
  const unresolved = [...names].filter((n) => !out.has(n));
  if (unresolved.length) {
    const { data: pending } = await supabase
      .from("pending_agents").select("email, first_name, last_name").limit(2000);
    for (const p of pending ?? []) {
      const key = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim().toLowerCase();
      if (key && unresolved.includes(key) && !out.has(key)) {
        out.set(key, { agentId: null, email: p.email ?? null });
      }
    }
  }

  return out;
}
