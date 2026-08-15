/**
 * Duplicate detection for bulk imports.
 *
 * `detectDuplicate` in `import-helpers.ts` issues up to three queries per
 * incoming record. That is fine for the one-off callers it was written for and
 * impossible for a book of business: five thousand clients is fifteen thousand
 * round trips, one of which — `ilike("phone", "%" + last7 + "%")` — cannot use
 * an index and scans the table every time.
 *
 * So this module inverts the loop. Load the agent's existing book **once** into
 * memory, then match in JavaScript. The same five thousand rows become three
 * queries against about a megabyte of data. That single decision is what makes
 * importing a real book tractable at all.
 *
 * It also draws the line the review screen depends on:
 *
 *   **exact**  — something a unique index would have caught anyway, or a match
 *                on a strong identifier. Skipped automatically and counted, not
 *                shown. Nobody wants to click through 600 of these.
 *   **fuzzy**  — genuinely ambiguous. Shown side by side, or sent to the model
 *                with the uploader's own description of the file for context.
 *   **new**    — no match. Created.
 *
 * Last-7-digit phone comparison is gone. The old code matched on the last seven
 * digits, which collides across area codes — two different people in two
 * different cities read as the same person. There are ten digits available.
 */

/** Strip to the last ten digits. Empty string when there aren't enough. */
export function normalizePhone10(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

/**
 * Lowercase, trim, drop a `+tag`, and drop dots in a Gmail local part — all
 * three address the same mailbox, and a book exported from two systems will
 * spell it both ways.
 */
export function normalizeEmail(raw: string | null | undefined): string {
  const e = (raw ?? "").trim().toLowerCase();
  if (!e.includes("@")) return "";
  const [localRaw, domain] = e.split("@");
  const local = localRaw.split("+")[0];
  const isGmail = domain === "gmail.com" || domain === "googlemail.com";
  return `${isGmail ? local.replace(/\./g, "") : local}@${domain}`;
}

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normName(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type ExistingClient = {
  id: string;
  agent_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
};

export type ExistingPolicy = {
  id: string;
  agent_id: string;
  client_id: string | null;
  policy_number: string | null;
  assigned_to_email: string | null;
};

export type MatchIndex = {
  byPhone: Map<string, ExistingClient>;
  byEmail: Map<string, ExistingClient>;
  byNameDob: Map<string, ExistingClient>;
  byName: Map<string, ExistingClient[]>;
  policyNumbers: Set<string>;
  /**
   * Policy number → the policy already on file, whoever owns it.
   *
   * `policyNumbers` is keyed by agent, which is right for "have *I* already
   * imported this" and wrong for the case that actually double-counts
   * production: the agency imported the book, the agent then uploads their own
   * copy of it, and the same policy number arrives under a different agent id.
   */
  policyOwners: Map<string, ExistingPolicy>;
  size: number;
};

const PAGE = 1000;

/**
 * Load everything we need to match against, once.
 *
 * Paginated because PostgREST caps a response and a large book would otherwise
 * come back silently short — which would read as "no duplicates found" and be
 * the worst possible failure for this feature.
 */
export async function buildMatchIndex(
  supabase: any,
  agentIds: string[],
): Promise<MatchIndex> {
  const index: MatchIndex = {
    byPhone: new Map(),
    byEmail: new Map(),
    byNameDob: new Map(),
    byName: new Map(),
    policyNumbers: new Set(),
    policyOwners: new Map(),
    size: 0,
  };
  if (!agentIds.length) return index;

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, agent_id, first_name, last_name, phone, email, date_of_birth")
      .in("agent_id", agentIds)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ExistingClient[];

    for (const c of rows) {
      index.size++;
      const phone = normalizePhone10(c.phone);
      if (phone && !index.byPhone.has(phone)) index.byPhone.set(phone, c);

      const email = normalizeEmail(c.email);
      if (email && !index.byEmail.has(email)) index.byEmail.set(email, c);

      const nameKey = `${normName(c.first_name)}|${normName(c.last_name)}`;
      if (nameKey !== "|") {
        if (c.date_of_birth) {
          const k = `${nameKey}|${c.date_of_birth}`;
          if (!index.byNameDob.has(k)) index.byNameDob.set(k, c);
        }
        const bucket = index.byName.get(nameKey);
        if (bucket) bucket.push(c);
        else index.byName.set(nameKey, [c]);
      }
    }

    if (rows.length < PAGE) break;
  }

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("policies")
      .select("agent_id, policy_number")
      .in("agent_id", agentIds)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { agent_id: string; policy_number: string | null }[];
    for (const p of rows) {
      // Keyed by agent as well as number. `admin-import.functions.ts` checks
      // policy numbers globally, so one agency's numbering can suppress
      // another's imports entirely.
      if (p.policy_number) index.policyNumbers.add(`${p.agent_id}|${p.policy_number.trim()}`);
    }
    if (rows.length < PAGE) break;
  }

  return index;
}

export type IncomingClient = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
};

export type MatchVerdict = {
  verdict: "new" | "exact" | "fuzzy";
  matchId: string | null;
  /** Everything plausible, for the side-by-side when a human has to choose. */
  candidateIds: string[];
  reason: string | null;
  confidence: number;
};

/**
 * Decide what an incoming record is, against the index.
 *
 * The ladder is ordered by how much a match would have to be a coincidence.
 * Phone and email are identifiers people do not share; a name and a birthday
 * together is effectively one too. Below that we are guessing, and guessing is
 * what the review screen is for.
 */
export function classifyClient(index: MatchIndex, incoming: IncomingClient): MatchVerdict {
  const phone = normalizePhone10(incoming.phone);
  if (phone) {
    const hit = index.byPhone.get(phone);
    if (hit) {
      return { verdict: "exact", matchId: hit.id, candidateIds: [hit.id], reason: "phone", confidence: 0.99 };
    }
  }

  const email = normalizeEmail(incoming.email);
  if (email) {
    const hit = index.byEmail.get(email);
    if (hit) {
      return { verdict: "exact", matchId: hit.id, candidateIds: [hit.id], reason: "email", confidence: 0.97 };
    }
  }

  const first = normName(incoming.first_name);
  const last = normName(incoming.last_name);
  const nameKey = `${first}|${last}`;
  const hasName = first !== "" || last !== "";

  if (hasName && incoming.date_of_birth) {
    const hit = index.byNameDob.get(`${nameKey}|${incoming.date_of_birth}`);
    if (hit) {
      return {
        verdict: "exact",
        matchId: hit.id,
        candidateIds: [hit.id],
        reason: "name and date of birth",
        confidence: 0.95,
      };
    }
  }

  if (hasName) {
    const bucket = index.byName.get(nameKey) ?? [];
    if (bucket.length) {
      // Same name, and nothing strong enough to confirm or deny it. This is the
      // case the old code called a match at 50% confidence and quietly merged —
      // which is how two different John Smiths become one client.
      return {
        verdict: "fuzzy",
        matchId: bucket.length === 1 ? bucket[0].id : null,
        candidateIds: bucket.map((c) => c.id),
        reason:
          bucket.length === 1
            ? "same name, but no phone, email or date of birth to confirm it"
            : `${bucket.length} existing clients share this name`,
        confidence: 0.5,
      };
    }

    // Same surname and birthday, different first name — a spouse, a junior, or
    // a typo, and worth a human's eye rather than a second record.
    if (incoming.date_of_birth) {
      for (const [key, hit] of index.byNameDob) {
        const [, hitLast, hitDob] = key.split("|");
        if (hitLast && hitLast === last && hitDob === incoming.date_of_birth) {
          return {
            verdict: "fuzzy",
            matchId: hit.id,
            candidateIds: [hit.id],
            reason: "same surname and date of birth, different first name",
            confidence: 0.6,
          };
        }
      }
    }
  }

  return { verdict: "new", matchId: null, candidateIds: [], reason: null, confidence: 0 };
}

/** A policy already on file for this agent is never worth a second row. */
export function policyExists(index: MatchIndex, agentId: string, policyNumber: string | null | undefined): boolean {
  const n = (policyNumber ?? "").trim();
  return n !== "" && index.policyNumbers.has(`${agentId}|${n}`);
}

/**
 * The key that decides whether two rows *in the same file* are the same thing.
 *
 * A carrier report listing a policy on two pages, or a spreadsheet with a
 * repeated header block, would otherwise import twice — and no amount of
 * checking against the database catches it, because neither row is there yet.
 * `contracting-import.functions.ts` and `carrier-sync.functions.ts` each grew
 * their own version of this; this is the shared one.
 */
export function rowKey(kind: string, record: Record<string, any>): string {
  switch (kind) {
    case "clients": {
      const phone = normalizePhone10(record.phone);
      if (phone) return `phone:${phone}`;
      const email = normalizeEmail(record.email);
      if (email) return `email:${email}`;
      return `name:${normName(record.first_name)}|${normName(record.last_name)}|${record.date_of_birth ?? ""}`;
    }
    case "policies":
      return `policy:${(record.policy_number ?? "").trim().toLowerCase()}`;
    case "commission_grids":
      return [
        "grid",
        (record.carrier_name ?? record.carrier_id ?? "").toString().toLowerCase(),
        (record.product_name ?? "").toString().toLowerCase(),
        (record.level_name ?? "").toString().toLowerCase(),
        record.age_group_min ?? "",
      ].join("|");
    case "writing_numbers":
      return `wn:${(record.carrier_name ?? "").toLowerCase()}|${(record.writing_number ?? "").toLowerCase()}`;
    case "state_licenses":
      return `lic:${(record.state_code ?? "").toLowerCase()}|${(record.loa ?? "").toLowerCase()}|${(record.agent_email ?? "").toLowerCase()}`;
    case "pending_agents":
      return `agent:${normalizeEmail(record.email) || normName(record.first_name) + "|" + normName(record.last_name)}`;
    default:
      return JSON.stringify(record);
  }
}


/** Already on file for somebody — whoever that is. */
export function policyOnFile(index: MatchIndex, policyNumber: string | null | undefined): boolean {
  const n = (policyNumber ?? "").trim().toLowerCase();
  return n !== "" && index.policyOwners.has(n);
}

/** Add one existing client to every lookup it belongs in. */
function addClient(index: MatchIndex, c: ExistingClient): void {
  const phone = normalizePhone10(c.phone);
  if (phone && !index.byPhone.has(phone)) index.byPhone.set(phone, c);

  const email = normalizeEmail(c.email);
  if (email && !index.byEmail.has(email)) index.byEmail.set(email, c);

  const nameKey = `${normName(c.first_name)}|${normName(c.last_name)}`;
  if (nameKey === "|") return;
  if (c.date_of_birth) {
    const k = `${nameKey}|${c.date_of_birth}`;
    if (!index.byNameDob.has(k)) index.byNameDob.set(k, c);
  }
  const bucket = index.byName.get(nameKey);
  if (bucket) {
    if (!bucket.some((b) => b.id === c.id)) bucket.push(c);
  } else {
    index.byName.set(nameKey, [c]);
  }
}

/**
 * Widen the index to the whole agency, one key at a time.
 *
 * The case this exists for: an agency imports its book, its agents get
 * accounts, and one of them uploads their own export of the same business. All
 * of it is already in the system — under the agency's ids, which the agent
 * cannot read — so matching against the uploader's own rows alone found
 * nothing and created every client and every policy a second time. That is the
 * double production this feature is meant to prevent.
 *
 * It asks the database only about the keys already present in the file: the
 * phones, emails, names and policy numbers the uploader is holding in their
 * hand. Nothing else about a teammate's book comes back, so this does not
 * become a way to read it.
 */
export async function mergeAgencyMatches(
  supabase: any,
  index: MatchIndex,
  rows: Record<string, any>[],
): Promise<{ clients: number; policies: number }> {
  const phones = new Set<string>();
  const emails = new Set<string>();
  const nameDobs = new Set<string>();
  const names = new Set<string>();
  const policyNumbers = new Set<string>();

  const plain = (v: any) => String(v ?? "").trim().toLowerCase();

  for (const r of rows) {
    const p = normalizePhone10(r.phone);
    if (p) phones.add(p);
    const e = plain(r.email);
    if (e.includes("@")) emails.add(e);
    const f = plain(r.first_name);
    const l = plain(r.last_name);
    if (f || l) {
      names.add(`${f}|${l}`);
      if (r.date_of_birth) nameDobs.add(`${f}|${l}|${r.date_of_birth}`);
    }
    for (const pol of r.policies ?? []) {
      const n = plain(pol?.policy_number);
      if (n) policyNumbers.add(n);
    }
  }

  if (!phones.size && !emails.size && !names.size && !policyNumbers.size) {
    return { clients: 0, policies: 0 };
  }

  const { data, error } = await supabase.rpc("import_duplicate_scan", {
    _phones: [...phones],
    _emails: [...emails],
    _name_dobs: [...nameDobs],
    _names: [...names],
    _policy_numbers: [...policyNumbers],
  });
  // A scan failure must not silently turn into "no duplicates found" — that is
  // the outcome this whole module exists to avoid — so it is loud.
  if (error) throw new Error(`Duplicate scan failed: ${error.message}`);

  const found = (data ?? {}) as { clients?: ExistingClient[]; policies?: ExistingPolicy[] };

  for (const c of found.clients ?? []) {
    index.size++;
    addClient(index, c);
  }
  for (const pol of found.policies ?? []) {
    const n = (pol.policy_number ?? "").trim().toLowerCase();
    if (n && !index.policyOwners.has(n)) index.policyOwners.set(n, pol);
  }

  return { clients: (found.clients ?? []).length, policies: (found.policies ?? []).length };
}
