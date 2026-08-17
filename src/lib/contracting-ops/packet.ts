import type { ReadinessResult } from "./readiness";

/**
 * Contracting packet.
 *
 * One resolved shape that every submission path reads from — the printable
 * packet, the spreadsheet exporter, the email generator and the copy buttons.
 * Building it once means the email and the spreadsheet cannot disagree about
 * an agent's NPN, which is exactly the class of error this module exists to
 * remove.
 *
 * A packet is a SNAPSHOT. Once generated for a submission it is stored on
 * contracting_submissions.payload_snapshot, so editing a profile afterwards
 * does not rewrite what was actually sent to a carrier.
 */

export type PacketAgent = {
  full_legal_name: string | null;
  preferred_name: string | null;
  npn: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  resident_state: string | null;
  resident_license_number: string | null;
  address: string | null;
};

export type PacketHierarchy = {
  upline_name: string | null;
  upline_npn: string | null;
  upline_email: string | null;
  upline_phone: string | null;
  upline_writing_number: string | null;
  upline_comp_level: string | null;
  agency_owner_name: string | null;
  agency_owner_npn: string | null;
  agency_writing_number: string | null;
  hierarchy_path: string | null;
};

export type PacketRequest = {
  reference: string | null;
  contract_type: string;
  requested_states: string[];
  product_lines: string[];
  requested_comp_level: string | null;
  requested_advance_level: string | null;
  desired_effective_date: string | null;
  existing_writing_number: string | null;
  notes: string | null;
};

export type PacketCarrier = {
  name: string;
  method: string | null;
  portal_url: string | null;
  surelc_url: string | null;
  invitation_link: string | null;
  contracting_email: string | null;
  support_email: string | null;
  support_phone: string | null;
  turnaround_days: number | null;
  instructions: string | null;
  /**
   * The furthest advance this agency has agreed with this carrier, or null when
   * nobody has chosen one.
   *
   * Carried on the packet so the screen that grants an advance can offer only
   * what the carrier allows. Granting twelve months on a carrier that advances
   * nine is not a setting somebody can fix later — it is money fronted that the
   * carrier will not fund, and it comes back as a chargeback.
   */
  max_advance_option: string | null;
};

export type PacketDocument = {
  requirement_key: string;
  label: string;
  status: "missing" | "uploaded" | "approved" | "rejected" | "expired" | "waived";
  is_sensitive: boolean;
  updated_at: string | null;
};

export type Packet = {
  agency_name: string | null;
  agent: PacketAgent;
  hierarchy: PacketHierarchy;
  request: PacketRequest;
  carrier: PacketCarrier;
  documents: PacketDocument[];
  readiness: ReadinessResult;
};

// ── Value resolution ────────────────────────────────────────────────────────

/**
 * The variable vocabulary shared by email templates and spreadsheet mappings.
 * Adding a key here makes it available to both at once.
 */
export const PACKET_KEYS = {
  agent_full_name: "Agent full legal name",
  agent_preferred_name: "Agent preferred name",
  agent_npn: "Agent NPN",
  agent_email: "Agent email",
  agent_phone: "Agent phone",
  agent_dob: "Agent date of birth",
  agent_resident_state: "Resident state",
  agent_resident_license: "Resident license number",
  agent_address: "Agent address",
  requested_states: "Requested states",
  requested_products: "Requested product lines",
  requested_comp_level: "Requested compensation level",
  requested_advance_level: "Requested advance level",
  effective_date: "Desired effective date",
  contract_type: "Contract type",
  existing_writing_number: "Existing writing number",
  upline_name: "Direct upline name",
  upline_npn: "Direct upline NPN",
  upline_email: "Direct upline email",
  upline_phone: "Direct upline phone",
  upline_writing_number: "Direct upline writing number",
  upline_comp_level: "Direct upline compensation level",
  agency_name: "Agency name",
  agency_owner_name: "Agency owner name",
  agency_owner_npn: "Agency owner NPN",
  agency_writing_number: "Agency writing number",
  hierarchy_path: "Full carrier hierarchy path",
  carrier_name: "Carrier name",
  request_reference: "Request reference",
  notes: "Notes",
} as const;

export type PacketKey = keyof typeof PACKET_KEYS;

export function resolvePacketValue(key: string, p: Packet): string {
  const join = (a: string[]) => a.join(", ");
  switch (key as PacketKey) {
    case "agent_full_name": return p.agent.full_legal_name ?? "";
    case "agent_preferred_name": return p.agent.preferred_name ?? "";
    case "agent_npn": return p.agent.npn ?? "";
    case "agent_email": return p.agent.email ?? "";
    case "agent_phone": return p.agent.phone ?? "";
    case "agent_dob": return p.agent.date_of_birth ?? "";
    case "agent_resident_state": return p.agent.resident_state ?? "";
    case "agent_resident_license": return p.agent.resident_license_number ?? "";
    case "agent_address": return p.agent.address ?? "";
    case "requested_states": return join(p.request.requested_states);
    case "requested_products": return join(p.request.product_lines);
    case "requested_comp_level": return p.request.requested_comp_level ?? "";
    case "requested_advance_level": return p.request.requested_advance_level ?? "";
    case "effective_date": return p.request.desired_effective_date ?? "";
    case "contract_type": return p.request.contract_type;
    case "existing_writing_number": return p.request.existing_writing_number ?? "";
    case "upline_name": return p.hierarchy.upline_name ?? "";
    case "upline_npn": return p.hierarchy.upline_npn ?? "";
    case "upline_email": return p.hierarchy.upline_email ?? "";
    case "upline_phone": return p.hierarchy.upline_phone ?? "";
    case "upline_writing_number": return p.hierarchy.upline_writing_number ?? "";
    case "upline_comp_level": return p.hierarchy.upline_comp_level ?? "";
    case "agency_name": return p.agency_name ?? "";
    case "agency_owner_name": return p.hierarchy.agency_owner_name ?? "";
    case "agency_owner_npn": return p.hierarchy.agency_owner_npn ?? "";
    case "agency_writing_number": return p.hierarchy.agency_writing_number ?? "";
    case "hierarchy_path": return p.hierarchy.hierarchy_path ?? "";
    case "carrier_name": return p.carrier.name;
    case "request_reference": return p.request.reference ?? "";
    case "notes": return p.request.notes ?? "";
    default: return "";
  }
}

// ── Transforms ──────────────────────────────────────────────────────────────

export function applyTransform(value: string, transform: string | null | undefined): string {
  if (!value || !transform) return value;
  switch (transform) {
    case "upper": return value.toUpperCase();
    case "lower": return value.toLowerCase();
    case "title": return value.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
    case "digits_only": return value.replace(/\D+/g, "");
    case "date_mdy": {
      // Dates are stored ISO. Parsed manually rather than through Date() to
      // avoid the timezone shift that turns the 1st into the previous month.
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
      return m ? `${m[2]}/${m[3]}/${m[1]}` : value;
    }
    case "date_iso": {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value);
      return m ? `${m[3]}-${m[1]}-${m[2]}` : value;
    }
    default: return value;
  }
}

// ── Email rendering ─────────────────────────────────────────────────────────

/**
 * Substitutes {{variable}} against the packet.
 *
 * Unknown variables are left visible as {{name}} rather than silently blanked:
 * an operator proofreading a generated email needs to see that something did
 * not resolve, not discover it after the carrier replies.
 */
export function renderTemplate(template: string, packet: Packet): string {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (whole, key: string) => {
    if (!(key in PACKET_KEYS)) return whole;
    const v = resolvePacketValue(key, packet);
    return v === "" ? whole : v;
  });
}

/** Variables referenced by a template that the packet cannot fill. */
export function unresolvedVariables(template: string, packet: Packet): string[] {
  const out = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)) {
    const key = m[1];
    if (!(key in PACKET_KEYS) || resolvePacketValue(key, packet) === "") out.add(key);
  }
  return [...out];
}

// ── Spreadsheet rows ────────────────────────────────────────────────────────

export type FieldMapping = {
  column_header: string;
  column_index: number | null;
  source_key: string;
  static_value: string | null;
  transform: string | null;
  required: boolean;
  sort_order: number;
};

export type SpreadsheetRow = {
  headers: string[];
  values: string[];
  /** Mapped columns marked required that resolved empty. */
  missing: string[];
};

export function buildSpreadsheetRow(mappings: FieldMapping[], packet: Packet): SpreadsheetRow {
  const ordered = [...mappings].sort(
    (a, b) => (a.column_index ?? a.sort_order) - (b.column_index ?? b.sort_order),
  );

  const headers: string[] = [];
  const values: string[] = [];
  const missing: string[] = [];

  for (const m of ordered) {
    const raw = m.source_key === "literal" ? (m.static_value ?? "") : resolvePacketValue(m.source_key, packet);
    const value = applyTransform(raw, m.transform) || (m.static_value ?? "");
    headers.push(m.column_header);
    values.push(value);
    if (m.required && !value) missing.push(m.column_header);
  }

  return { headers, values, missing };
}

/** CSV for one or many rows. Quotes everything so commas in names cannot shift a column. */
export function toCsv(headers: string[], rows: string[][]): string {
  const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
}

// ── Copy helpers ────────────────────────────────────────────────────────────

const line = (label: string, value: string | null | undefined) =>
  value ? `${label}: ${value}` : null;

export function agentBlock(p: Packet): string {
  return [
    line("Name", p.agent.full_legal_name),
    line("NPN", p.agent.npn),
    line("Email", p.agent.email),
    line("Phone", p.agent.phone),
    line("Resident state", p.agent.resident_state),
    line("Resident license", p.agent.resident_license_number),
    line("Requested states", p.request.requested_states.join(", ")),
    line("Requested products", p.request.product_lines.join(", ")),
    line("Requested level", p.request.requested_comp_level),
    line("Contract type", p.request.contract_type),
  ].filter(Boolean).join("\n");
}

export function hierarchyBlock(p: Packet): string {
  return [
    line("Direct upline", p.hierarchy.upline_name),
    line("Upline NPN", p.hierarchy.upline_npn),
    line("Upline writing number", p.hierarchy.upline_writing_number),
    line("Upline level", p.hierarchy.upline_comp_level),
    line("Agency owner", p.hierarchy.agency_owner_name),
    line("Agency owner NPN", p.hierarchy.agency_owner_npn),
    line("Agency writing number", p.hierarchy.agency_writing_number),
    line("Hierarchy", p.hierarchy.hierarchy_path),
  ].filter(Boolean).join("\n");
}

export function fullBlock(p: Packet): string {
  return [
    `${p.carrier.name} — ${p.request.contract_type}${p.request.reference ? ` (${p.request.reference})` : ""}`,
    "",
    "AGENT",
    agentBlock(p),
    "",
    "HIERARCHY",
    hierarchyBlock(p),
  ].join("\n");
}
