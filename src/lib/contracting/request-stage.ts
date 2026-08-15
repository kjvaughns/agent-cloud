/**
 * The nine stages an agent sees, over the seventeen staff work in.
 *
 * ── Why not replace the seventeen ──
 *
 * `REQUEST_STATUS_META` distinguishes "missing information" from "missing
 * documents" from "waiting on agent", and "not in good order" from "carrier
 * needs more". Contracting staff work those differently and the inbox filters
 * on them, so collapsing the table would take away the distinctions the people
 * doing the work rely on.
 *
 * But an agent does not need seventeen. The brief asks for nine, and every one
 * of the seventeen maps onto one of them. So this is a presentation layer over
 * the existing vocabulary rather than a second one beside it — no migration, no
 * data change, and staff keep every state they had.
 *
 * ── The one that does not map ──
 *
 * `invite_sent`. Nothing in the schema records that a SureLC or direct carrier
 * invitation went out; `assigned` means staff picked the request up, which is
 * not the same thing and reads wrong to an agent waiting for an email. It is
 * in the vocabulary here and `fromStatus` never returns it, because inventing
 * a mapping would tell an agent an invitation had been sent when nobody had
 * sent one. Recording it needs a column, which is called out in the check.
 */

import { REQUEST_STATUS_META } from "@/lib/contracting-ops/types";

/** The nine the brief names, in the order a request moves through them. */
export const REQUEST_STAGES = [
  "requested",
  "invite_sent",
  "agent_action_needed",
  "submitted",
  "carrier_review",
  "approved",
  "active",
  "declined",
  "closed",
] as const;

export type RequestStage = (typeof REQUEST_STAGES)[number];

export const STAGE_LABEL: Record<RequestStage, string> = {
  requested: "Requested",
  invite_sent: "Invite sent",
  agent_action_needed: "Action needed",
  submitted: "Submitted",
  carrier_review: "Carrier review",
  approved: "Approved",
  active: "Active",
  declined: "Declined",
  closed: "Closed",
};

/** What an agent should understand is happening, per stage. */
export const STAGE_MEANING: Record<RequestStage, string> = {
  requested: "Your request is with the agency.",
  invite_sent: "An invitation has been sent to you. Check your email.",
  agent_action_needed: "Something is needed from you before this can move on.",
  submitted: "Your paperwork has gone to the carrier.",
  carrier_review: "The carrier is reviewing your appointment.",
  approved: "The carrier approved you. Your writing number is on its way.",
  active: "You are appointed and can write business with this carrier.",
  declined: "The carrier declined this appointment.",
  closed: "This request is finished and needs nothing further.",
};

/**
 * Every underlying status, mapped to what an agent is shown.
 *
 * Exhaustive on purpose. A status added later without a stage would otherwise
 * fall through to a default and read as something it is not; the check asserts
 * this covers the table.
 */
const STAGE_OF: Record<string, RequestStage> = {
  // With the agency, nothing needed from the agent.
  draft: "requested",
  ready_to_submit: "requested",
  assigned: "requested",
  awaiting_manager: "requested",
  awaiting_owner_approval: "requested",

  // The agent is the one holding it up. Three underlying states, one thing
  // for the agent to understand: you need to do something.
  missing_information: "agent_action_needed",
  missing_documents: "agent_action_needed",
  awaiting_agent: "agent_action_needed",

  submitted: "submitted",

  // Both are the carrier looking at it. "Not in good order" and "carrier needs
  // more" are staff distinctions — the carrier has it either way — and an
  // agent told "not in good order" would reasonably think it was their fault.
  carrier_reviewing: "carrier_review",
  nigo: "carrier_review",
  additional_info_requested: "carrier_review",

  approved: "approved",
  writing_number_issued: "active",
  declined: "declined",
  cancelled: "closed",
  closed: "closed",
};

export function fromStatus(status: string): RequestStage {
  // Unknown reads as requested rather than throwing: a status this does not
  // know about is a deployment ordering problem, and showing an agent the
  // earliest honest stage is better than showing them an error.
  return STAGE_OF[status] ?? "requested";
}

/** Is anything expected from the agent right now? */
export function needsAgent(stage: RequestStage): boolean {
  return stage === "agent_action_needed" || stage === "invite_sent";
}

/** Is this request finished, either way? */
export function isFinished(stage: RequestStage): boolean {
  return stage === "active" || stage === "declined" || stage === "closed";
}

export function stageTone(stage: RequestStage): "neutral" | "warning" | "info" | "success" | "danger" {
  if (stage === "agent_action_needed" || stage === "invite_sent") return "warning";
  if (stage === "declined") return "danger";
  if (stage === "active" || stage === "approved") return "success";
  if (stage === "closed") return "neutral";
  return "info";
}

/**
 * A stage that needs the agent must say what to do.
 *
 * The brief is explicit that Agent Action Needed requires an agent-visible
 * note. A status that tells somebody to act without saying what to do is worse
 * than leaving it alone — they will ask, and somebody has to answer.
 */
export function requiresNote(stage: RequestStage): boolean {
  return stage === "agent_action_needed";
}

export function noteRefusal(): string {
  return (
    "Add a note telling the agent exactly what they need to do. They will see " +
    "this on My Contracts, and without it they have no way to know what is wanted."
  );
}

/** Every underlying status this maps, for the check to compare against. */
export function mappedStatuses(): string[] {
  return Object.keys(STAGE_OF).sort();
}

/** Every status the product actually defines. */
export function knownStatuses(): string[] {
  return Object.keys(REQUEST_STATUS_META).sort();
}
