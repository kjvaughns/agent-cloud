/**
 * The seven statuses a contract request can hold, in one place.
 *
 * These are the values of the `contract_status` Postgres enum, and Postgres is
 * the authority: an update carrying anything else fails at the database with
 * `invalid input value for enum contract_status`, which surfaces to whoever
 * clicked as a raw driver error.
 *
 * That was not hypothetical. The platform-admin contracts table offered
 * `in_review` and `declined` in its status dropdown and on its reject button —
 * neither is an enum value — while omitting `assigned`, `processing` and
 * `rejected`, which are. Every use of that control failed, and the failure
 * looked like the product being broken rather than the list being wrong.
 * `updateContractStatus` had the mirror-image problem: its own enum omitted
 * `assigned`, so a contract could be moved out of that state and never back.
 *
 * A list in a pure module rather than a `.tsx`, because the server functions
 * that validate against it cannot import a React component, and a copy is how
 * the two drifted apart in the first place.
 *
 * ── Not the same as `contracting_requests.status` ──
 *
 * That table has its own seventeen-value vocabulary and its own lifecycle. The
 * two are deliberately separate: `contract_requests` records whether an agent
 * holds an appointment with a carrier, and `contracting_requests` records the
 * unit of work that gets them there. See
 * `supabase/migrations/20260730162000_contracting-ops-requests.sql`.
 */

export const CONTRACT_STATUSES = [
  "assigned",
  "requested",
  "submitted",
  "processing",
  "issue",
  "active",
  "rejected",
] as const;

export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** How each reads to somebody who did not write the schema. */
export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  assigned: "Assigned",
  requested: "Requested",
  submitted: "Submitted",
  processing: "Processing",
  issue: "Issue",
  active: "Active",
  rejected: "Rejected",
};

export function isContractStatus(value: unknown): value is ContractStatus {
  return typeof value === "string" && (CONTRACT_STATUSES as readonly string[]).includes(value);
}

/**
 * The two statuses that end the request, one way or the other.
 *
 * `active` means the appointment exists; `rejected` means it will not. Used to
 * decide whether a change is worth telling the agent about in its own right —
 * both of these are, because they are the answer they have been waiting for.
 */
export const TERMINAL_CONTRACT_STATUSES = ["active", "rejected"] as const;

export function isTerminalContractStatus(status: string | null | undefined): boolean {
  return (TERMINAL_CONTRACT_STATUSES as readonly string[]).includes(status ?? "");
}

/**
 * A sentence an agent can act on, for the notification body.
 *
 * Deliberately not the bare status name. "Your Mutual of Omaha contract is now
 * Processing" tells somebody nothing they can do; naming what it means and who
 * holds it next is the difference between a notification and noise.
 */
export function contractStatusSentence(status: ContractStatus, carrier: string): string {
  switch (status) {
    case "assigned":
      return `Your ${carrier} contract is ready for you to activate with your writing number.`;
    case "requested":
      return `Your ${carrier} contract request has been reopened and is back in the queue.`;
    case "submitted":
      return `Your ${carrier} contract has been submitted to the carrier.`;
    case "processing":
      return `The carrier is reviewing your ${carrier} contract.`;
    case "issue":
      return `Your ${carrier} contract needs something from you before it can go further.`;
    case "active":
      return `Your ${carrier} contract is active. You can write business with them.`;
    case "rejected":
      return `Your ${carrier} contract was not approved.`;
  }
}
