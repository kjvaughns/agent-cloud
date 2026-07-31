# Migration status page + the remaining migrations

## What I verified against the live database

| Item | Status |
|---|---|
| `invite-acceptances` | **Not applied** — `invite_acceptances` table does not exist |
| `assigned` contract status | **Not applied** — the `contract_status` enum has only requested, submitted, processing, issue, active, rejected |
| `contracting-ops-requests` | Already applied in full — all nine sections exist (requests, requested states, documents, status history, writing numbers, carrier hierarchies, hierarchy change requests + approvals, triggers), with grants, RLS and exactly one status-log trigger |

So two of the three still need to run; the contracting-ops one is done.

## Plan

1. **One migration** containing:
   - `invite_acceptances` (invitation link, profile, accepted_at, unique per link+person), its index, RLS with the read policy from the file (you can see your own acceptance; the link creator sees theirs), and the grants the original file omits (`select` to `authenticated`, `all` to `service_role`) — without them the Data API cannot reach the table.
   - The `assigned` value added to `contract_status`, ahead of `requested`.
   - A read-only `list_applied_migrations()` security-definer function that returns version + name from the internal migration log, callable only by admins (checked inside the function with the existing role helper). The app roles cannot read that schema directly, so the page needs this function.
2. **New admin page** at `/admin/migrations`: a simple table of every applied migration — version timestamp (formatted), name, and a relative "when" — newest first, with a count and a search box. Admin-only, reached from the existing admin navigation. It reads through a server function that calls the new database function.
3. After it applies: regenerate types, typecheck, and confirm the page lists the newest entries including the two just applied.

## Then the invite test

Once `invite_acceptances` is live, the reusable-invite flow is worth exercising end to end: open a shared invite link as a second agent, confirm a second acceptance row is written rather than overwriting the first, and confirm the link no longer resumes mid-wizard for later users. Say the word and I'll run that after the migration lands.

## Technical notes

- Both statements are additive and idempotent (`create table if not exists`, enum guard on `pg_enum`), so re-running is safe.
- Enum value additions cannot share a transaction with statements that use the new value; the migration adds the value only, no data changes.
- The migrations page never executes SQL — it is a read-only view.
