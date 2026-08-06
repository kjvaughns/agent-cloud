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
  "submitted", "carrier_reviewing", "nigo", "additional_info_requested",
  "approved", "writing_number_issued", "declined", "cancelled", "closed",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** Who the request is waiting on. Drives the "whose turn is it" column. */
export type Owner = "agent" | "manager" | "owner" | "staff" | "carrier" | "none";

export const REQUEST_STATUS_META: Record<
  RequestStatus,
  { label: string; tone: "neutral" | "warning" | "info" | "success" | "danger"; owner: Owner; open: boolean }
> = {
  draft:                    { label: "Draft",                     tone: "neutral", owner: "agent",   open: true },
  missing_information:      { label: "Missing information",       tone: "warning", owner: "agent",   open: true },
  missing_documents:        { label: "Missing documents",         tone: "warning", owner: "agent",   open: true },
  awaiting_agent:           { label: "Waiting on agent",          tone: "warning", owner: "agent",   open: true },
  awaiting_manager:         { label: "Waiting on manager",        tone: "info",    owner: "manager", open: true },
  awaiting_owner_approval:  { label: "Waiting on owner approval", tone: "info",    owner: "owner",   open: true },
  ready_to_submit:          { label: "Ready to submit",           tone: "success", owner: "staff",   open: true },
  assigned:                 { label: "Assigned to staff",         tone: "info",    owner: "staff",   open: true },
  submitted:                { label: "Submitted to carrier",      tone: "info",    owner: "carrier", open: true },
  carrier_reviewing:        { label: "Carrier reviewing",         tone: "info",    owner: "carrier", open: true },
  nigo:                     { label: "Not in good order",         tone: "danger",  owner: "staff",   open: true },
  additional_info_requested:{ label: "Carrier needs more",        tone: "danger",  owner: "staff",   open: true },
  approved:                 { label: "Approved",                  tone: "success", owner: "staff",   open: true },
  writing_number_issued:    { label: "Writing number issued",     tone: "success", owner: "none",    open: false },
  declined:                 { label: "Declined",                  tone: "danger",  owner: "none",    open: false },
  cancelled:                { label: "Cancelled",                 tone: "neutral", owner: "none",    open: false },
  closed:                   { label: "Closed",                    tone: "neutral", owner: "none",    open: false },
};

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
