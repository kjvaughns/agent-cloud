# Carrier assignment + agent contract request workflow

Two goals: make "activate an agent on a carrier" a complete, guarded action with a visible compensation source, and make the agent request workflow a simple 9-status round trip with real notes, notifications, and full history.

## What exists today (verified)

- Two separate records: the appointment (`contract_requests`, 7 statuses: assigned / requested / submitted / processing / issue / active / rejected) and the staff work item (`contracting_requests`, 17 statuses including draft, awaiting_agent, submitted, carrier_reviewing, approved, writing_number_issued, declined, closed).
- Neither vocabulary has "Invite Sent", and nothing in the ops lane means "Active" (it ends at "Writing number issued").
- `contracting_status_history` already stores from/to status, an agent-visible message, an internal note, who changed it, and a timestamp — but writing-number, carrier-level, and advance changes are not recorded there.
- Agent-side activation only requires a writing number; carrier level, advance, and effective date are not part of it.
- Creating a request asks for a carrier and optional notes only — no confirmation of name, email, phone, NPN.
- No in-app notifications are created anywhere in the contracting-ops flow.

## 1. One status lane the agent and staff both read

Present exactly nine statuses everywhere: Requested, Invite Sent, Agent Action Needed, Submitted, Carrier Review, Approved, Active, Declined, Closed.

- Add two new values to the work-item status list (`invite_sent`, `active`) via migration, and relabel existing ones onto the nine (draft -> Requested, awaiting_agent / missing_information / missing_documents / nigo -> Agent Action Needed, carrier_reviewing -> Carrier Review, writing_number_issued -> Active).
- Legacy statuses stay valid in the database and keep mapping into the nine for display, so historical rows never render blank.
- Staff status picker offers only the nine.
- **Agent Action Needed requires an agent-visible note.** The status control refuses to submit without one, server-side too.

## 2. Assigning a carrier to an agent

The activate action (owner / contracting staff) requires: carrier, agent, carrier level *or* agency-position fallback, advance option, writing number, contract status; effective date when known. Missing pieces block the action with a plain message naming what is missing.

Compensation source is shown as a labelled line on the contract row and in the decision panel, one of:

- Agent-specific carrier level
- Agency position -> carrier level mapping
- Agency position percentage fallback

Carrier level and advance are agency-locked: regular agents see them read-only. The existing agent self-service activation is narrowed to reporting a writing number only, and it no longer sets levels or advance.

## 3. Agent request: confirm and go

The request dialog shows an active-carriers-only picker plus full name, email, phone, NPN prefilled from the profile. Missing or wrong values are editable inline and saved back to the profile on submit. No documents are required unless the agency configured a required item for that carrier.

## 4. Staff actions on a request

Review; send or record a SureLC invitation; record a direct carrier invitation; change status; request information; add an agent-visible note; add a private internal note; set writing number; assign carrier level; assign advance; activate. Each is one action in the request detail page, and each writes history.

## 5. Agent visibility and notifications

- My Contracts shows the current status and the latest agent-visible note prominently at the top of the affected carrier row, styled by urgency for Agent Action Needed.
- Every status change, new agent-visible note, or required-action change creates an in-app notification for the agent (existing `notifications` table, no email).

## 6. Complete history

Extend the history writer so status changes, agent-visible notes, internal notes, writing-number changes, carrier-level changes, and advance changes all land in `contracting_status_history` with the responsible staff member and timestamp, and render as one chronological timeline on the request detail page and (agent-visible entries only) in My Contracts.

## Technical notes

- Migration: add `invite_sent` and `active` to the `contracting_requests` status check constraint; add `change_kind`, `field`, `old_value`, `new_value` to `contracting_status_history`; keep existing rows valid.
- Status vocabulary and mapping live in `src/lib/contracting-ops/types.ts`; add a display map from the 17 legacy values to the nine.
- Server changes in `src/lib/contracting-ops.functions.ts` (staff actions, guards, history, notifications), `src/lib/contracting.functions.ts` (`activateContract` narrowing, request creation with profile confirm), `src/lib/contracting-ops/requested-level.ts` (compensation-source resolution returning an explicit source label).
- UI: `src/routes/_authenticated/contracting-ops/requests/$requestId.tsx` (decision panel, actions, timeline), `src/components/contracting/agent-contracting-tab.tsx` and the My Contracts view (status + note banner, read-only level/advance), `src/components/contracting/request-history.tsx` (timeline entries for the new change kinds).
