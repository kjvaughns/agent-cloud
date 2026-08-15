/**
 * Contracting Operations — shared vocabulary.
 *
 * The status strings here are the same literals the database check constraints
 * enforce. Keeping them in one file means a status added to the workflow is a
 * one-line change plus a migration, not a hunt through twelve components.
 *
 * Labels are written in insurance operations language, not developer language:
 * an agency owner reads "Not in good order", not "nigo".
 */

// ── Request status ──────────────────────────────────────────────────────────

export const REQUEST_STATUSES = [
  "draft", "missing_information", "missing_documents", "awaiting_agent",
  "awaiting_manager", "awaiting_owner_approval", "ready_to_submit", "assigned",
  "invite_sent", "submitted", "carrier_reviewing", "nigo",
  "additional_info_requested", "approved", "active", "writing_number_issued",
  "declined", "cancelled", "closed",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Who the request is waiting on. Drives the "whose turn is it" column. */
export type Owner = "agent" | "manager" | "owner" | "staff" | "carrier" | "none";

export const REQUEST_STATUS_META: Record<
  RequestStatus,
  { label: string; tone: "neutral" | "warning" | "info" | "success" | "danger"; owner: Owner; open: boolean }
> = {
  draft:                    { label: "Requested",                  tone: "neutral", owner: "staff",   open: true },
  missing_information:      { label: "Agent action needed",        tone: "warning", owner: "agent",   open: true },
  missing_documents:        { label: "Agent action needed",        tone: "warning", owner: "agent",   open: true },
  awaiting_agent:           { label: "Agent action needed",        tone: "warning", owner: "agent",   open: true },
  awaiting_manager:         { label: "Waiting on manager",         tone: "info",    owner: "manager", open: true },
  awaiting_owner_approval:  { label: "Waiting on owner approval",  tone: "info",    owner: "owner",   open: true },
  ready_to_submit:          { label: "Ready to submit",            tone: "success", owner: "staff",   open: true },
  assigned:                 { label: "Assigned to staff",          tone: "info",    owner: "staff",   open: true },
  invite_sent:              { label: "Invite sent",                tone: "info",    owner: "agent",   open: true },
  submitted:                { label: "Submitted",                  tone: "info",    owner: "carrier", open: true },
  carrier_reviewing:        { label: "Carrier review",             tone: "info",    owner: "carrier", open: true },
  nigo:                     { label: "Agent action needed",        tone: "danger",  owner: "agent",   open: true },
  additional_info_requested:{ label: "Agent action needed",        tone: "danger",  owner: "agent",   open: true },
  approved:                 { label: "Approved",                   tone: "success", owner: "staff",   open: true },
  active:                   { label: "Active",                     tone: "success", owner: "none",    open: false },
  writing_number_issued:    { label: "Active",                     tone: "success", owner: "none",    open: false },
  declined:                 { label: "Declined",                   tone: "danger",  owner: "none",    open: false },
  cancelled:                { label: "Closed",                     tone: "neutral", owner: "none",    open: false },
  closed:                   { label: "Closed",                     tone: "neutral", owner: "none",    open: false },
};

/**
 * The nine statuses the workflow actually offers.
 *
 * Everything above stays a legal value — rows already hold the retired ones,
 * and a vocabulary that cannot label its own history is worse than a long one.
 * But a person working a request should choose from nine steps, not nineteen,
 * so the pickers read from this list and the labels above fold the rest onto
 * these nine names.
 */
export const PRIMARY_REQUEST_STATUSES = [
  "draft", "invite_sent", "awaiting_agent", "submitted", "carrier_reviewing",
  "approved", "active", "declined", "closed",
] as const satisfies readonly RequestStatus[];

export type PrimaryRequestStatus = (typeof PRIMARY_REQUEST_STATUSES)[number];

/** The statuses that mean "the agent has something to do". */
export const AGENT_ACTION_STATUSES = [
  "awaiting_agent", "missing_information", "missing_documents", "nigo",
  "additional_info_requested",
] as const satisfies readonly RequestStatus[];

export function isAgentActionStatus(status: string): boolean {
  return (AGENT_ACTION_STATUSES as readonly string[]).includes(status);
}

/** The statuses that mean the appointment is live at the carrier. */
export function isLiveStatus(status: string): boolean {
  return status === "active" || status === "writing_number_issued";
}

export function requestStatusLabel(status: string): string {
  return REQUEST_STATUS_META[status as RequestStatus]?.label ?? status;
}

// ── Advance options ─────────────────────────────────────────────────────────

/** Mirrors the `advance_option` Postgres enum. */
export const ADVANCE_OPTIONS = [
  "as_earned", "3_months", "6_months", "9_months", "12_months",
] as const;

export type AdvanceOptionKey = (typeof ADVANCE_OPTIONS)[number];

export const ADVANCE_OPTION_LABELS: Record<AdvanceOptionKey, string> = {
  as_earned: "As earned",
  "3_months": "3 month advance",
  "6_months": "6 month advance",
  "9_months": "9 month advance",
  "12_months": "12 month advance",
};

// ── Where a compensation number came from ───────────────────────────────────

export const COMP_SOURCE_LABELS = {
  agent_carrier_level: "Agent specific carrier level",
  position_carrier_mapping: "Agency position carrier mapping",
  position_pct_fallback: "Agency position percentage fallback",
  none: "Not resolved yet",
} as const;

export type CompSource = keyof typeof COMP_SOURCE_LABELS;


// ── Contract type ───────────────────────────────────────────────────────────

export const CONTRACT_TYPES = [
  "new_contract", "state_appointment", "product_line_addition", "transfer",
  "release", "recontract", "comp_level_change", "hierarchy_change",
  "writing_number_correction", "appointment_reinstatement", "other",
] as const;

export type ContractType = (typeof CONTRACT_TYPES)[number];

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  new_contract: "New carrier contract",
  state_appointment: "Additional state appointment",
  product_line_addition: "Product line addition",
  transfer: "Transfer",
  release: "Release",
  recontract: "Recontract",
  comp_level_change: "Compensation level change",
  hierarchy_change: "Hierarchy change",
  writing_number_correction: "Writing number correction",
  appointment_reinstatement: "Appointment reinstatement",
  other: "Other",
};

// ── Readiness ───────────────────────────────────────────────────────────────

export const READINESS_STATES = [
  "not_started", "missing_information", "missing_documents", "missing_license",
  "missing_hierarchy", "missing_writing_number", "awaiting_approval",
  "ready_to_submit", "submitted", "approved",
] as const;

export type ReadinessState = (typeof READINESS_STATES)[number];

export const READINESS_LABELS: Record<ReadinessState, string> = {
  not_started: "Not started",
  missing_information: "Missing information",
  missing_documents: "Missing documents",
  missing_license: "Missing license",
  missing_hierarchy: "Missing hierarchy information",
  missing_writing_number: "Missing writing number",
  awaiting_approval: "Awaiting approval",
  ready_to_submit: "Ready to submit",
  submitted: "Submitted",
  approved: "Approved",
};

// ── Contracting methods ─────────────────────────────────────────────────────

export const CONTRACTING_METHODS = [
  "surelc", "carrier_portal", "invitation_link", "email",
  "spreadsheet", "manual_form", "api", "other",
] as const;

export type ContractingMethod = (typeof CONTRACTING_METHODS)[number];

export const METHOD_LABELS: Record<ContractingMethod, string> = {
  surelc: "SureLC",
  carrier_portal: "Carrier portal",
  invitation_link: "Contracting invitation link",
  email: "Email submission",
  spreadsheet: "Spreadsheet submission",
  manual_form: "Manual form",
  api: "API integration",
  other: "Other",
};

// ── Ready to sell ───────────────────────────────────────────────────────────

export type ReadyToSellStatus =
  | "ready" | "missing_license" | "missing_appointment" | "contract_pending"
  | "contract_submitted" | "missing_writing_number" | "missing_eo" | "missing_aml"
  | "missing_pdb" | "hierarchy_change_pending" | "comp_approval_pending" | "not_eligible";

export const READY_TO_SELL_LABELS: Record<ReadyToSellStatus, string> = {
  ready: "Ready to sell",
  missing_license: "Missing license",
  missing_appointment: "Missing appointment",
  contract_pending: "Contract pending",
  contract_submitted: "Contract submitted",
  missing_writing_number: "Missing writing number",
  missing_eo: "Missing E&O",
  missing_aml: "Missing AML",
  missing_pdb: "Missing PDB report",
  hierarchy_change_pending: "Hierarchy change pending",
  comp_approval_pending: "Compensation approval pending",
  not_eligible: "Not eligible",
};

// ── Requirement keys the readiness engine can resolve ────────────────────────

/**
 * Field requirements read a value off the producer, the request or the carrier
 * hierarchy. Document requirements look for an accepted upload.
 *
 * These keys are stored in carrier_requirements.requirement_key, so renaming
 * one is a data migration, not just a code change.
 */
export const FIELD_REQUIREMENTS = {
  npn: "NPN",
  legal_name: "Full legal name",
  email: "Email address",
  phone: "Phone number",
  date_of_birth: "Date of birth",
  resident_state: "Resident state",
  resident_license_number: "Resident license number",
  address: "Mailing address",
  requested_states: "Requested states",
  requested_product_lines: "Requested product lines",
  requested_comp_level: "Requested compensation level",
  requested_advance_level: "Requested advance level",
  upline_name: "Direct upline name",
  upline_npn: "Direct upline NPN",
  upline_writing_number: "Direct upline writing number",
  upline_comp_level: "Direct upline compensation level",
  agency_writing_number: "Agency writing number",
  agency_owner_npn: "Agency owner NPN",
  existing_writing_number: "Existing writing number",
  active_resident_license: "Active resident license",
} as const;

export const DOCUMENT_REQUIREMENTS = {
  pdb_report: "PDB report",
  eo_certificate: "E&O certificate",
  aml_certificate: "AML certificate",
  voided_check: "Voided check",
  w9: "W9",
  direct_deposit: "Direct deposit form",
  government_id: "Government identification",
  release_letter: "Release letter",
  transfer_form: "Transfer form",
  background_questionnaire: "Background questionnaire",
  carrier_form: "Carrier specific form",
  other_document: "Supporting document",
} as const;

export type FieldRequirementKey = keyof typeof FIELD_REQUIREMENTS;
export type DocumentRequirementKey = keyof typeof DOCUMENT_REQUIREMENTS;

/** Document types that must never render in a roster or general table. */
export const SENSITIVE_DOC_TYPES = new Set<string>([
  "w9", "voided_check", "direct_deposit", "government_id", "ssn_card", "tax_document",
]);

// ── Hierarchy changes ───────────────────────────────────────────────────────

export const HIERARCHY_CHANGE_TYPES = [
  "promotion", "demotion", "manager_reassignment", "upline_change",
  "carrier_hierarchy_change", "comp_change", "release", "transfer",
  "agency_transfer", "writing_number_correction", "role_change",
] as const;

export type HierarchyChangeType = (typeof HIERARCHY_CHANGE_TYPES)[number];

/**
 * The types actually offered when raising a change. Nine, not eleven.
 *
 * Two of the eleven were the same request under two names:
 *
 *   - `manager_reassignment` and `upline_change` both mean "this agent reports
 *     to somebody else now". There is no field that distinguishes them and no
 *     branch anywhere that treats them differently.
 *   - `transfer` and `agency_transfer` likewise.
 *
 * `HIERARCHY_CHANGE_TYPES` keeps all eleven, because rows already exist with
 * the retired values and a list that cannot label its own history is worse
 * than a list with duplicates. This is the shorter list the picker offers.
 */
export const HIERARCHY_CHANGE_OPTIONS = [
  "upline_change", "promotion", "demotion", "role_change", "comp_change",
  "carrier_hierarchy_change", "release", "transfer", "writing_number_correction",
] as const satisfies readonly HierarchyChangeType[];

export const HIERARCHY_CHANGE_LABELS: Record<HierarchyChangeType, string> = {
  promotion: "Promotion",
  demotion: "Demotion",
  manager_reassignment: "Manager reassignment (retired — use \"Change who they report to\")",
  upline_change: "Change who they report to",
  carrier_hierarchy_change: "Carrier hierarchy correction",
  comp_change: "Compensation change",
  release: "Release request",
  transfer: "Transfer to another agency",
  agency_transfer: "Agency transfer (retired — use \"Transfer\")",
  writing_number_correction: "Writing number correction",
  role_change: "Role change",
};
