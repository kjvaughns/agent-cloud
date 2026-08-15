/**
 * A contracting request's history, as the person waiting on it would read it.
 *
 * The rows exist and always have: `contracting_status_history` is append-only,
 * separates `agent_visible_message` from `internal_message`, and its RLS lets
 * an agent read their own. What was missing is anywhere for an agent to see
 * them — the only screen that rendered history sits under `/contracting-ops`,
 * whose layout guard redirects anybody without a staff role or permission flag
 * straight to `/licensing`. So the agent whose contract it is was the one
 * person who could not watch it move.
 *
 * Two things this module fixes on the way through, both visible on the staff
 * screen today:
 *
 * ── Every transition is recorded twice ──
 *
 * `trg_log_contracting_status` writes a row on every status change. When the
 * change also carries a message, `updateRequestStatus` writes a SECOND row for
 * the same transition with the message attached. The staff timeline renders
 * both, so a request that was declined with an explanation shows "Submitted →
 * Declined" twice in a row, once blank. `merge` keeps the richer one.
 *
 * The trigger's row is also the one with no author: it runs under the service
 * role, so `auth.uid()` — and therefore `changed_by` — is null. Preferring the
 * app's row is what recovers who did it.
 *
 * ── Raw status strings ──
 *
 * The staff screen prints `awaiting_owner_approval`. An agent reads "Waiting on
 * owner approval", which `REQUEST_STATUS_META` has had all along.
 *
 * Pure, so the merge rule can be exercised without a database.
 */

import { REQUEST_STATUS_META, type RequestStatus } from "@/lib/contracting-ops/types";

export type HistoryRow = {
  id: string;
  request_id?: string | null;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  agent_visible_message?: string | null;
  /** Stripped server-side for non-staff. Never rendered to an agent. */
  internal_message?: string | null;
  next_action?: string | null;
  due_date?: string | null;
  created_at: string;
};

export type HistoryEntry = {
  id: string;
  at: string;
  status: RequestStatus | string;
  /** "Waiting on owner approval", not `awaiting_owner_approval`. */
  label: string;
  /** Where it came from, already labelled. Null for the opening entry. */
  fromLabel: string | null;
  message: string | null;
  nextAction: string | null;
  dueDate: string | null;
  actorId: string | null;
  /** Who the request is waiting on now, so the agent knows if it is them. */
  waitingOn: string;
  /** False once the request has reached a terminal status. */
  open: boolean;
};

export function statusLabel(status: string): string {
  return REQUEST_STATUS_META[status as RequestStatus]?.label ?? status;
}

/** Human phrasing for the "whose turn" field. */
const WAITING_ON: Record<string, string> = {
  agent: "You",
  manager: "Your manager",
  owner: "The agency owner",
  staff: "The contracting team",
  carrier: "The carrier",
  none: "Nobody — this is finished",
};

export function waitingOn(status: string): string {
  const owner = REQUEST_STATUS_META[status as RequestStatus]?.owner;
  return WAITING_ON[owner ?? "none"] ?? "The contracting team";
}

/**
 * Rows within this many milliseconds describing the same transition are the
 * same event recorded twice.
 *
 * The trigger fires inside the same statement that the app's own insert
 * follows, so the two are separated by however long the intervening work took
 * — a readiness recompute and a write-through to the appointment record. Ten
 * seconds is far longer than that and far shorter than a person changing a
 * status, changing it back, and changing it again.
 */
const SAME_EVENT_MS = 10_000;

function key(r: HistoryRow): string {
  return `${r.from_status ?? ""}→${r.to_status}`;
}

/** How much a row actually says, for choosing between duplicates. */
function richness(r: HistoryRow): number {
  return (
    (r.agent_visible_message ? 2 : 0) +
    (r.next_action ? 1 : 0) +
    (r.due_date ? 1 : 0) +
    // The trigger's row has no author, so preferring one that does is how the
    // actor is recovered rather than lost to the dedupe.
    (r.changed_by ? 1 : 0)
  );
}

/**
 * Collapse the duplicate rows and put the result in reading order.
 *
 * Newest first, matching every other history in the product. Rows with an
 * unparseable date are kept rather than dropped — a timestamp this product
 * wrote itself should never be missing, and silently losing an entry from an
 * audit trail is worse than showing one out of order.
 */
export function merge(rows: HistoryRow[]): HistoryRow[] {
  const sorted = [...rows].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || a.id.localeCompare(b.id),
  );

  const out: HistoryRow[] = [];
  for (const row of sorted) {
    const twin = out.find(
      (kept) =>
        key(kept) === key(row) &&
        Math.abs(Date.parse(kept.created_at) - Date.parse(row.created_at)) <= SAME_EVENT_MS,
    );
    if (!twin) {
      out.push(row);
      continue;
    }
    // Same event. Keep whichever says more — and date it from the earlier of
    // the two either way, so the entry reads as when the change happened
    // rather than when the second write landed. Backdating has to happen
    // whichever row wins: rows arrive newest-first, so the app's richer row is
    // usually already kept when the trigger's earlier one turns up.
    const at = new Date(
      Math.min(Date.parse(twin.created_at), Date.parse(row.created_at)),
    ).toISOString();
    const keep = richness(row) > richness(twin) ? row : twin;
    out[out.indexOf(twin)] = { ...keep, created_at: at };
  }
  return out;
}

/**
 * The agent-facing view: merged, labelled, and with internal notes gone.
 *
 * `internal_message` is dropped here as well as server-side. The server strip
 * is the one that matters — it keeps the text out of the browser entirely —
 * and this makes it impossible for a caller to render it by accident even if
 * that strip is ever loosened.
 */
export function forAgent(rows: HistoryRow[]): HistoryEntry[] {
  return merge(rows).map((r) => ({
    id: r.id,
    at: r.created_at,
    status: r.to_status,
    label: statusLabel(r.to_status),
    fromLabel: r.from_status ? statusLabel(r.from_status) : null,
    message: r.agent_visible_message ?? null,
    nextAction: r.next_action ?? null,
    dueDate: r.due_date ?? null,
    actorId: r.changed_by ?? null,
    waitingOn: waitingOn(r.to_status),
    open: REQUEST_STATUS_META[r.to_status as RequestStatus]?.open ?? true,
  }));
}

/**
 * One line saying where a request stands, for a row that is not expanded.
 *
 * Reads from the request's own status rather than the newest history row: a
 * status set before this history table existed has no row at all, and a
 * request would otherwise claim to have no status.
 */
export function currentStanding(status: string): { label: string; waiting: string; open: boolean } {
  return {
    label: statusLabel(status),
    waiting: waitingOn(status),
    open: REQUEST_STATUS_META[status as RequestStatus]?.open ?? true,
  };
}
