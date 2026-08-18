# Uplines can place their own downline, and open their profiles

Pranav has two agents under him (David Ladd, Jaden Selvaraj). He can see them on the roster but cannot set their position, and David's profile drawer comes up empty. I checked the live database and the code, and there are three separate causes.

## What is actually wrong

**1. The Position control is hidden from anyone who isn't an agency admin.**
The roster passes `canAssign={canManageRoles}` for every row, so Pranav gets a read-only pill. The server function already permits an upline to place their own downline — only the screen refuses.

**2. David's agency link is missing, which breaks the database's downline check.**
David's `organization_id` is null and he has no membership row (Jaden and Pranav both sit in the agency correctly). The database's `is_in_downline` walk only follows a child when the child's `organization_id` matches the upline's, so David is invisible to it. Two consequences:
- reading David's profile is refused → the drawer shows nothing ("can't pull up David's dashboard")
- the write policy on profiles refuses too, so even with the control shown the save would fail

**3. A downline agent can't read the agency's position ladder at all.**
The read policy on positions requires the *copied* `organization_id` column on the profile. Anyone whose copy is null (David) sees an empty ladder, so nothing you change on your end can appear on theirs. Positions are already a single shared per-agency list — once the read is fixed, updating a level on your end shows on theirs immediately.

## The fix

**Database migration**
- `is_in_downline`: follow the chain when the child's org is null or matches (inherit from the upline), instead of dropping the branch. Keeps the tenancy boundary for a child that genuinely belongs to a *different* agency.
- Positions read policy: allow anyone whose agency comes from membership, the profile column, or an upline in that agency — so every agent on the roster can see the ladder that prices their contract.
- One-time repair: for active profiles with a null `organization_id` whose upline has one, copy the agency down the chain and add the missing active membership row (this fixes David and anyone else in the same state).

**Roster (`team.tsx`)**
- Position becomes editable per row: an agency admin as today, plus an upline for anyone in their own downline. Everyone else still sees the read-only pill.
- The choices offered stay exactly what the server permits — positions below the upline's own (Pranav at Brokerage 60 can place someone on Training 50), the full active ladder for owners and level managers. A refusal from the server surfaces as its own message rather than a silent success.

**Agent drawer (`getAgentDetail`)**
- Confirm the caller is an agency admin or that the agent is in their downline via the same source the roster uses, then read the profile, contracts and policies so a missing agency column can no longer blank the drawer. Terminate/hide controls stay admin-only.

## Technical notes

- `checkAssignment` in `src/lib/team/position-assignment.ts` and `setAgentPosition` in `src/lib/team.functions.ts` already implement the upline rule and the rung ceiling — no rule changes there, just the UI gate and the RLS/data repair.
- The rung ceiling stays: an upline cannot place someone at or above their own position, matching what invitations already enforce.
- `scripts/position-assignment-check.ts` and `scripts/roster-check.ts` get cases for the upline path and for an agent with no agency column.
