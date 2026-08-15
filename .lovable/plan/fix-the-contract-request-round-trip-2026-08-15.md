# Fix the contract request round trip

## What I verified

- Agent requests **are** reaching the ops table: the four carriers you just added (Newbridge, Guarantee Trust Life, Ethos, Combined) exist as requests on your agency in `draft`, which the Requests queue counts as open. The reason the tab looked broken is the crash we just fixed on that page — the inbox query asked for a column name that does not exist, so the screen went blank instead of listing them. That part is already working again.
- What is genuinely missing is the second half of the loop:
  - Every one of those four requests has **no requested level** recorded, because agent-side requests never look up the agent's position and attach it.
  - There is **no place for an admin to record the actual level the carrier put the contract at**. Approving a request writes the contract row and the writing number, but never writes the agent/carrier commission-level assignment that Post a Deal and the commission engine read. So even a fully approved request leaves the agent with no level.
  - "Set it to active" is only reachable indirectly (the writing-number-issued status), and it is not obvious from the request screen.

## What I'll build

**1. Requests carry the requested level**

When an agent clicks "I have a writing number" or "Request contracting", the request is created at the level their agency position maps to for that carrier. If the carrier has no matching level configured, the request records the position's default percentage instead of guessing a carrier level — the same strict matching rule already used on Levels & Positions. Requested level then shows on the queue row and the request detail.

**2. A decision panel for the admin: level + writing number + activate**

On the request detail (Contracting → Requests → open a request), staff and agency owners get one "Record carrier decision" block:

- **Level granted** — pick from that carrier's configured comp levels, or enter a percentage when the carrier's ladder does not have it. Pre-filled with what the agent requested.
- **Writing number** — optional at approval, required to activate.
- **Action** — Approve (paperwork cleared) or Approve & activate (carrier issued the number).

Saving writes, in one server action: the request status and history, the agent's commission-level assignment (real level, no longer pending), the contract record (active on activation), and the authoritative writing number. That is the piece that makes the agent's Contracts page, dashboard commissions and Post a Deal agree with what the admin decided.

**3. Request more information, with a reason**

The existing "Request missing information" button gets a short message box so the agent is told what is actually needed, and the request moves to a waiting-on-agent state visible on the agent's own contracts page.

**4. Agent side reflects it**

The agent's My Contracts row shows the request state, the level once granted, and any outstanding "we need X from you" message.

## Technical notes

- `src/lib/contracting.functions.ts` — `addAgentCarrier` and `createContractRequest` resolve the caller's agency level and map it to `carrier_comp_levels` for that `org_carrier` (strict match via `autoMatchLevel`), setting `requested_comp_level_id` / `requested_advance_level` on the created `contracting_requests` row. Level resolution moves into the shared `assignInviteCarriers` path so invites and self-serve requests behave identically.
- `src/lib/contracting-ops.functions.ts` — extend the status action (or add a sibling `recordCarrierDecision`) with `granted_comp_level_id`, `granted_pct` and `writing_number`; on `approved` / `writing_number_issued` upsert `agent_commission_levels` (`assigned_pct`, `commission_level`, `writing_number`, `pending: false`, `status: 'active'`, `organization_id`) alongside the existing `syncContractRecord` and `writing_numbers` writes. Permission stays `canApprove || canSubmit`; audit and agent notification unchanged.
- `src/routes/_authenticated/contracting-ops/requests/$requestId.tsx` — new decision panel; carrier level options from the packet's comp levels; message field on the missing-information action.
- `src/routes/_authenticated/contracting-ops/requests/index.tsx` — show requested vs granted level on the row.
- `src/routes/_authenticated/contracting/index.tsx` — surface request status, granted level and outstanding-info message on My Contracts.
- No schema change needed: `agent_commission_levels` already has `assigned_pct`, `commission_level`, `writing_number`, `pending`, `status`, `organization_id`.
