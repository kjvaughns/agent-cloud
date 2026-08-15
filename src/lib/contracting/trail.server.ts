/**
 * A contract request change leaves a trail.
 *
 * Four server functions could change or remove a contract request, and not one
 * of them recorded anything:
 *
 *   contracting.functions.ts  updateContractStatus
 *   contracting.functions.ts  activateContract
 *   contracting.functions.ts  deleteContractRequest
 *   admin.functions.ts        adminUpdateContract
 *
 * So an agent could open Contracting, find a carrier they had been waiting on
 * marked Rejected, and there was no record of who rejected it, when, or why —
 * and nothing had told them it happened. They found out by looking. The
 * sibling `contracting_requests` table has had both since it was built
 * (`contracting-ops.functions.ts:1159`); this is the half that was missed.
 *
 * ── Why one function and not four ──
 *
 * Audit and notification are two writes that must both happen, and the way
 * they rot is one call site gaining one of them. Bundling them means a caller
 * cannot record the change without also telling the person it happened to.
 *
 * ── Failure is not fatal ──
 *
 * Same contract the rest of this module keeps: the change has already landed
 * in the database by the time this runs. Throwing here would fail an action
 * the user completed, trading a missing log line for a broken workflow.
 * `recordAudit` swallows and logs; `notifyPeople` does the same and returns a
 * count. Neither can undo the thing it is describing.
 */

import { recordAudit, type AuditAction } from "@/lib/contracting-ops/audit";
import { notifyPeople } from "@/lib/notify.server";
import {
  contractStatusSentence,
  isContractStatus,
  isTerminalContractStatus,
  type ContractStatus,
} from "./status";

export type ContractChange =
  /** The status moved. `from` may be null for a row we could not read first. */
  | { kind: "status"; from?: string | null; to: ContractStatus }
  /** The agent supplied their writing number and the appointment went live. */
  | { kind: "activated"; writingNumber: string }
  /** The request was removed entirely. */
  | { kind: "removed"; previousStatus?: string | null };

const ACTION: Record<ContractChange["kind"], AuditAction> = {
  status: "request.status_changed",
  // An activation is an approval that the agent themselves completed, which is
  // the one transition on this table nobody else can make.
  activated: "request.approved",
  removed: "request.removed",
};

export type TrailInput = {
  /** RLS-bound client is fine: the audit write uses the service role inside. */
  client: any;
  contractId: string;
  /** Whose contract this is — the person told about it. */
  agentId: string;
  carrierId?: string | null;
  organizationId?: string | null;
  /** Who made the change. Not told about their own action. */
  actorId: string | null;
  change: ContractChange;
  /** Free text the actor gave: an issue description, a rejection reason. */
  reason?: string | null;
};

/**
 * Record a contract request change and tell the agent it happened.
 *
 * Returns how many people were notified, which the caller can log. Zero is a
 * real answer, not a failure — the agent may have turned Contracting updates
 * off, or may be the person who made the change.
 */
export async function recordContractChange(input: TrailInput): Promise<number> {
  const { client, change } = input;

  // The carrier name is what makes any of this readable. Looked up here rather
  // than threaded through four call sites, and a failure to find it degrades
  // to "your contract" instead of losing the whole trail.
  let carrier = "your carrier";
  if (input.carrierId) {
    try {
      const { data } = await client
        .from("carriers")
        .select("name")
        .eq("id", input.carrierId)
        .maybeSingle();
      if (data?.name) carrier = data.name;
    } catch {
      // Keep the fallback. A missing carrier name is not worth losing the
      // audit row over.
    }
  }

  await recordAudit({
    organizationId: input.organizationId ?? null,
    actorId: input.actorId,
    action: ACTION[change.kind],
    // Distinguishes this table from `contracting_requests`, which uses the
    // same actions against record_type 'contracting_request'.
    recordType: "contract_request",
    recordId: input.contractId,
    subjectAgentId: input.agentId,
    previous:
      change.kind === "status"
        ? { status: change.from ?? null }
        : change.kind === "removed"
          ? { status: change.previousStatus ?? null }
          : null,
    next:
      change.kind === "status"
        ? { status: change.to }
        : change.kind === "activated"
          ? { status: "active", writing_number: change.writingNumber }
          : null,
    metadata: {
      carrier_id: input.carrierId ?? null,
      ...(input.reason ? { reason: input.reason } : {}),
    },
  });

  const message = describe(change, carrier, input.reason);
  if (!message) return 0;

  return notifyPeople(client, {
    userIds: [input.agentId],
    category: "contract_updates",
    title: message.title,
    description: message.body,
    type: "contracting",
    // Nobody is told about something they did to themselves. An agent
    // activating their own contract already watched it happen.
    exceptUserId: input.actorId,
  });
}

function describe(
  change: ContractChange,
  carrier: string,
  reason?: string | null,
): { title: string; body: string } | null {
  if (change.kind === "activated") {
    return {
      title: `${carrier} contract active`,
      body: `Your ${carrier} contract is active under writing number ${change.writingNumber}.`,
    };
  }

  if (change.kind === "removed") {
    return {
      title: `${carrier} contract request removed`,
      body:
        `Your request to contract with ${carrier} was removed.` +
        (reason ? ` ${reason}` : " Raise it again if that was not intended."),
    };
  }

  // A status change to the same status is not news.
  if (change.from === change.to) return null;
  if (!isContractStatus(change.to)) return null;

  const body = contractStatusSentence(change.to, carrier);
  return {
    title: isTerminalContractStatus(change.to)
      ? // The two answers somebody has actually been waiting for get a title
        // that says so rather than a neutral "updated".
        `${carrier} contract ${change.to === "active" ? "approved" : "not approved"}`
      : `${carrier} contract updated`,
    body: reason ? `${body} ${reason}` : body,
  };
}
