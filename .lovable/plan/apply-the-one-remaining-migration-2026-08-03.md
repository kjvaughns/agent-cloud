# Apply the one remaining migration

## What I verified against the live database

| Migration file | Status |
|---|---|
| `20260803010000_recruiting-challenge-audience.sql` | **Not applied** — the live `seed_agent_challenges` has no `has_downline` check, so every agent still gets a recruiting goal |
| All earlier files (through `20260803000045`) | Applied and verified |
| `20260728100000_owner-consolidation.sql` | Still deliberately skipped — its section 4 deletes an account |

## Plan

Run one migration that replaces `public.seed_agent_challenges(uuid)`:

- Keep the three selling challenges (daily calls, weekly deals, monthly premium) exactly as they are.
- Seed the quarterly "Recruit 3 new agents this quarter" challenge only when the agent already has at least one downline profile whose status is not `inactive` or `terminated`.
- Leave existing challenge rows untouched — an in-progress quarter stays as it is and simply stops being re-seeded next quarter.

## After it applies

- Re-read the live function definition to confirm the `has_downline` gate is present.
- Confirm the row appears on the **DB Migrations** admin page.
- Run the typecheck. No app code changes are needed: the challenges panel reads whatever rows the function seeds.

## Technical notes

- `CREATE OR REPLACE FUNCTION` only; no table, column, policy or grant changes, so no new GRANTs are required and the statement is re-runnable.
- Nothing is deleted. The migration is behaviour-only.
- `supabase/migrations/PENDING.md` still lists this file; it is read-only to me, so that line needs deleting by hand afterwards. The safety script reads the live database first, so it will not report a false pending item.
