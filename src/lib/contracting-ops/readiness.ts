import type { ReadinessState } from "./types";
import { FIELD_REQUIREMENTS, DOCUMENT_REQUIREMENTS } from "./types";

/**
 * Contracting readiness engine.
 *
 * Deliberately a pure function over plain data: no Supabase client, no server
 * function wrapper, no I/O. Everything it needs is passed in. That makes it
 * testable without a database and — more importantly — makes it the single
 * place the rules live, so the packet view, the roster and the submit gate all
 * reach the same verdict instead of three near-identical checks drifting apart.
 *
 * The one rule that matters most: `ready_to_submit` is only ever returned when
 * the blocking set is empty. Everything else is presentation.
 */

export type Necessity = "required" | "optional" | "conditional";

export type Requirement = {
  id: string;
  kind: "field" | "document";
  requirement_key: string;
  label: string;
  necessity: Necessity;
  applies_to_states: string[];
  applies_to_contract_types: string[];
  applies_to_product_lines: string[];
  applies_to_comp_levels: string[];
  transfers_only: boolean;
  hierarchy_changes_only: boolean;
  active: boolean;
  sort_order: number;
};

/** The request being evaluated. */
export type RequestContext = {
  contract_type: string;
  is_transfer: boolean;
  requested_states: string[];
  product_lines: string[];
  requested_comp_level_name: string | null;
  requested_advance_level: string | null;
  status: string;
};

/** Everything known about the producer, already resolved by the caller. */
export type ProducerFacts = {
  npn: string | null;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  resident_state: string | null;
  resident_license_number: string | null;
  address: string | null;
  /** State codes with a licence in an active-equivalent status. */
  active_license_states: string[];
  /** Requirement key → status of the most recent matching upload. */
  documents: Record<string, "approved" | "uploaded" | "rejected" | "expired" | "missing" | "waived">;
};

/** Carrier-specific hierarchy, which is not the internal org chart. */
export type HierarchyFacts = {
  upline_name: string | null;
  upline_npn: string | null;
  upline_writing_number: string | null;
  upline_comp_level: string | null;
  agency_writing_number: string | null;
  agency_owner_npn: string | null;
  existing_writing_number: string | null;
};

export type Blocker = {
  requirement_key: string;
  label: string;
  kind: "field" | "document";
  /** Why it is blocking, in language an agency owner reads without translating. */
  reason: string;
  /** Who has to do something about it. */
  owner: "agent" | "staff" | "owner";
};

export type ReadinessResult = {
  state: ReadinessState;
  pct: number;
  blockers: Blocker[];
  /** Requirements that applied and were satisfied — drives the checklist ticks. */
  satisfied: { requirement_key: string; label: string; kind: "field" | "document" }[];
  /** Applicable-but-optional gaps. Shown, never blocking. */
  optional_gaps: { requirement_key: string; label: string; kind: "field" | "document" }[];
};

// ── Applicability ───────────────────────────────────────────────────────────

/**
 * Does this requirement apply to this request?
 *
 * Each populated array narrows; an empty array does not narrow on that axis.
 * A conditional requirement with no conditions set is treated as required —
 * the alternative is silently ignoring a requirement someone configured.
 */
export function requirementApplies(req: Requirement, ctx: RequestContext): boolean {
  if (!req.active) return false;
  if (req.transfers_only && !req.hierarchy_changes_only && !ctx.is_transfer) return false;
  if (req.hierarchy_changes_only && ctx.contract_type !== "hierarchy_change") return false;

  if (req.applies_to_contract_types.length && !req.applies_to_contract_types.includes(ctx.contract_type)) {
    return false;
  }
  if (req.applies_to_states.length) {
    const overlap = ctx.requested_states.some((s) => req.applies_to_states.includes(s));
    if (!overlap) return false;
  }
  if (req.applies_to_product_lines.length) {
    const overlap = ctx.product_lines.some((p) => req.applies_to_product_lines.includes(p));
    if (!overlap) return false;
  }
  if (req.applies_to_comp_levels.length) {
    if (!ctx.requested_comp_level_name) return false;
    if (!req.applies_to_comp_levels.includes(ctx.requested_comp_level_name)) return false;
  }
  return true;
}

// ── Field resolution ────────────────────────────────────────────────────────

function present(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * Resolves a field requirement key to whether it is satisfied.
 *
 * Unknown keys resolve to satisfied rather than blocking. A requirement key
 * that no longer exists in code is a configuration problem, and blocking every
 * request in the agency until someone notices is the wrong failure mode — the
 * caller surfaces unknown keys separately.
 */
export function resolveField(
  key: string,
  producer: ProducerFacts,
  hierarchy: HierarchyFacts,
  ctx: RequestContext,
): boolean {
  switch (key) {
    case "npn": return present(producer.npn);
    case "legal_name": return present(producer.legal_name);
    case "email": return present(producer.email);
    case "phone": return present(producer.phone);
    case "date_of_birth": return present(producer.date_of_birth);
    case "resident_state": return present(producer.resident_state);
    case "resident_license_number": return present(producer.resident_license_number);
    case "address": return present(producer.address);

    case "active_resident_license":
      return Boolean(
        producer.resident_state &&
        producer.active_license_states.includes(producer.resident_state),
      );

    case "requested_states": return present(ctx.requested_states);
    case "requested_product_lines": return present(ctx.product_lines);
    case "requested_comp_level": return present(ctx.requested_comp_level_name);
    case "requested_advance_level": return present(ctx.requested_advance_level);

    case "upline_name": return present(hierarchy.upline_name);
    case "upline_npn": return present(hierarchy.upline_npn);
    case "upline_writing_number": return present(hierarchy.upline_writing_number);
    case "upline_comp_level": return present(hierarchy.upline_comp_level);
    case "agency_writing_number": return present(hierarchy.agency_writing_number);
    case "agency_owner_npn": return present(hierarchy.agency_owner_npn);
    case "existing_writing_number": return present(hierarchy.existing_writing_number);

    default: return true;
  }
}

/** Which of the readiness states a blocking requirement maps to. */
function stateForBlocker(key: string, kind: "field" | "document"): ReadinessState {
  if (kind === "document") {
    return key === "pdb_report" ? "missing_documents" : "missing_documents";
  }
  if (key === "active_resident_license" || key === "resident_license_number") return "missing_license";
  if (key.startsWith("upline_") || key.startsWith("agency_")) return "missing_hierarchy";
  if (key === "existing_writing_number") return "missing_writing_number";
  return "missing_information";
}

/** Who is expected to clear a given blocker. */
function ownerForBlocker(key: string, kind: "field" | "document"): Blocker["owner"] {
  if (kind === "document") {
    // Carrier-specific forms are prepared by staff; the rest are the agent's.
    return key === "carrier_form" ? "staff" : "agent";
  }
  if (key.startsWith("upline_") || key.startsWith("agency_")) return "staff";
  if (key === "requested_comp_level") return "owner";
  return "agent";
}

function reasonFor(
  key: string,
  kind: "field" | "document",
  docStatus: ProducerFacts["documents"][string] | undefined,
): string {
  if (kind === "document") {
    switch (docStatus) {
      case "rejected": return "Rejected — a replacement is needed";
      case "expired": return "Expired — a current copy is needed";
      case "uploaded": return "Uploaded, waiting on review";
      default: return "Not uploaded yet";
    }
  }
  if (key === "active_resident_license") return "No active license on file for the resident state";
  if (key.startsWith("upline_")) return "Missing from the carrier hierarchy record";
  if (key.startsWith("agency_")) return "Missing from the agency's carrier record";
  return "Missing from the producer profile";
}

// ── The engine ──────────────────────────────────────────────────────────────

export function evaluateReadiness(input: {
  requirements: Requirement[];
  request: RequestContext;
  producer: ProducerFacts;
  hierarchy: HierarchyFacts;
  /** True when the agency requires an approval this request has not received. */
  approvalPending?: boolean;
}): ReadinessResult {
  const { requirements, request, producer, hierarchy, approvalPending } = input;

  // Terminal and in-flight statuses are facts, not computations. A submitted
  // request does not become "missing documents" because someone deleted a file.
  if (request.status === "approved" || request.status === "writing_number_issued") {
    return { state: "approved", pct: 100, blockers: [], satisfied: [], optional_gaps: [] };
  }
  if (["submitted", "carrier_reviewing"].includes(request.status)) {
    return { state: "submitted", pct: 100, blockers: [], satisfied: [], optional_gaps: [] };
  }

  const applicable = requirements.filter((r) => requirementApplies(r, request));

  if (applicable.length === 0) {
    // Nothing configured for this carrier yet. Saying "ready to submit" would
    // be a lie dressed as a green badge, so it reads as not started instead.
    return {
      state: request.status === "draft" ? "not_started" : "ready_to_submit",
      pct: request.status === "draft" ? 0 : 100,
      blockers: [],
      satisfied: [],
      optional_gaps: [],
    };
  }

  const blockers: Blocker[] = [];
  const satisfied: ReadinessResult["satisfied"] = [];
  const optional_gaps: ReadinessResult["optional_gaps"] = [];

  for (const req of applicable) {
    const kind = req.kind;
    const label =
      req.label ||
      (kind === "field"
        ? (FIELD_REQUIREMENTS as Record<string, string>)[req.requirement_key]
        : (DOCUMENT_REQUIREMENTS as Record<string, string>)[req.requirement_key]) ||
      req.requirement_key;

    let ok: boolean;
    let docStatus: ProducerFacts["documents"][string] | undefined;

    if (kind === "document") {
      docStatus = producer.documents[req.requirement_key] ?? "missing";
      // An upload awaiting review does not satisfy a requirement — sending a
      // carrier a document the agency has not looked at is how NIGOs happen.
      ok = docStatus === "approved" || docStatus === "waived";
    } else {
      ok = resolveField(req.requirement_key, producer, hierarchy, request);
    }

    if (ok) {
      satisfied.push({ requirement_key: req.requirement_key, label, kind });
      continue;
    }

    if (req.necessity === "optional") {
      optional_gaps.push({ requirement_key: req.requirement_key, label, kind });
      continue;
    }

    blockers.push({
      requirement_key: req.requirement_key,
      label,
      kind,
      reason: reasonFor(req.requirement_key, kind, docStatus),
      owner: ownerForBlocker(req.requirement_key, kind),
    });
  }

  // Percentage counts blocking requirements only. Including optional items
  // would show 90% for a request that cannot be sent, which is worse than
  // useless — it is reassuring and wrong.
  const blocking = blockers.length + satisfied.length;
  const pct = blocking === 0 ? 100 : Math.round((satisfied.length / blocking) * 100);

  if (blockers.length > 0) {
    // Report the most specific unmet category rather than a generic failure,
    // in the order an operator would work them.
    const order: ReadinessState[] = [
      "missing_license", "missing_hierarchy", "missing_writing_number",
      "missing_documents", "missing_information",
    ];
    const present = new Set(blockers.map((b) => stateForBlocker(b.requirement_key, b.kind)));
    const state = order.find((s) => present.has(s)) ?? "missing_information";
    return { state, pct, blockers, satisfied, optional_gaps };
  }

  if (approvalPending) {
    return { state: "awaiting_approval", pct, blockers: [], satisfied, optional_gaps };
  }

  return { state: "ready_to_submit", pct: 100, blockers: [], satisfied, optional_gaps };
}

/**
 * The gate. Nothing may be marked submitted or moved to ready_to_submit unless
 * this returns true, and it is re-run server-side rather than trusting the
 * cached readiness_state column.
 */
export function isSubmittable(result: ReadinessResult): boolean {
  return result.blockers.length === 0 && result.state === "ready_to_submit";
}
